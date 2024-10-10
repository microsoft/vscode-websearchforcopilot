import { FileChunk, ResourceMap } from "../utils";
import * as vscode from 'vscode';
import { isUnexpected } from "@azure-rest/ai-inference";
import ModelClient from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";
import { tokenLength } from "../tokenizer";

export type Embedding = readonly number[];
type FileChunkWithEmbeddings = [FileChunkWithScorer, Embedding];
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

export class EmbeddingsCache {
    private cache: Map<number, Embedding> = new Map<number, Embedding>();

    public get(chunk: string): Embedding | undefined {

        const ret = this.cache.get(stringHash(chunk));

        if (!ret) {
            console.log(`cache miss`);
        } else {
            console.log(`cache hit`);
        }
        return ret;
    }

    public set(chunk: string, embedding: Embedding) {
        this.cache.set(stringHash(chunk), embedding);
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

        for (let i = 0; i < embeddings.length; i++) {
            const e = embeddings[i];
            fileChunksWithEmbeddings.push([fileChunksWithoutCachedEmbeddings[i], e]);
            this.embeddingsCache.set(fileChunksWithoutCachedEmbeddings[i].text, e);
        }

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
                throw response.body.error;
            }

            return response.body.data.map(d => d.embedding);
        };

        const inputs = Array.from(text);
        const ret = [];

        const groups = await this.batchChunksIntoGroups(inputs, 50000); // limit ~64k

        for (const group of groups) {
            ret.push(...await sendReq(group));
        }

        console.log(`sent ${groups.length} embeddings calls`);
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