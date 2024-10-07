/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Uri } from "vscode";
import { FileChunk, ResourceMap } from "./utils";

type SparseEmbedding = Record</* word */ string, /* weight */number>;

type TermFrequencies = Map</* word */ string, /*occurrences*/ number>;
type DocumentOccurrences = Map</* word */ string, /*documentOccurrences*/ number>;

function countMapFrom<K>(values: Iterable<K>): Map<K, number> {
	const map = new Map<K, number>();
	for (const value of values) {
		map.set(value, (map.get(value) ?? 0) + 1);
	}
	return map;
}

class SimpleHeap<T> {

	private readonly store: Array<{ score: number; value: T }> = [];

	constructor(
		private readonly maxSize: number,
		private minScore = -Infinity,
	) { }

	toArray() {
		return Array.from(this.store, x => x.value);
	}

	add(score: number, value: T) {
		if (score <= this.minScore) {
			return;
		}

		const index = this.store.findIndex(entry => entry.score < score);
		this.store.splice(index >= 0 ? index : this.store.length, 0, { score, value });
		while (this.store.length > this.maxSize) {
			this.store.pop();
		}

		if (this.store.length === this.maxSize) {
			this.minScore = this.store.at(-1)?.score ?? this.minScore;
		}
	}
}

interface DocumentChunkEntry {
	readonly tf: TermFrequencies;
}

export interface TfIdfDoc<T extends FileChunk> {
	readonly uri: Uri;
	readonly chunks: readonly T[];
}

/**
 * Implementation of tf-idf (term frequency-inverse document frequency) for a set of documents where
 * each document contains one or more chunks of text.
 */
export class TfIdf<T extends FileChunk> {

	/**
	 * Count how many times each term (word) appears in a string.
	 */
	private static termFrequencies(input: string): TermFrequencies {
		return countMapFrom(TfIdf.splitTerms(input));
	}

	/**
	 * Break a string into terms (words).
	 */
	private static *splitTerms(input: string): Iterable<string> {
		const normalize = (word: string) => word.toLowerCase();

		// Only match on words that are at least 3 characters long and start with a letter
		for (const [word] of input.matchAll(/(?<![\p{Alphabetic}\p{Number}_$])[\p{Letter}_$][\p{Alphabetic}\p{Number}_$]{2,}(?![\p{Alphabetic}\p{Number}_$])/gu)) {
			const parts = new Set<string>();
			parts.add(normalize(word));

			const subParts: string[] = [];
			const camelParts = word.split(/(?<=[a-z$])(?=[A-Z])/g);
			if (camelParts.length > 1) {
				subParts.push(...camelParts);
			}

			const snakeParts = word.split('_');
			if (snakeParts.length > 1) {
				subParts.push(...snakeParts);
			}

			const nonDigitPrefixMatch = word.match(/^([\D]+)\p{Number}+$/u);
			if (nonDigitPrefixMatch) {
				subParts.push(nonDigitPrefixMatch[1]);
			}

			for (const part of subParts) {
				// Require at least 3 letters in the sub parts
				if (part.length > 2 && /[\p{Alphabetic}_$]{3,}/gu.test(part)) {
					parts.add(normalize(part));
				}
			}

			yield* parts;
		}
	}

	/**
	 * Total number of chunks
	 */
	private chunkCount = 0;

	private readonly chunkOccurrences: DocumentOccurrences = new Map</* word */ string, /*documentOccurrences*/ number>();

	private readonly documents = new ResourceMap<{
		readonly chunks: ReadonlyArray<T & DocumentChunkEntry>;
	}>();

	public addOrUpdate(documents: ReadonlyArray<TfIdfDoc<T>>): void {
		for (const { uri } of documents) {
			this.delete(uri);
		}

		for (const doc of documents) {
			const chunks: Array<T & DocumentChunkEntry> = [];
			for (const chunk of doc.chunks) {
				// TODO: See if we can compute the tf lazily
				// The challenge is that we need to also update the `chunkOccurrences`
				// and all of those updates need to get flushed before the real tfidf of
				// anything is computed.
				const tf = TfIdf.termFrequencies(chunk.text);

				// Update occurrences list
				for (const word of tf.keys()) {
					this.chunkOccurrences.set(word, (this.chunkOccurrences.get(word) ?? 0) + 1);
				}

				chunks.push({ ...chunk, tf });
			}

			this.chunkCount += chunks.length;
			this.documents.set(doc.uri, { chunks });
		}
	}

	public delete(uri: Uri): void {
		const doc = this.documents.get(uri);
		if (!doc) {
			return;
		}

		this.documents.delete(uri);
		this.chunkCount -= doc.chunks.length;

		// Update document occurrences
		for (const chunk of doc.chunks) {
			for (const word of chunk.tf.keys()) {
				const currentOccurrences = this.chunkOccurrences.get(word);
				if (typeof currentOccurrences === 'number') {
					const newOccurrences = currentOccurrences - 1;
					if (newOccurrences <= 0) {
						this.chunkOccurrences.delete(word);
					} else {
						this.chunkOccurrences.set(word, newOccurrences);
					}
				}
			}
		}
	}

	/**
	 * Rank the documents by their cosine similarity to a set of search queries.
	 */
	public search(queries: readonly string[], maxResults = Infinity, minThreshold = -Infinity): T[] {
		const out = new SimpleHeap<T>(maxResults, minThreshold);

		const queryEmbeddings = queries.map(query => this.computeEmbeddings(query));
		const idfCache = new Map<string, number>();
		for (const [_uri, entry] of this.documents) {
			for (const chunk of entry.chunks) {
				let score = -Infinity;
				for (const queryEmbedding of queryEmbeddings) {
					score = Math.max(score, this.score(chunk, queryEmbedding, idfCache));
				}
				if (score > 0) {
					out.add(score, chunk);
				}
			}
		}

		return out.toArray();
	}

	private computeEmbeddings(input: string): SparseEmbedding {
		const tf = TfIdf.termFrequencies(input);
		return this.computeTfidf(tf);
	}

	private score(chunk: DocumentChunkEntry & T, queryEmbedding: SparseEmbedding, idfCache: Map<string, number>): number {
		// Compute the dot product between the chunk's embedding and the query embedding

		// Note that the chunk embedding is computed lazily on a per-term basis.
		// This lets us skip a large number of calculations because the majority
		// of chunks do not share any terms with the query.

		let sum = 0;
		for (const [term, termTfidf] of Object.entries(queryEmbedding)) {
			const chunkTf = chunk.tf.get(term);
			if (!chunkTf) {
				// Term does not appear in chunk so it has no contribution
				continue;
			}

			let chunkIdf = idfCache.get(term);
			if (typeof chunkIdf !== 'number') {
				chunkIdf = this.idf(term);
				idfCache.set(term, chunkIdf);
			}

			const chunkTfidf = chunkTf * chunkIdf;
			sum += chunkTfidf * termTfidf;
		}
		return sum;
	}

	private idf(term: string): number {
		const chunkOccurrences = this.chunkOccurrences.get(term) ?? 0;
		return chunkOccurrences > 0
			? Math.log((this.chunkCount + 1) / chunkOccurrences)
			: 0;
	}

	private computeTfidf(termFrequencies: TermFrequencies): SparseEmbedding {
		const embedding = Object.create(null);
		for (const [word, occurrences] of termFrequencies) {
			const idf = this.idf(word);
			if (idf > 0) {
				embedding[word] = occurrences * idf;
			}
		}
		return embedding;
	}
}
