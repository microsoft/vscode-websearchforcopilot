import { CancellationToken, Memento, ProgressLocation, Uri, window } from "vscode";
import { TfIdf, TfIdfDoc } from "./tfidf";
import { Page, crawl } from "./webCrawler";
import { FileChunk } from "./utils";

export interface IWebChunk extends FileChunk {
    heading: string;
}

export interface IWebsiteIndex {
    search(query: string, maxResults: number, token: CancellationToken): Promise<IWebChunk[]>;
}

export class WebsiteIndex implements IWebsiteIndex {
    private _loadPromise: Promise<TfIdf<IWebChunk>>;
    
    constructor(
        private _url: string, 
        // private storage: Memento
    ) {
        this._loadPromise = this._load();
    }

    async search(query: string, maxResults: number, token: CancellationToken): Promise<IWebChunk[]> {
        const tfidf = await this._loadPromise;
        const score = tfidf.search([query], maxResults);
        return score;
    }

    async refresh() {
        await this._saveToCache(undefined);
        this._loadPromise = this._load();
    }

    private async _load() {
        let result = this._loadFromCache();
        if (!result) {
            result = await window.withProgress(
                {
                    location: ProgressLocation.Notification,
                    title: `Crawling & Indexing ${this._url}`
                },
                async (progress) => {
                    const result = await crawl(this._url);
                    await this._saveToCache(result);
                    return result;
                }
            );
        }

        const tfidf = new TfIdf<IWebChunk>();
        // Load TF-IDF
        const tfidfDocs = new Array<TfIdfDoc<IWebChunk>>;
        for (const page of result) {
            const vscodeUri = Uri.parse(page.url);
            const sections = new Array<IWebChunk>();
            for (const section of page.sections) {
                const chunk: IWebChunk & { heading: string } = {
                    file: vscodeUri,
                    text: section.content,
                    heading: section.heading
                };
                sections.push(chunk);
            }
            const tfidfDoc = {
                uri: vscodeUri,
                chunks: sections
            };
            tfidfDocs.push(tfidfDoc);
        }
        tfidf.addOrUpdate(tfidfDocs);
        return tfidf;
    }

    private _loadFromCache():Page[] | undefined {
        // return this.storage.get<Page[]>(this._url);
        return undefined;
    }

    private _saveToCache(result: Page[] | undefined) {
        // return this.storage.update(this._url, result);
    }
}