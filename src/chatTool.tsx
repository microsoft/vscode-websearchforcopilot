/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken, l10n, LanguageModelTool, LanguageModelToolInvocationOptions, LanguageModelToolInvocationPrepareOptions, LanguageModelToolResult, PreparedToolInvocation, ProviderResult, workspace } from "vscode";
import { SearchEngineManager } from "./search/webSearch";
import { findNaiveChunksBasedOnQuery } from "./webChunk/chunkSearch";
import {
    BasePromptElementProps,
    PrioritizedList,
    PromptElement,
    PromptReference,
    PromptSizing,
    contentType as promptTsxContentType,
    renderElementJSON
} from '@vscode/prompt-tsx';
import { FileChunk } from "./webChunk/utils";
import { IWebSearchResults } from "./search/webSearchTypes";
import { URI } from "@vscode/prompt-tsx/dist/base/util/vs/common/uri";
import { TextChunk } from "@vscode/prompt-tsx/dist/base/promptElements";
import { EmbeddingsCache, RateLimitReachedError } from "./webChunk/index/embeddings";
import Logger from "./logger";

export interface WebSearchToolParameters {
    query: string;
    // HACK: This is a temporary workaround to allow the tool to access the chat response stream
    toolInvocationToken: unknown;
}

interface WebSearchToolProps extends BasePromptElementProps {
    chunks: FileChunk[];
}

export class WebSearchTool implements LanguageModelTool<WebSearchToolParameters> {
    static ID = 'vscode-websearchparticipant_webSearch';

    constructor(private _embeddingsCache: EmbeddingsCache) { }
    prepareToolInvocation(options: LanguageModelToolInvocationPrepareOptions<WebSearchToolParameters>, token: CancellationToken): ProviderResult<PreparedToolInvocation> {
        return {
            invocationMessage: l10n.t("Searching the web for '{0}'", options.parameters.query)
        };
    }

    async invoke(options: LanguageModelToolInvocationOptions<WebSearchToolParameters>, token: CancellationToken): Promise<LanguageModelToolResult> {
        const results = await SearchEngineManager.search(options.parameters.query);

        let chunks: FileChunk[];
        if (workspace.getConfiguration('websearch').get<boolean>('useSearchResultsDirectly')) {
            chunks = this.toFileChunks(results);
        } else {
            const urls = results.urls.map(u => u.url);
            try {
                chunks = await findNaiveChunksBasedOnQuery(
                    urls,
                    options.parameters.query,
                    this._embeddingsCache,
                    {
                        crawl: false,
                    },
                    token
                );
            } catch (e) {
                if (e instanceof RateLimitReachedError) {
                    Logger.error(e.message);
                }
                // use the search results directly
                chunks = this.toFileChunks(results);
            }
        }
        const response: LanguageModelToolResult = {};
        for (const contentType of options.requestedContentTypes) {
            switch (contentType) {
                case 'text/plain':
                    response['text/plain'] = `Here is some relevent context from webpages across the internet:\n${JSON.stringify(chunks)}`;
                    break;
                case promptTsxContentType:
                    response[promptTsxContentType] = await renderElementJSON(
                        WebToolCalls,
                        { chunks },
                        options.tokenOptions,
                        token
                    );
            }
        }

        return response;
    }

    toFileChunks(webResults: IWebSearchResults): FileChunk[] {
        return webResults.urls.map((url) => {
            return {
                file: URI.parse(url.url),
                text: `TITLE: ${url.title}\nSNIPPET:${url.snippet}`,
            };
        });
    }
}

class WebToolCalls extends PromptElement<WebSearchToolProps, void> {
    render(state: void, sizing: PromptSizing) {
        return <>
            <TextChunk>Here is some relevent context from webpages across the internet:</TextChunk>
            <references value={this.props.chunks.map(c => (new PromptReference(c.file)))}></references>
            <PrioritizedList priority={100} descending={true}>
                {
                    this.props.chunks.map(chunk => <TextChunk>{chunk.text}</TextChunk>)
                }
            </PrioritizedList>
        </>;
    }
}

{/* <UserMessage name="Chunk URI">{chunk.text}</UserMessage> */ }
{/* <UserMessage name="Chunk Text">{chunk.file.toString()}</UserMessage> */ }
