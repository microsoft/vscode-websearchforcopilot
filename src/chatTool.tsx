/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken, l10n, LanguageModelPromptTsxPart, LanguageModelTextPart, LanguageModelTool, LanguageModelToolInvocationOptions, LanguageModelToolInvocationPrepareOptions, LanguageModelToolResult, PreparedToolInvocation, ProviderResult, Uri, workspace } from "vscode";
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
import { TextChunk } from "@vscode/prompt-tsx/dist/base/promptElements";
import { EmbeddingsCache, RateLimitReachedError } from "./webChunk/index/embeddings";
import Logger from "./logger";

export interface WebSearchToolParameters {
    query: string;
}

interface WebSearchToolProps extends BasePromptElementProps {
    chunks: FileChunk[];
}

export class WebSearchTool implements LanguageModelTool<WebSearchToolParameters> {
    static ID = 'vscode-websearchforcopilot_webSearch';

    constructor(private _embeddingsCache: EmbeddingsCache) { }
    prepareInvocation(options: LanguageModelToolInvocationPrepareOptions<WebSearchToolParameters>, token: CancellationToken): ProviderResult<PreparedToolInvocation> {
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
                // patch the urls with the snippets
                for (const chunk of chunks) {
                    chunk.file = this.addHighlightFragment(chunk.file, chunk.text);
                }
            } catch (e) {
                if (e instanceof RateLimitReachedError) {
                    Logger.error(e.message);
                }
                // use the search results directly
                chunks = this.toFileChunks(results);
            }
        }

        const promptTsxResult = await renderElementJSON(
            WebToolCalls,
            { chunks },
            options.tokenizationOptions,
            token
        );
        return new LanguageModelToolResult([
            new LanguageModelTextPart(`Here is some relevent context from webpages across the internet:\n${JSON.stringify(chunks)}`),
            new LanguageModelPromptTsxPart(promptTsxResult)
        ]);
    }

    toFileChunks(webResults: IWebSearchResults): FileChunk[] {
        return webResults.urls.map((url) => {
            return {
                file: this.addHighlightFragment(Uri.parse(url.url), url.snippet),
                text: `TITLE: ${url.title}\nSNIPPET:${url.snippet}`,
            };
        });
    }

    /**
     * Adds the scroll-to-text fragment to the uri if possible. This uses the following format:
     * `:~:text=<prefix>,<suffix>` where `<prefix>` and `<suffix>` are the first and last few words of the text to highlight and scroll to.
     * 
     * @link https://github.com/WICG/scroll-to-text-fragment
     * @param file The uri to add the fragment to
     * @param text The text to add to the fragment
     * @returns A new instance of the uri with the fragment added
     */
    addHighlightFragment(file: Uri, text: string | undefined): Uri {
        if (file.fragment || !text) {
            // We don't want to stomp the existing fragment
            return file;
        }

        // First split by commas and newlines to make the text easier to turn into the format
        const splitSnippet = text.split(/[,\r\n]/);
        // Grab the first few words of the first non-empty array element
        const firstWords = splitSnippet.find(snippet => snippet.trim() !== '')?.split(' ').slice(0, 5).join(' ');
        if (!firstWords) {
            return file;
        }
        // Grab the last few words of the last non-empty array element
        const lastWords = splitSnippet.reverse().find(snippet => snippet.trim() !== '')?.split(' ').slice(-5).join(' ');
        // Combine the first and last words with a comma if both exist, otherwise just use the first words
        const fragment = lastWords ? `${firstWords},${lastWords}` : firstWords;
        // Finally update the uri with the fragment
        return file.with({ fragment: `:~:text=${fragment}` });
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
