/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export function naiveChunk(sections: string[], maxEstimatedTokens: number): { result: string, sources: string[] }[] {
    const maxChars = maxEstimatedTokens * 4;
    const chunks: { result: string, sources: string[] }[] = [];
    let currentChunkLines: string[] = [];
    let currentChunkSize = 0;

    let currentSections: string[] = [];
    let activeSectionLines: string[] = [];
    for (const section of sections) {
        const lines = section.split('\n');
        let lastLineWasBlank = false;
        for (const line of lines) {
            if (line.trim() === '') {
                if (lastLineWasBlank) {
                    continue;
                } else {
                    lastLineWasBlank = true;
                }
            }
            if (line.length > maxChars) {
                currentSections.push(activeSectionLines.join('\n'));
                chunks.push(
                    {
                        result: currentChunkLines.join('\n'),
                        sources: currentSections,
                    });
                chunks.push(
                    {
                        result: line.substring(0, maxChars),
                        sources: [line],
                    });
                currentChunkSize = 0;
                currentChunkLines = [];
                currentSections = [];
                activeSectionLines = [];
            } else if (currentChunkSize + line.length > maxChars) {
                currentSections.push(activeSectionLines.join('\n'));
                chunks.push({
                    result: currentChunkLines.join('\n'),
                    sources: currentSections,
                });
                currentSections = [];
                currentChunkSize = line.length;
                activeSectionLines = [line];
                currentChunkLines = [line];
            } else {
                currentChunkSize += line.length;
                currentChunkLines.push(line);
                activeSectionLines.push(line);
            }
        }

        currentSections.push(activeSectionLines.join('\n'));
        activeSectionLines = [];
    }
    if (currentChunkLines.length > 0) {
        currentSections.push(activeSectionLines.join('\n'));
        chunks.push({
            result: currentChunkLines.join('\n'),
            sources: currentSections,
        });
    }

    return chunks;
}
