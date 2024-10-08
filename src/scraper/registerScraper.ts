import { getDocumentFromPage, WebsiteIndex,sectionToString, WebsiteNaiveChunkIndex } from "./websiteIndex";
import * as vscode from 'vscode';

export function registerTavilyExtractor(context: vscode.ExtensionContext) {
    
    context.subscriptions.push(vscode.commands.registerCommand('vscode-websearchparticipant.tavilyScrapeAndOpenWholeDocument', async () => {

        const url = await promptForURL();
        if (!url) {
            return;
        }

        const session = await vscode.authentication.getSession('tavily', [], { createIfNone: true, clearSessionPreference: true });

        
        const req = await fetch('https://api.tavily.com/extract', {
            method: 'POST',
            headers: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                urls: [url],
                // eslint-disable-next-line @typescript-eslint/naming-convention
                api_key: session.accessToken,
            }),
        });

			const res = await req.json() as TavilyExtractResult;
            if (res.results.length === 0) {
                throw Error('Extraction Failed');
            }
        
            await vscode.workspace.openTextDocument({
                language: 'markdown', // Specify the language mode
                content: `${res.results[0].url}\n\n${res.results[0].raw_content}`,
              });
    }));
}

export function registerScraper(context: vscode.ExtensionContext) {
    registerTavilyExtractor(context);
    context.subscriptions.push(vscode.commands.registerCommand('vscode-websearchparticipant.scrapeAndGetChunks', async () => {

        const url = await promptForURL();
        if (!url) {
            return;
        }

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
        if (!url) {
            return;
        }

        await getAllPageContent(url);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('vscode-websearchparticipant.scrapeAndGetNaiveChunks', async () => {

        const url = await promptForURL();
        if (!url) {
            return;
        }

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

interface TavilyExtractResult {
    results: {url: string, raw_content:string}[];
    failed_results: any[];
    response_time: number;
}

export async function promptForURL() {
    return await vscode.window.showInputBox({
        placeHolder: 'Website URL... (ex: https://tree-sitter.github.io/tree-sitter)',
        validateInput(value: string) {
            if (!URL.canParse(value)) {
                return 'Not a valid URL';
            }
            return undefined;
        }
    });
}
// todo: ideally, the index persists across queries.
async function findChunksBasedOnQuery(url: string) {
    const query = await vscode.window.showInputBox({
        placeHolder: 'Query to drive chunks'
    });

    if ( !query) {
        return;
    }
    
    const index = new WebsiteIndex(url);

    return await index.search(query, 5);
}

async function findNaiveChunksBasedOnQuery(url: string) {
    const query = await vscode.window.showInputBox({
        placeHolder: 'Query to drive chunks'
    });

    if (!query) {
        return;
    }
    
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