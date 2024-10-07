import { WebsiteIndex } from "./websiteIndex";
import { commands, ExtensionContext, window } from "vscode";

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
        if (!url) {
            return;
        }
        const index = new WebsiteIndex(url);
        console.log('here');
    }));
}