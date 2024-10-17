/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Uri, CancellationToken } from "vscode";
import { naiveChunk } from "../chunker/chunker";
import { crawl, scrape } from "../crawler/webCrawler";
import { FileChunk, getDocumentFromPage, ResourceMap } from "../utils";
import { EmbeddingsCache, EmbeddingsIndex, FileChunkWithScorer } from "./embeddings";

const CHUNK_SIZE = 600;

export class WebsiteEmbeddingsNaiveChunkIndex {
    private _loadPromise: Promise<EmbeddingsIndex>;

    constructor(
        private _urls: string[],
        private embeddingsCache: EmbeddingsCache,
        private _crawl: boolean
    ) {
        this._loadPromise = this._load();
    }

    async search(query: string, maxResults: number, token?: CancellationToken): Promise<FileChunk[]> {
        const embeddingsIndex = await this._loadPromise;
        const score = embeddingsIndex.search(query, maxResults);
        return score;
    }

    async refresh() {
        this._loadPromise = this._load();
    }

    private async _load() {
        const urlRankMap = new ResourceMap<number>();
        this._urls.map((url, i) => urlRankMap.set(Uri.parse(url), i));
        const embeddingsIndex = new EmbeddingsIndex(this.embeddingsCache, urlRankMap);

        for (let i = 0; i < this._urls.length; i++) {
            const url = this._urls[i];
            let result = this._crawl ? await crawl(url) : [await scrape(url)];

            const docs = new Array<FileChunkWithScorer>;
            for (const page of result) {
                const vscodeUri = Uri.parse(page.url);
                const document = getDocumentFromPage(page);
                const fileChunks = new Array<FileChunkWithScorer>();

                const naiveChunks = naiveChunk(document, CHUNK_SIZE);
                for (const chunk of naiveChunks) {
                    fileChunks.push({
                        file: vscodeUri,
                        text: chunk,
                        scoreBonus: calculateURLBoost(i),
                    } satisfies FileChunkWithScorer);
                }
                docs.push(...fileChunks);
            }
            embeddingsIndex.add(docs);
        }
        return embeddingsIndex;
    }

}

function calculateURLBoost(rank: number): number {
    return (1 / (10 + rank));
}
