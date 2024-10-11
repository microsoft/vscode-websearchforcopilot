/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { BingAuthProvider, TavilyAuthProvider } from './auth/authProvider';
import { BetterTokenStorage } from './auth/betterSecretStorage';
import { registerChatParticipant } from './chatParticipant';
import { WebSearchTool } from './chatTool';

export function activate(context: vscode.ExtensionContext) {
    registerAuthProviders(context);
    registerChatTools(context);
    registerChatParticipant(context);
}

function registerAuthProviders(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.authentication.registerAuthenticationProvider(
        TavilyAuthProvider.ID,
        TavilyAuthProvider.NAME,
        new TavilyAuthProvider(new BetterTokenStorage('tavily.keylist', context)),
        { supportsMultipleAccounts: true }
    ));
    context.subscriptions.push(vscode.authentication.registerAuthenticationProvider(
        BingAuthProvider.ID,
        BingAuthProvider.NAME,
        new BingAuthProvider(new BetterTokenStorage('bing.keylist', context)),
        { supportsMultipleAccounts: true }
    ));
}

function registerChatTools(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.lm.registerTool(WebSearchTool.ID, new WebSearchTool()));
}

export function deactivate() { }
