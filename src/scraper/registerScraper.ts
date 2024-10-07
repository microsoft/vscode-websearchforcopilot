import { WebsiteIndex } from "./websiteIndex";
import {  commands, ExtensionContext, window } from "vscode";

export function registerScraper(context: ExtensionContext) {
    
    context.subscriptions.push(commands.registerCommand('vscode-websearchparticipant.scrape', async () => {
        const url = await window.showInputBox({
            placeHolder: 'Website URL... (ex: https://tree-sitter.github.io/tree-sitter)',
            validateInput(value: string) {
                if (!URL.canParse(value)) {
                    return 'Not a valid URL';
                }
                return undefined;
            }
        });
        
        const query = await window.showInputBox({
            placeHolder: 'Query to drive chunks'
        });

        if (!url || !query) {
            return;
        }

        const resultChunks = findChunks(url,query);
        console.log(resultChunks);
    }));
}

// todo: ideally, the index persists across queries.
async function findChunks(url: string, query: string) {
    const index = new WebsiteIndex(url);

    return await index.search(query, 5);
}