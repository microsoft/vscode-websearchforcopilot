import * as vscode from 'vscode';
import { WebsiteIndex } from './index/websiteBasicIndex';
import { WebsiteTFIDFNaiveChunkIndex, WebsiteEmbeddingsNaiveChunkIndex } from './index/websiteNaiveChunkIndex';

// todo: ideally, the index persists across queries.
export async function findBasicChunksBasedOnQuery(url: string, query: string, maxResults = 5) {
    const index = new WebsiteIndex(url);

    return await index.search(query, maxResults);
}

export async function findNaiveChunksBasedOnQuery(
    urls: string[],
    query: string,
    { tfidf, maxResults, crawl }: { tfidf: boolean, maxResults?: number, crawl: boolean },
    token?: vscode.CancellationToken,
) {
    const index = tfidf ? new WebsiteTFIDFNaiveChunkIndex(urls, crawl) : new WebsiteEmbeddingsNaiveChunkIndex(urls, crawl);

    return await index.search(query, maxResults ?? 5, token);
}

export interface IChunkedWebContentToolParameters {
    query: string;
    urls: string;
}

export class ChunkedWebContentTool implements vscode.LanguageModelTool<IChunkedWebContentToolParameters> {
    static ID = 'vscode-websearchparticipant_chunkedWebContent';

    static DETAILS: vscode.LanguageModelChatTool = {
        name: ChunkedWebContentTool.ID,
        description: 'Gets the relevant chunks from certain websites based on a query',
        parametersSchema: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Search for content on these websites based on this query"
                },
                urls: {
                    type: "string",
                    description: "The URLs to search for content on, separated by commas"
                }
            },
            required: ["query", "urls"]
        },
    };

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<IChunkedWebContentToolParameters>,
        token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const urls = options.parameters.urls.split(',').map(s => s.trim()).filter(s => s.length > 0);
        const chunks = await findNaiveChunksBasedOnQuery(
            urls,
            options.parameters.query,
            {
                tfidf: false,
                crawl: true
            },
            token
        );

        const ret = chunks?.flatMap(c => c ? [
            c.file.toString(),
            '',
            c.text,
            '',
            '-------------------',
        ] : []).join('\n');

        return {
            "text/plain": ret
        };
    }

}
