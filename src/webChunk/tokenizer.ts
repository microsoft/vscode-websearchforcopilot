/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import {
    createByModelName,
    TikTokenizer
} from '@microsoft/tiktokenizer';

let tokenizer: Tokenizer | undefined;

class Tokenizer {
    private tokenizer: Promise<TikTokenizer>;

    constructor() {
        this.tokenizer = createByModelName("gpt-4");
    }

    public async tokenLength(text: string): Promise<number> {
        return (await this.tokenizer).encode(text).length;
    }
}

export async function tokenLength(text: string) {
    return getTokenizer().then(tokenizer => tokenizer.tokenLength(text));
}

async function getTokenizer() {
    if (!tokenizer) {
        tokenizer = new Tokenizer();
    }
    return tokenizer;
}
