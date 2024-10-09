import { CancellationToken, LanguageModelTool, LanguageModelToolInvocationOptions, LanguageModelToolInvocationPrepareOptions, LanguageModelToolResult, lm, PreparedToolInvocation, ProviderResult } from "vscode";
import { getInternalTool } from "./tools";
import { WebSearchTool } from "./search/webSearch";
import { IWebSearchToolParameters } from "./search/webSearchTypes";

interface PublicWebSearchToolParameters {
    query: string;
    api_key: string;
}

export class PublicWebSearchTool implements LanguageModelTool<PublicWebSearchToolParameters> {
    static ID = 'vscode-websearchparticipant_publicWebSearch';

    async invoke(options: LanguageModelToolInvocationOptions<PublicWebSearchToolParameters>, token: CancellationToken): Promise<LanguageModelToolResult> {
        const tool = getInternalTool<IWebSearchToolParameters, WebSearchTool>(WebSearchTool.ID)!;
        const result = await tool.invoke(options, token);

        // TODO: Have the language model take in the result of the internal tool and run other internal tools
        // const models = await lm.selectChatModels({
        //     vendor: 'copilot',
        //     family: 'gpt-4o'
        // });
        // const model = models[0];

        return result;
    }
}
