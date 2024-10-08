import { CancellationToken, Memento, ProgressLocation, Uri, window } from "vscode";
import { TfIdf, TfIdfDoc } from "./tfidf";
import { Page, Section, crawl } from "./webCrawler";
import { FileChunk } from "./utils";
import { naiveChunk } from "../chunker/chunker";

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
    ) {
        this._loadPromise = this._load();
    }

    async search(query: string, maxResults: number): Promise<IWebChunk[]> {
        const tfidf = await this._loadPromise;
        const score = tfidf.search([query], maxResults);
        return score;
    }

    async refresh() {
        this._loadPromise = this._load();
    }

    private async _load() {
        let  result = await window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: `Crawling & Indexing ${this._url}`
            },
            async (_) => {
                const result = await crawl(this._url);
                return result;
            }
        );
        

        const tfidf = new TfIdf<IWebChunk>();
        // Load TF-IDF
        const tfidfDocs = new Array<TfIdfDoc<IWebChunk>>;
        for (const page of result) {
            const vscodeUri = Uri.parse(page.url);
            const sections = new Array<IWebChunk>();
            for (const section of page.sections) {
                const chunk: IWebChunk = {
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

    public async getAllChunks(): Promise<Page[]> {
        const tfidf = await this._loadPromise;
        const pages: Page[] = [];

        for (const [uri, value] of tfidf.documents) {
            pages.push({
                url: uri.toString(),
                sections: value.chunks.map(chunk => ({
                    heading: chunk.heading,
                    content: chunk.text
                }))
            });
        }
        return pages;
    }
}


export class WebsiteNaiveChunkIndex {
    private _loadPromise: Promise<TfIdf<FileChunk>>;
    
    constructor(
        private _url: string, 
    ) {
        this._loadPromise = this._load();
    }

    async search(query: string, maxResults: number): Promise<FileChunk[]> {
        const tfidf = await this._loadPromise;
        const score = tfidf.search([query], maxResults);
        return score;
    }

    async refresh() {
        this._loadPromise = this._load();
    }

    private async _load() {
        let result = await window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: `Crawling, Indexing, and Chunking ${this._url}`
            },
            async (_) => {
                const result = await crawl(this._url);
                return result;
            }
        );
        

        const tfidf = new TfIdf<FileChunk>();
        
        // Load TF-IDF
        const tfidfDocs = new Array<TfIdfDoc<FileChunk>>;
        for (const page of result) {
            const vscodeUri = Uri.parse(page.url);
            const document = getDocumentFromPage(page);
            const sections = new Array<FileChunk>();

            const naiveChunks = naiveChunk(document, 400);
            for (const chunk of naiveChunks) {
                sections.push({
                    file: vscodeUri,
                    text: chunk,
                });
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

}

export function getDocumentFromPage(page: Page):string {
    const strBuffer:string[] = [page.url, ''];

    for(const p of page.sections) {
        strBuffer.push(...sectionToString(p));
    }

    return strBuffer.join('\n');
}


export function sectionToString(section: Section): string[] {
    const strBuffer:string[] = [];
    strBuffer.push(`# ${section.heading}`);
    strBuffer.push(section.content);
    strBuffer.push(`\n`);
    return strBuffer;

}
