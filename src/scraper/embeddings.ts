import { FileChunk, ResourceMap } from "./utils";
import * as vscode from 'vscode';
import { isUnexpected } from "@azure-rest/ai-inference";
import ModelClient from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";


export class EmbeddingsIndex {
    chunks: FileChunk[] = [];

    public add(documents: ReadonlyArray<FileChunk>): void {
        this.chunks.push(...documents);
    }

    public async search(query: string, maxResults = 5, minThreshold = -Infinity): Promise<FileChunk[]> {
        return rankChunks(query,this.chunks,maxResults);
    }
}

async function rankChunks(query: string, chunks: FileChunk[],maxResults:number): Promise<FileChunk[]>{

    const stringsToFetch = [
        query,
        ...chunks.map(chunk => chunk.text)
    ];
    const embeddings = await getEmbeddings(stringsToFetch);

    
    const fileChunksWithEmbeddings: FileChunkWithEmbeddings[] = [];
    const queryEmbedding = embeddings[0];
    let i= 1;
    for (const e of embeddings) {
        fileChunksWithEmbeddings.push([chunks[i], e]);
        i++;
    }

    const ranked = rankEmbeddings<FileChunk>(queryEmbedding,fileChunksWithEmbeddings, maxResults);
    return ranked;

}

export type Embedding = readonly number[];
type FileChunkWithEmbeddings = [FileChunk, Embedding];
const modelName = "text-embedding-3-small";
const endpoint = "https://models.inference.ai.azure.com";


export async function getEmbeddings(text: string[]): Promise<Embedding[]> {
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
    while (inputs.length > 0) {
        const subset = inputs.splice(0,8);
        ret.push(...await sendReq(subset));
    }
    return ret;
}


function rankEmbeddings<T>(
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
            return { score: dotProduct, item: item };
        })
        .filter(entry => entry.score > minThreshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults)
        .map(entry => entry.item);
}