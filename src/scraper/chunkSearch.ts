import { getDocumentFromPage, WebsiteIndex, sectionToString } from "./websiteBasicIndex";
import { WebsiteTFIDFNaiveChunkIndex, WebsiteEmbeddingsNaiveChunkIndex } from "./websiteNaiveChunkIndex";
import * as vscode from 'vscode';

// todo: ideally, the index persists across queries.
export async function findBasicChunksBasedOnQuery(url: string, query: string, maxResults = 5) {

    const index = new WebsiteIndex(url);

    return await index.search(query, maxResults);
}

export async function findNaiveChunksBasedOnQuery(url: string, query: string, tfidf: boolean, maxResults = 5) {
    const index = tfidf ? new WebsiteTFIDFNaiveChunkIndex(url) : new WebsiteEmbeddingsNaiveChunkIndex(url);

    return await index.search(query, maxResults);
}