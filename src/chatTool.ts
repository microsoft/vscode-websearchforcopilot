import { CancellationToken, LanguageModelTool, LanguageModelToolInvocationOptions, LanguageModelToolResult, workspace } from "vscode";
import { SearchEngineManager } from "./search/webSearch";
import { findNaiveChunksBasedOnQuery } from "./webChunk/chunkSearch";

interface WebSearchToolParameters {
    query: string;
    api_key: string;
}

export class WebSearchTool implements LanguageModelTool<WebSearchToolParameters> {
    static ID = 'vscode-websearchparticipant_webSearch';

    async invoke(options: LanguageModelToolInvocationOptions<WebSearchToolParameters>, token: CancellationToken): Promise<LanguageModelToolResult> {
        const results = await SearchEngineManager.search(options.parameters.query);

        if (workspace.getConfiguration('websearch').get<boolean>('useSearchResultsDirectly')) {
            return {
                'text/plain': `Here is the response from the search engine:\n${JSON.stringify(results)}`
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
            'text/plain': `Here is some relevent context from webpages across the internet:\n ${JSON.stringify(chunks)}`
        };
    }
}
