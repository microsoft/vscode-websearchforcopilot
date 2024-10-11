/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export function naiveChunk(text: string, maxEstimatedTokens: number): string[] {
    const maxChars = maxEstimatedTokens * 4;
    const lines = text.split('\n');
    const chunks: string[] = [];
    let currentChunkLines: string[]= [];
    let currentChunkSize = 0;

    let lastLineWasBlank = false;
    for (const line of lines) {
        if (line.trim() === '') {
            if (lastLineWasBlank) {
                continue;
            } else {
                lastLineWasBlank = true;
            }
        }
        if (line.length> maxChars) {
            chunks.push(currentChunkLines.join('\n'));
            chunks.push(line.substring(0, maxChars));
            currentChunkSize = 0;
            currentChunkLines = [];
        } else if (currentChunkSize + line.length > maxChars) {
            chunks.push(currentChunkLines.join('\n'));
            currentChunkSize = line.length;
            currentChunkLines = [line];
        } else {
            currentChunkSize += line.length;
            currentChunkLines.push(line);
        }
    }
    if (currentChunkLines.length > 0) {
        chunks.push(currentChunkLines.join('\n'));
    }

    return chunks;
}
