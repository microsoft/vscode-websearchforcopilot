/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { FileChunk, ResourceMap } from "../utils";
import * as vscode from 'vscode';
import { isUnexpected } from "@azure-rest/ai-inference";
import ModelClient from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";
import { tokenLength } from "../tokenizer";
import Logger from "../../logger";

export type Embedding = readonly number[];
type FileChunkWithEmbeddings = [FileChunkWithScorer, Embedding];
import * as fs from 'fs';
const modelName = "text-embedding-3-small";
const endpoint = "https://models.inference.ai.azure.com";

// taken from stackoverflow : )
// https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript
function stringHash(str: string): number {
    var hash = 0,
        i, chr;
    if (str.length === 0) {
        return hash;
    }
    for (i = 0; i < str.length; i++) {
        chr = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
}

export interface FileChunkWithScorer extends FileChunk {
    scoreBonus: number;
}
interface OnDiskEmbedding {
    lastUsed: Date;
    embedding: Embedding;
}

export class EmbeddingsCache {
    private _loadPromise: Promise<void>;
    private _saveCacheSerializer: Promise<void> | undefined;
    private _cacheFile: vscode.Uri;
    constructor(private extensionDir: vscode.Uri) {
        this._cacheFile = this.extensionDir.with({ path: this.extensionDir.path + '/cached-embeddings.json' });
        this._loadPromise = this.load();

    }

    public async initCache(): Promise<void> {
        return this._loadPromise;
    }

    public async saveCache(): Promise<void> {

        this._evictOldEntries();
        const doCacheSave = async () => {
            await this.save();
            Logger.info('Embeddings cache saved');
        };
        if (this._saveCacheSerializer) {
            this._saveCacheSerializer = this._saveCacheSerializer.then(doCacheSave);
        }

        this._saveCacheSerializer = doCacheSave();
        return this._saveCacheSerializer;
    }

    private cache: Map<number, OnDiskEmbedding> = new Map<number, OnDiskEmbedding>();

    public get(chunk: string): Embedding | undefined {
        const entry = this.cache.get(stringHash(chunk));
        if (entry) {
            entry.lastUsed = new Date();
            return entry.embedding;
        }

        return undefined;
    }

    public set(chunk: string, embedding: Embedding) {
        this.cache.set(stringHash(chunk), { embedding, lastUsed: new Date() });
    }
    public async load(): Promise<void> {
        try {
            const file = (await fs.promises.readFile(this._cacheFile.fsPath)).toString();
            const cache = JSON.parse(file);
            for (const [key, value] of Object.entries(cache)) {
                this.cache.set(parseInt(key), {
                    lastUsed: new Date((<OnDiskEmbedding>value).lastUsed),
                    embedding: (<OnDiskEmbedding>value).embedding
                });
            }
        } catch (e) {
            Logger.info(`No cache found on disk.`);
        }
    }

    private _evictOldEntries() {
        // delete any entries that are more than a week old
        const now = new Date();
        const week = 7 * 24 * 60 * 60 * 1000;
        let evicted = 0;
        for (const [key, value] of this.cache.entries()) {
            if (now.getTime() - value.lastUsed.getTime() > week) {
                this.cache.delete(key);
                evicted++;
            }
        }
        Logger.debug(`Evicted ${evicted} old embeddings from cache`);
    }

    public async save(): Promise<void> {
        const obj = Object.fromEntries(this.cache.entries());
        await fs.promises.writeFile(this._cacheFile.fsPath, JSON.stringify(obj));
        Logger.debug(`Embeddings cache saved to ${this._cacheFile.fsPath}`);
    }


}

export class RateLimitReachedError extends Error {
    constructor(msg: string) {
        super('Rate limit reached: ' + msg);
    }
}

export class EmbeddingsIndex {
    chunks: FileChunkWithScorer[] = [];

    constructor(private embeddingsCache: EmbeddingsCache, private urlRankMap: ResourceMap<number>) { }

    public add(documents: ReadonlyArray<FileChunkWithScorer>): void {
        this.chunks.push(...documents);
    }

    public async search(query: string, maxResults = 5, minThreshold = -Infinity): Promise<FileChunkWithScorer[]> {
        return this.rankChunks(query, this.chunks, maxResults);
    }

    async rankChunks(query: string, chunks: FileChunkWithScorer[], maxResults: number): Promise<FileChunkWithScorer[]> {

        const cachedQuery = this.embeddingsCache.get(query);

        const fileChunksWithoutCachedEmbeddings: FileChunkWithScorer[] = [];
        const fileChunksWithCachedEmbeddings: FileChunkWithEmbeddings[] = [];
        const cachedFileChunkEmbeddings = chunks.map(chunk => this.embeddingsCache.get(chunk.text));

        for (let i = 0; i < cachedFileChunkEmbeddings.length; i++) {
            const e = cachedFileChunkEmbeddings[i];
            if (e) {
                fileChunksWithCachedEmbeddings.push([chunks[i], e]);
            } else {
                fileChunksWithoutCachedEmbeddings.push(chunks[i]);
            }
        }

        const stringsToFetch = cachedQuery ? [] : [query];
        stringsToFetch.push(...fileChunksWithoutCachedEmbeddings.map(chunk => chunk.text));

        const embeddings = await this.getEmbeddings(stringsToFetch);

        const fileChunksWithEmbeddings: FileChunkWithEmbeddings[] = Array.from(fileChunksWithCachedEmbeddings);
        const queryEmbedding = cachedQuery ? cachedQuery : embeddings.shift() as Embedding;

        if (!cachedQuery) {
            this.embeddingsCache.set(query, queryEmbedding);
        }
        for (let i = 0; i < embeddings.length; i++) {
            const e = embeddings[i];
            fileChunksWithEmbeddings.push([fileChunksWithoutCachedEmbeddings[i], e]);
            this.embeddingsCache.set(fileChunksWithoutCachedEmbeddings[i].text, e);
        }
        this.embeddingsCache.saveCache();
        const ranked = this.rankEmbeddings<FileChunkWithScorer>(queryEmbedding, fileChunksWithEmbeddings, maxResults);
        return ranked;

    }


    async getEmbeddings(text: string[]): Promise<Embedding[]> {
        const githubSession = await vscode.authentication.getSession('github', ['user:email'], { createIfNone: true });


        const client = ModelClient(endpoint, new AzureKeyCredential(githubSession.accessToken));


        const sendReq = async (subset: string[]) => {
            const response = await client.path("/embeddings").post({
                body: {
                    input: subset,
                    model: modelName
                }
            });


            if (isUnexpected(response)) {
                if (response.status === '429') {
                    throw new RateLimitReachedError(`Embeddings: ${response.body.error.message}`);
                } else {
                    throw response.body.error;
                }
            }

            return response.body.data.map(d => d.embedding);
        };

        const inputs = Array.from(text);
        const ret = [];

        const groups = await this.batchChunksIntoGroups(inputs, 50000); // limit ~64k

        for (const group of groups) {
            ret.push(...await sendReq(group));
        }

        return ret;
    }

    async batchChunksIntoGroups(texts: string[], tokenSize: number): Promise<string[][]> {
        const groups = [];
        let group = [];
        let groupSize = 0;
        for (const text of texts) {
            const size = await tokenLength(text);
            if (groupSize + size > tokenSize) {
                groups.push(group);
                group = [];
                groupSize = 0;
            }
            group.push(text);
            groupSize += size;
        }
        if (group.length > 0) {
            groups.push(group);
        }
        return groups;
    }

    rankEmbeddings<T extends { scoreBonus?: number }>(
        queryEmbedding: Embedding,
        items: ReadonlyArray<readonly [T, Embedding]>,
        maxResults: number,
    ): T[] {
        const minThreshold = 0.0;
        return items
            .map(([item, embedding]): { readonly score: number; readonly item: T } => {
                let dotProduct = 0;
                for (let i = 0; i < embedding.length; i++) {
                    dotProduct += embedding[i] * queryEmbedding[i];
                }
                const bonus = item.scoreBonus ? item.scoreBonus : 0;
                return { score: dotProduct + bonus, item: item };
            })
            .filter(entry => entry.score > minThreshold)
            .sort((a, b) => b.score - a.score)
            .slice(0, maxResults)
            .map(entry => entry.item);
    }
}
