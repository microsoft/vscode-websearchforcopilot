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

    return await index.search(query, maxResults ?? 5, token);
}
