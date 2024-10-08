import { promptForQuery, promptForURL } from "./registerScraper";
import * as vscode from 'vscode';
import { WebsiteNaiveChunkIndex } from "./websiteIndex";
import { WebSearchTool } from "../search/webSearch";

export function registerTavilyExtractor(context: vscode.ExtensionContext) {
    
    context.subscriptions.push(vscode.commands.registerCommand('vscode-websearchparticipant.tavilyScrapeAndOpenWholeDocument', async () => {

        const url = await promptForURL();
        if (!url) {
            return;
        }

        const session = await vscode.authentication.getSession('tavily', [], { createIfNone: true, clearSessionPreference: true });
        const res = await WebSearchTool.extract({
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
        
        const result = await WebSearchTool.search({
            api_key: session.accessToken,
            query: query,
            urls: [url]
        });

        if (result.results.length === 0) {
            vscode.window.showErrorMessage('No results found.');
        }

        await vscode.workspace.openTextDocument({
            language: 'markdown', // Specify the language mode
            content:result.results.flatMap(c => [
                '',
                c.content,
                '',
                '-------------------',
            ]).join('\n'),
          });
    }));
}
