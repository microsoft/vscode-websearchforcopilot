import { CancellationToken, LanguageModelTool, LanguageModelToolInvocationOptions, LanguageModelToolResult, workspace } from "vscode";
import { TavilyEngine } from "./search/webSearch";
import { findNaiveChunksBasedOnQuery } from "./webChunk/chunkSearch";

interface PublicWebSearchToolParameters {
    query: string;
    api_key: string;
}

export class PublicWebSearchTool implements LanguageModelTool<PublicWebSearchToolParameters> {
    static ID = 'vscode-websearchparticipant_publicWebSearch';

    async invoke(options: LanguageModelToolInvocationOptions<PublicWebSearchToolParameters>, token: CancellationToken): Promise<LanguageModelToolResult> {
        const results = await TavilyEngine.search(options.parameters.query);

        if (workspace.getConfiguration('websearch').get<boolean>('useSearchResultsDirectly')) {
            return {
                'text/plain': `Here is the response from the search engine:\n${JSON.stringify(results)}`
            };
        }

        const urls = results.urls.map(u => u.url);
        const chucks = await findNaiveChunksBasedOnQuery(
            urls,
            options.parameters.query,
            {
                tfidf: false,
                crawl: false,
            },
            token
        );

        return {
            'text/plain': `Here is some relevent context from webpages across the internet:\n ${JSON.stringify(chucks)}`
        };
    }
}
