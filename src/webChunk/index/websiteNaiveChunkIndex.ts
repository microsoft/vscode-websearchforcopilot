import { window, ProgressLocation, Uri, CancellationToken } from "vscode";
import { naiveChunk } from "../chunker/chunker";
import { crawl, scrape } from "../crawler/webCrawler";
import { FileChunk, getDocumentFromPage } from "../utils";
import { EmbeddingsCache, EmbeddingsIndex } from "./embeddings";

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
        const embeddingsIndex = new EmbeddingsIndex(this.embeddingsCache);

        for (const url of this._urls) {
            let result = await window.withProgress(
                {
                    location: ProgressLocation.Notification,
                    title: `Crawling, Indexing, and Chunking ${url}`
                },
                async (_) => {
                    const result = this._crawl ? await crawl(url) : [await scrape(url)];
                    return result;
                }
            );


            const docs = new Array<FileChunk>;
            for (const page of result) {
                const vscodeUri = Uri.parse(page.url);
                const document = getDocumentFromPage(page);
                const fileChunks = new Array<FileChunk>();

                const naiveChunks = naiveChunk(document, 400);
                for (const chunk of naiveChunks) {
                    fileChunks.push({
                        file: vscodeUri,
                        text: chunk,
                    } satisfies FileChunk);
                }
                docs.push(...fileChunks);
            }
            embeddingsIndex.add(docs);
        }
        return embeddingsIndex;
    }

}