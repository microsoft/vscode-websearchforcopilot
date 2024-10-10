import { CancellationToken, LanguageModelTool, LanguageModelToolInvocationOptions, LanguageModelToolResult, workspace, lm } from "vscode";
import { SearchEngineManager } from "./search/webSearch";
import { findNaiveChunksBasedOnQuery } from "./webChunk/chunkSearch";
import {
    AssistantMessage,
    BasePromptElementProps,
    PromptElement,
    PromptSizing,
    contentType as promptTsxContentType,
    renderElementJSON,
    renderPrompt,
    UserMessage,
} from '@vscode/prompt-tsx';
import { ToolCall } from "./chatToolPrompt";
import { FileChunk } from "./webChunk/utils";


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

        if (workspace.getConfiguration('websearch').get<boolean>('useSearchResultsDirectly')) {
            return {
                ['text/plain']: `Here is the response from the search engine:\n${JSON.stringify(results)}`
            };
        }

        const urls = results.urls.map(u => u.url);
        const chunks = await findNaiveChunksBasedOnQuery(
            urls,
            options.parameters.query,
            {
                tfidf: false,
                crawl: false,
            },
            token
        );

        return {
            ['text/plain']: `Here is some relevent context from webpages across the internet:\n ${JSON.stringify(chunks)}`,
            [promptTsxContentType]: await renderElementJSON(
                WebToolCalls,
                {
                    chunks: chunks,
                },
                {
                    tokenBudget: options.tokenOptions!.tokenBudget,
                    countTokens: options.tokenOptions!.countTokens,
                },
                token
            )
        };
    }
}

class WebToolCalls extends PromptElement<WebSearchToolProps, void> {
    render(state: void, sizing: PromptSizing) {
        return <>
            {
                this.props.chunks.map((chunk) => {
                    return <>
                        <UserMessage>{chunk.text}</UserMessage>
                    </>;
                })
            }
            <UserMessage priority={100}> Above is the result of calling one or more tools.The user cannot see the results, so you should explain them to the user if referencing them in your answer.</UserMessage>
        </>;
    }
}

{/* <UserMessage name="Chunk URI">{chunk.text}</UserMessage> */}
{/* <UserMessage name="Chunk Text">{chunk.file.toString()}</UserMessage> */}
