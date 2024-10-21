/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { WebsiteEmbeddingsNaiveChunkIndex } from './index/websiteNaiveChunkIndex';
import { EmbeddingsCache } from './index/embeddings';

export async function findNaiveChunksBasedOnQuery(
    urls: string[],
    query: string,
    embeddingsCache: EmbeddingsCache,
    { maxResults, crawl }: { maxResults?: number, crawl: boolean },
    token?: vscode.CancellationToken,
) {
    const index = new WebsiteEmbeddingsNaiveChunkIndex(urls, embeddingsCache, crawl);

    const result = await index.search(query, maxResults ?? 5, token);

    // Convert the result to a string (assuming result is an array or object)
    const resultString = JSON.stringify(result, null, 2);


    const document = await vscode.workspace.openTextDocument({
        language: 'plaintext', // You can specify the language mode here
        content: resultString
    });

    // Show the new text document in the editor
    await vscode.window.showTextDocument(document);

    return result;
}
