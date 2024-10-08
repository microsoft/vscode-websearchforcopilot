import { registerTavilyExtractor } from "./registerTavilyScraper";
import { getDocumentFromPage, WebsiteIndex,sectionToString, WebsiteNaiveChunkIndex } from "./websiteIndex";
import * as vscode from 'vscode';

export function registerScraper(context: vscode.ExtensionContext) {
    registerTavilyExtractor(context);

    context.subscriptions.push(vscode.commands.registerCommand('vscode-websearchparticipant.scrapeAndGetChunks', async () => {

        const url = await promptForURL();

        const resultChunks = await findChunksBasedOnQuery(url);
        
        await vscode.workspace.openTextDocument({
            language: 'markdown', // Specify the language mode
            content: resultChunks?.flatMap(c => [
                '',
                ...sectionToString({    
                    heading: c.heading,
                    content: c.text}
                ),
                '',
                '-------------------',
            ]).join('\n'),
          });
        console.log(resultChunks);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('vscode-websearchparticipant.scrapeAndOpenWholeDocument', async () => {
        const url = await promptForURL();
        await getAllPageContent(url);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('vscode-websearchparticipant.scrapeAndGetNaiveChunks', async () => {

        const url = await promptForURL();
        const resultChunks = await findNaiveChunksBasedOnQuery(url);
        
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

}

export async function promptForURL() {
    const url= await vscode.window.showInputBox({
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

export async function promptForQuery() {
    const query = await vscode.window.showInputBox({
        placeHolder: 'Query to drive chunks'
    });

    if (!query) {
        throw Error('Query is required');
    }
    return query;

}
// todo: ideally, the index persists across queries.
async function findChunksBasedOnQuery(url: string) {
    const query = await promptForQuery();

    const index = new WebsiteIndex(url);

    return await index.search(query, 5);
}

async function findNaiveChunksBasedOnQuery(url: string) {
    const query = await promptForQuery();
    const index = new WebsiteNaiveChunkIndex(url);

    return await index.search(query, 5);
}

async function getAllPageContent(url: string) {
    const index = new WebsiteIndex(url);
    const pages = await index.getAllChunks();

    for (const page of pages) {
        await vscode.workspace.openTextDocument({
            language: 'markdown', // Specify the language mode
            content: getDocumentFromPage(page),
          });
    }
}