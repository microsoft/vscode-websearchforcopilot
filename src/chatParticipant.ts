import { ExtensionContext, ChatRequestHandler, ChatRequest, ChatContext, ChatResponseStream, CancellationToken, lm, LanguageModelChatRequestOptions, chat, ThemeIcon, LanguageModelTextPart, LanguageModelToolCallPart, LanguageModelChatTool } from "vscode";
import { renderPrompt } from '@vscode/prompt-tsx';
import { ToolUserPrompt } from "./chatToolPrompt";

const llmInstructions = `Instructions:
- The user will ask a question, or ask you to perform a task, and it may require lots of research to answer correctly. There is a selection of tools that let you perform actions or retrieve helpful context to answer the user's question.
- If you aren't sure which tool is relevant, you can call multiple tools. You can call tools repeatedly to take actions or gather as much context as needed until you have completed the task fully. Don't give up unless you are sure the request cannot be fulfilled with the tools you have.
- Don't make assumptions about the situation- gather context first, then perform the task or answer the question.
- Don't ask the user for confirmation to use tools, just use them.
- After editing a file, DO NOT show the user a codeblock with the edit or new file contents. Assume that the user can see the result.
- DO NOT CALL multi_tool_use.parallel FOR ANY REASON. This is a special tool for internal use only.`;

class WebSearchChatParticipant {
    constructor(private readonly _context: ExtensionContext) { }

    handler: ChatRequestHandler = async (request: ChatRequest, chatContext: ChatContext, stream: ChatResponseStream, token: CancellationToken) => {
        const models = await lm.selectChatModels({
            vendor: 'copilot',
            family: 'gpt-4o'
        });

        const model = models[0];

        const allTools = lm.tools.map((tool): LanguageModelChatTool => {
            return {
                name: tool.id,
                description: tool.description,
                parametersSchema: tool.parametersSchema ?? {}
            };
        });

        const options: LanguageModelChatRequestOptions = {
            justification: 'To parse web search results and summarize an answer',
        };

        let { messages } = await renderPrompt(
            ToolUserPrompt,
            {
                context: chatContext,
                request,
                toolCalls: [],
            },
            { modelMaxPromptTokens: model.maxInputTokens },
            model);

        const toolReferences = [...request.toolReferences];
        const runWithFunctions = async (): Promise<void> => {
            const requestedTool = toolReferences.shift();
            if (requestedTool) {
                options.toolChoice = requestedTool.id;
                options.tools = allTools.filter(tool => tool.name === requestedTool.id);
            } else {
                options.toolChoice = undefined;
                options.tools = allTools;
            }

            const toolCalls: LanguageModelToolCallPart[] = [];

            const response = await model.sendRequest(messages, options, token);
            let responseStr = '';
            for await (const part of response.stream) {
                if (part instanceof LanguageModelTextPart) {
                    stream.markdown(part.value);
                    responseStr += part.value;
                } else if (part instanceof LanguageModelToolCallPart) {
                    // TODO vscode should be doing this
                    part.parameters = JSON.parse(part.parameters);

                    toolCalls.push(part);
                }
            }

            if (toolCalls.length) {
                messages = (await renderPrompt(
                    ToolUserPrompt,
                    {
                        context: chatContext,
                        request: request,
                        toolCalls: toolCalls,
                    },
                    { modelMaxPromptTokens: model.maxInputTokens },
                    model)).messages;

                // RE-enter
                return runWithFunctions();
            }
        };

        await runWithFunctions();
    };
}

export function registerChatParticipant(context: ExtensionContext) {
    const chatParticipant = new WebSearchChatParticipant(context);
    const toolUser = chat.createChatParticipant('vscode-websearchparticipant.websearch', (request, context, response, token) => chatParticipant.handler(request, context, response, token));
    toolUser.iconPath = new ThemeIcon('globe');
    context.subscriptions.push(toolUser);
}
