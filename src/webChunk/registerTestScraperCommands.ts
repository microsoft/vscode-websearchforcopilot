import * as vscode from 'vscode';
import { findNaiveChunksBasedOnQuery } from './chunkSearch';
import { TavilyEngine } from '../search/webSearch';

export function registerScraperCommands(context: vscode.ExtensionContext) {
    // mostly for testing

    registerTavilyExtractor(context);

    context.subscriptions.push(vscode.commands.registerCommand('vscode-websearchparticipant.scrapeAndGetNaiveChunksFromEmbeddings', async () => {

        const url = await promptForURL();
        const query = await promptForQuery();
        const resultChunks = await findNaiveChunksBasedOnQuery([url], query, { crawl: true });

        await vscode.workspace.openTextDocument({
            language: 'markdown', // Specify the language mode
            content: resultChunks?.flatMap(c => c ? [
                '',
                c.text,
                '',
                '-------------------',
            ] : []).join('\n'),
        });
        console.log(resultChunks);
    }));
}

function registerTavilyExtractor(context: vscode.ExtensionContext) {

    context.subscriptions.push(vscode.commands.registerCommand('vscode-websearchparticipant.tavilyScrapeAndOpenWholeDocument', async () => {

        const url = await promptForURL();
        if (!url) {
            return;
        }

        const session = await vscode.authentication.getSession('tavily', [], { createIfNone: true, clearSessionPreference: true });
        const res = await TavilyEngine.extract({
            urls: [url],
            api_key: session.accessToken,
        });

        if (res.results.length === 0) {
            throw Error('Extraction Failed');
        }

        await vscode.workspace.openTextDocument({
            language: 'markdown', // Specify the language mode
            content: `${res.results[0].url}\n\n${res.results[0].raw_content}`,
        });
    }));


    context.subscriptions.push(vscode.commands.registerCommand('vscode-websearchparticipant.tavilyScrapeAndGetChunks', async () => {

        const url = await promptForURL();
        const query = await promptForQuery();
        await vscode.authentication.getSession('tavily', [], { createIfNone: true, clearSessionPreference: true });

        const result = await TavilyEngine.search(query, url);

        if (result.urls.length === 0) {
            vscode.window.showErrorMessage('No results found.');
        }

        await vscode.workspace.openTextDocument({
            language: 'markdown', // Specify the language mode
            content: result.urls.flatMap(c => [
                '',
                c.snippet,
                '',
                '-------------------',
            ]).join('\n'),
        });
    }));
}


async function promptForURL() {
    const url = await vscode.window.showInputBox({
        placeHolder: 'Website URL... (ex: https://tree-sitter.github.io/tree-sitter)',
        validateInput(value: string) {
            if (!URL.canParse(value)) {
                return 'Not a valid URL';
            }
            return undefined;
        }
    });

    if (!url) {
        throw Error('URL is required');
    }
    return url;
}

async function promptForQuery() {
    const query = await vscode.window.showInputBox({
        placeHolder: 'Query to drive chunks'
    });

    if (!query) {
        throw Error('Query is required');
    }
    return query;

}
