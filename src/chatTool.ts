import { CancellationToken, LanguageModelTool, LanguageModelToolInvocationOptions, LanguageModelToolInvocationPrepareOptions, LanguageModelToolResult, lm, PreparedToolInvocation, ProviderResult } from "vscode";
import { getInternalTool } from "./tools";
import { TavilyEngine } from "./search/webSearch";
import { IWebSearchToolParameters } from "./search/webSearchTypes";
import { scrape } from "./webChunk/crawler/webCrawler";
import { findNaiveChunksBasedOnQuery } from "./webChunk/chunkSearch";

interface PublicWebSearchToolParameters {
    query: string;
    api_key: string;
}

export class PublicWebSearchTool implements LanguageModelTool<PublicWebSearchToolParameters> {
    static ID = 'vscode-websearchparticipant_publicWebSearch';

    async invoke(options: LanguageModelToolInvocationOptions<PublicWebSearchToolParameters>, token: CancellationToken): Promise<LanguageModelToolResult> {
        const results = await TavilyEngine.search(options.parameters.query);

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

        // TODO: Have the language model take in the result of the internal tool and run other internal tools
        // const models = await lm.selectChatModels({
        //     vendor: 'copilot',
        //     family: 'gpt-4o'
        // });
        // const model = models[0];
        return {
            'plain/text': JSON.stringify(chucks)
        };
    }
}
