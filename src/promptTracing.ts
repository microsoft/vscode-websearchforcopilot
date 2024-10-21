/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, HTMLTracer, IChatEndpointInfo, PromptElementCtor, PromptRenderer, RenderPromptResult, toVsCodeChatMessages } from "@vscode/prompt-tsx";
import { AnyTokenizer } from "@vscode/prompt-tsx/dist/base/tokenizer/tokenizer";
import { CancellationToken, ExtensionMode, LanguageModelChat, LanguageModelChatMessage, ProgressLocation, window } from "vscode";

let tracingEnabled = false;
export function toggleTracing(extensionMode: ExtensionMode) {
    if (extensionMode === ExtensionMode.Development) {
        tracingEnabled = !tracingEnabled;
    }
    return tracingEnabled;
}

export async function renderPrompt<P extends BasePromptElementProps>(endpoint: IChatEndpointInfo, ctor: PromptElementCtor<P, any>, props: P, model: LanguageModelChat, token: CancellationToken) {
    const renderer = new PromptRenderer(endpoint, ctor, props, new AnyTokenizer(model.countTokens));
    let result: RenderPromptResult;
    if (tracingEnabled) {
        const tracer = new HTMLTracer();
        renderer.tracer = tracer;
        result = await renderer.render(undefined, token);
        const server = await tracer.serveHTML();
        await window.withProgress({ location: ProgressLocation.Notification, title: `Tracer server running at ${server.address}`, cancellable: true }, async (progress, token) => {
            await new Promise<void>(resolve => {
                const dispose = token.onCancellationRequested(() => {
                    dispose.dispose();
                    server.dispose();
                    resolve();
                });
            });
        });
    } else {
        result = await renderer.render(undefined, token);
    }

    return {
        messages: toVsCodeChatMessages(result.messages) as LanguageModelChatMessage[],
        references: result.references,
        metadatas: result.metadata,
    };
}
