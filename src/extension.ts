import * as vscode from 'vscode';
import { BingAuthProvider, TavilyAuthProvider } from './auth/authProvider';
import { BetterTokenStorage } from './auth/betterSecretStorage';
import { registerWebSearch, WebSearchTool } from './search/webSearch';
import { registerChatParticipant } from './chatParticipant';
import { registerScraperCommands } from './scraper/registerTestScraperCommands';
import { registerInternalTool } from './tools';
import { PublicWebSearchTool } from './chatTool';

export function activate(context: vscode.ExtensionContext) {
    registerAuthProviders(context);
    registerChatTools(context);
    registerChatParticipant(context);
    registerScraperCommands(context);
    registerWebSearch(context);
}

function registerAuthProviders(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.authentication.registerAuthenticationProvider(
        TavilyAuthProvider.ID,
        TavilyAuthProvider.NAME,
        new TavilyAuthProvider(new BetterTokenStorage('tavily.keylist', context)),
        { supportsMultipleAccounts: true }
    ));
    context.subscriptions.push(vscode.commands.registerCommand('tavily-authentication-provider.hi', async () => {
        const session = await vscode.authentication.getSession('tavily', [], { createIfNone: true, clearSessionPreference: true });
        const choice = await vscode.window.showInformationMessage(`Hi 👋 Here's the Tavily API key for '${session.account.label}'!`, 'Copy API key');
        if (choice) {
            await vscode.env.clipboard.writeText(session.accessToken);
        }
    }));
    context.subscriptions.push(vscode.authentication.registerAuthenticationProvider(
        BingAuthProvider.ID,
        BingAuthProvider.NAME,
        new BingAuthProvider(new BetterTokenStorage('bing.keylist', context)),
        { supportsMultipleAccounts: true }
    ));
    context.subscriptions.push(vscode.commands.registerCommand('bing-authentication-provider.hi', async () => {
        const session = await vscode.authentication.getSession('bing', [], { createIfNone: true, clearSessionPreference: true });
        const choice = await vscode.window.showInformationMessage(`Hi 👋 Here's the Bing API key for '${session.account.label}'!`, 'Copy API key');
        if (choice) {
            await vscode.env.clipboard.writeText(session.accessToken);
        }
    }));
}

function registerChatTools(context: vscode.ExtensionContext) {
    context.subscriptions.push(registerInternalTool(WebSearchTool.ID, WebSearchTool.DETAILS, WebSearchTool));
    context.subscriptions.push(vscode.lm.registerTool(PublicWebSearchTool.ID, new PublicWebSearchTool()));
}

export function deactivate() { }
