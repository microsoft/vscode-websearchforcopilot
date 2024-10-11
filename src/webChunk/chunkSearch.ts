/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { WebsiteEmbeddingsNaiveChunkIndex } from './index/websiteNaiveChunkIndex';
import { EmbeddingsCache } from './index/embeddings';

const embeddingsCache = new EmbeddingsCache();
export async function findNaiveChunksBasedOnQuery(
    urls: string[],
    query: string,
    { maxResults, crawl }: { maxResults?: number, crawl: boolean },
    token?: vscode.CancellationToken,
) {
    const index = new WebsiteEmbeddingsNaiveChunkIndex(urls, embeddingsCache, crawl);

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
