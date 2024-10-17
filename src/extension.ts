/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { BingAuthProvider, TavilyAuthProvider } from './auth/authProvider';
import { registerChatParticipant } from './chatParticipant';
import { WebSearchTool } from './chatTool';
import Logger from './logger';
import { ApiKeySecretStorage } from './auth/secretStorage';
import { EmbeddingsCache } from './webChunk/index/embeddings';
import { toggleTracing } from './promptTracing';

export async function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(Logger);
    await registerAuthProviders(context);
    registerChatTools(context);
    registerChatParticipant(context);
    registerCommands(context);
}

async function registerAuthProviders(context: vscode.ExtensionContext) {
    const tavilySecretStorage = new ApiKeySecretStorage('tavily.keys', context);
    await tavilySecretStorage.initialize();
    const tavilyAuthProvider = new TavilyAuthProvider(tavilySecretStorage);

    const bingSecretStorage = new ApiKeySecretStorage('bing.keys', context);
    await bingSecretStorage.initialize();
    const bingAuthProvider = new BingAuthProvider(bingSecretStorage);

    context.subscriptions.push(vscode.Disposable.from(
        tavilyAuthProvider,
        vscode.authentication.registerAuthenticationProvider(TavilyAuthProvider.ID, TavilyAuthProvider.NAME, new TavilyAuthProvider(tavilySecretStorage), { supportsMultipleAccounts: true }),
        bingAuthProvider,
        vscode.authentication.registerAuthenticationProvider(BingAuthProvider.ID, BingAuthProvider.NAME, new BingAuthProvider(bingSecretStorage), { supportsMultipleAccounts: true })
    ));
}

function registerChatTools(context: vscode.ExtensionContext) {
    const embeddingsCache = new EmbeddingsCache(context.extensionUri);
    context.subscriptions.push(vscode.lm.registerTool(WebSearchTool.ID, new WebSearchTool(embeddingsCache)));
}

function registerCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('vscode-websearchchattools.toggleWebSearchPromptTracer', () => toggleTracing(context.extensionMode)));
}
