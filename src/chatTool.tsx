import { CancellationToken, LanguageModelTool, LanguageModelToolInvocationOptions, LanguageModelToolResult, workspace } from "vscode";
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

interface WebSearchToolParameters {
    query: string;
    api_key: string;
}

interface WebSearchToolProps extends BasePromptElementProps {
    chunks: FileChunk[];
}

export class WebSearchTool implements LanguageModelTool<WebSearchToolParameters> {
    static ID = 'vscode-websearchparticipant_webSearch';

    async invoke(options: LanguageModelToolInvocationOptions<WebSearchToolParameters>, token: CancellationToken): Promise<LanguageModelToolResult> {
        const results = await SearchEngineManager.search(options.parameters.query);

        let chunks: FileChunk[];
        if (workspace.getConfiguration('websearch').get<boolean>('useSearchResultsDirectly')) {
            chunks = this.toFileChunks(results);
        } else {
            const urls = results.urls.map(u => u.url);
            chunks = await findNaiveChunksBasedOnQuery(
                urls,
                options.parameters.query,
                {
                    crawl: false,
                },
                token
            );
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
            <references value={this.props.chunks.map(c => (PromptReference.fromJSON({ anchor: c.file.toJSON() })))}></references>
            <PrioritizedList priority={100} descending={true}>
            {
                this.props.chunks.map(chunk => <TextChunk>{chunk.text}</TextChunk>)
            }
            </PrioritizedList>
        </>;
    }
}

{/* <UserMessage name="Chunk URI">{chunk.text}</UserMessage> */}
{/* <UserMessage name="Chunk Text">{chunk.file.toString()}</UserMessage> */}
