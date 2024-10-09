import { getDocumentFromPage, WebsiteIndex, sectionToString } from "./websiteBasicIndex";
import { WebsiteTFIDFNaiveChunkIndex, WebsiteEmbeddingsNaiveChunkIndex } from "./websiteNaiveChunkIndex";
import * as vscode from 'vscode';

// todo: ideally, the index persists across queries.
export async function findBasicChunksBasedOnQuery(url: string, query: string, maxResults = 5) {
    const index = new WebsiteIndex(url);

    return await index.search(query, maxResults);
}

export async function findNaiveChunksBasedOnQuery(urls: string[], query: string, tfidf: boolean, token?: vscode.CancellationToken, maxResults = 5) {
    const index = tfidf ? new WebsiteTFIDFNaiveChunkIndex(urls) : new WebsiteEmbeddingsNaiveChunkIndex(urls);

    return await index.search(query, maxResults, token);
}

export interface IChunkSearchToolParameters {
    query: string;
    urls: string[];
}

export class ChunkSearchTool implements vscode.LanguageModelTool<IChunkSearchToolParameters> {
    static ID = 'vscode-websearchparticipant_chunksearch';

    static DETAILS: vscode.LanguageModelChatTool = {
        name: ChunkSearchTool.ID,
        description: 'Gets the relevant chunks from certain websites based on a query',
        parametersSchema: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Search for content on these websites based on this query"
                },
                urls: {
                    type: "array",
                    description: "The URLs to search for content on"
                }
            },
            required: ["query", "urls"]
        },
    };

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<IChunkSearchToolParameters>,
        token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const chunks = await findNaiveChunksBasedOnQuery(options.parameters.urls, options.parameters.query, false, token);

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
