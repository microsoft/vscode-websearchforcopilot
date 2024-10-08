import { Page, Section } from "./webCrawler";
import { WebsiteIndex } from "./websiteIndex";
import * as vscode from 'vscode';

export function registerScraper(context: vscode.ExtensionContext) {
    
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
}

async function promptForURL() {
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

function getDocumentFromPage(page: Page):string {
    const strBuffer:string[] = [page.url, ''];

    for(const p of page.sections) {
        strBuffer.push(...sectionToString(p));
    }

    return strBuffer.join('\n');
}

function sectionToString(section: Section): string[] {
    const strBuffer:string[] = [];
    strBuffer.push(`# ${section.heading}`);
    strBuffer.push(section.content);
    strBuffer.push(`\n`);
    return strBuffer;

}