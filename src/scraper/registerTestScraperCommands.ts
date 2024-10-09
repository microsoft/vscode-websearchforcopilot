import * as vscode from 'vscode';
import { WebSearchTool } from '../search/webSearch';
import { findBasicChunksBasedOnQuery, findNaiveChunksBasedOnQuery } from './chunkSearch';
import { getDocumentFromPage, sectionToString, WebsiteIndex } from './websiteBasicIndex';

export function registerScraperCommands(context: vscode.ExtensionContext) {
    // mostly for testing

    registerTavilyExtractor(context);

    context.subscriptions.push(vscode.commands.registerCommand('vscode-websearchparticipant.scrapeAndGetChunks', async () => {

        const url = await promptForURL();
        const query = await promptForQuery();

        const resultChunks = await findBasicChunksBasedOnQuery(url, query);

        await vscode.workspace.openTextDocument({
            language: 'markdown', // Specify the language mode
            content: resultChunks?.flatMap(c => [
                '',
                ...sectionToString({
                    heading: c.heading,
                    content: c.text
                }
                ),
                '',
                '-------------------',
            ]).join('\n'),
        });
        console.log(resultChunks);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('vscode-websearchparticipant.scrapeAndOpenWholeDocument', async () => {
        const url = await promptForURL();
        const query = await promptForQuery();
        await getAllPageContent(url, query);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('vscode-websearchparticipant.scrapeAndGetNaiveChunks', async () => {

        const url = await promptForURL();
        const query = await promptForQuery();
        const resultChunks = await findNaiveChunksBasedOnQuery(url, query, true);

        await vscode.workspace.openTextDocument({
            language: 'markdown', // Specify the language mode
            content: resultChunks?.flatMap(c => [
                '',
                c.text,
                '',
                '-------------------',
            ]).join('\n'),
        });
        console.log(resultChunks);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('vscode-websearchparticipant.scrapeAndGetNaiveChunksFromEmbeddings', async () => {

        const url = await promptForURL();
        const query = await promptForQuery();
        const resultChunks = await findNaiveChunksBasedOnQuery(url, query, false);

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
        const res = await WebSearchTool.tavilyExtract({
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
        const session = await vscode.authentication.getSession('tavily', [], { createIfNone: true, clearSessionPreference: true });

        const result = await WebSearchTool.tavilySearch({
            api_key: session.accessToken,
            query: query,
            urls: [url]
        });

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

async function getAllPageContent(url: string, query: string) {
    const index = new WebsiteIndex(url);
    const pages = await index.getAllChunks();

    for (const page of pages) {
        await vscode.workspace.openTextDocument({
            language: 'markdown', // Specify the language mode
            content: getDocumentFromPage(page),
        });
    }
}