import * as vscode from 'vscode';
import { registerScraper } from './scraper/registerScraper';
import { TavilyAuthProvider } from './auth/authProvider';
import { BetterTokenStorage } from './auth/betterSecretStorage';
import { registerWebSearch, WebSearchTool } from './search/webSearch';
import { registerChatParticipant } from './chatParticipant';

export function activate(context: vscode.ExtensionContext) {
    registerAuthProvider(context);
    registerChatTools(context);
    registerChatParticipant(context);
    registerScraper(context);
    registerWebSearch(context);
}

function registerAuthProvider(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.authentication.registerAuthenticationProvider(
        TavilyAuthProvider.id,
        'Tavily',
        new TavilyAuthProvider(new BetterTokenStorage('tavily.keylist', context)),
        { supportsMultipleAccounts: true }
    ));
    context.subscriptions.push(vscode.commands.registerCommand('tavily-authentication-provider.hi', async () => {
        const session = await vscode.authentication.getSession('tavily', [], { createIfNone: true, clearSessionPreference: true });
        const choice = await vscode.window.showInformationMessage(`Hi 👋 Here's the API key for '${session.account.label}'!`, 'Copy API key');
        if (choice) {
            await vscode.env.clipboard.writeText(session.accessToken);
        }
    }));
}

function registerChatTools(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.lm.registerTool(WebSearchTool.ID, new WebSearchTool()));
}

export function deactivate() { }
