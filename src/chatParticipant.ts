import { Location, LanguageModelChatResponseToolCallPart, LanguageModelToolResult, ExtensionContext, ChatRequestHandler, ChatRequest, ChatContext, ChatResponseStream, CancellationToken, lm, LanguageModelChatTool, LanguageModelChatRequestOptions, LanguageModelChatMessage, LanguageModelChatResponseTextPart, LanguageModelChatMessageToolResultPart, chat, ThemeIcon, ChatPromptReference, Uri, workspace, ChatRequestTurn, ChatResponseTurn, ChatResponseMarkdownPart, ChatResponseAnchorPart } from "vscode";
import { WebSearchTool } from "./search/webSearch";
import { getInternalTools, getTools } from "./tools";

interface IToolCall {
    // tool: LanguageModelToolDescription;
    call: LanguageModelChatResponseToolCallPart;
    result: Thenable<LanguageModelToolResult>;
}

const llmInstructions = `Instructions:
- The user will ask a question, or ask you to perform a task, and it may require lots of research to answer correctly. There is a selection of tools that let you perform actions or retrieve helpful context to answer the user's question.
- If you aren't sure which tool is relevant, you can call multiple tools. You can call tools repeatedly to take actions or gather as much context as needed until you have completed the task fully. Don't give up unless you are sure the request cannot be fulfilled with the tools you have.
- Don't make assumptions about the situation- gather context first, then perform the task or answer the question.
- Don't ask the user for confirmation to use tools, just use them.
- After editing a file, DO NOT show the user a codeblock with the edit or new file contents. Assume that the user can see the result.
- DO NOT CALL multi_tool_use.parallel FOR ANY REASON. This is a special tool for internal use only.`;

class WebSearchChatParticipant {
    private _webSearchTool = new WebSearchTool();

    constructor(private readonly _context: ExtensionContext) { }

    handler: ChatRequestHandler = async (request: ChatRequest, chatContext: ChatContext, stream: ChatResponseStream, token: CancellationToken) => {
        const models = await lm.selectChatModels({
            vendor: 'copilot',
            family: 'gpt-4o'
        });
        const model = models[0];

        const allTools = getTools();
        const ourTools = getInternalTools();

        const options: LanguageModelChatRequestOptions = {
            justification: 'To parse web search results and summarize an answer',
        };

        const messages = [
            LanguageModelChatMessage.User(llmInstructions),
        ];
        messages.push(...await this.getHistoryMessages(chatContext));
        if (request.references.length) {
            // get current context
            messages.push(LanguageModelChatMessage.User(await this.getContextMessage(request.references)));
        }
        messages.push(LanguageModelChatMessage.User(request.prompt));

        const toolReferences = [...request.toolReferences];
        const runWithFunctions = async (): Promise<void> => {
            const requestedTool = toolReferences.shift();
            if (requestedTool) {
                options.toolChoice = requestedTool.id;
                options.tools = allTools.filter(tool => tool.name === requestedTool.id);
            } else {
                options.toolChoice = undefined;
                options.tools = ourTools;
            }

            const toolCalls: IToolCall[] = [];

            const response = await model.sendRequest(messages, options, token);

            for await (const part of response.stream) {
                if (part instanceof LanguageModelChatResponseTextPart) {
                    stream.markdown(part.value);
                } else if (part instanceof LanguageModelChatResponseToolCallPart) {
                    const tool = allTools.find(tool => tool.name === part.name);
                    if (!tool) {
                        // BAD tool choice?
                        throw new Error('Got invalid tool choice: ' + part.name);
                    }
                    let parameters: any;
                    try {
                        parameters = JSON.parse(part.parameters);
                    } catch (err) {
                        throw new Error(`Got invalid tool use parameters: "${part.parameters}". (${(err as Error).message})`);
                    }

                    // TODO support prompt-tsx here

                    const requestedContentType = 'text/plain';
                    if (tool.name === WebSearchTool.ID) {
                        toolCalls.push({
                            call: part,
                            result: this._webSearchTool.invoke({ parameters, toolInvocationToken: request.toolInvocationToken, requestedContentTypes: [requestedContentType] }, token),
                            // tool
                        });
                    } else {
                        toolCalls.push({
                            call: part,
                            result: lm.invokeTool(tool.name, { parameters, toolInvocationToken: request.toolInvocationToken, requestedContentTypes: [requestedContentType] }, token),
                            // tool
                        });
                    }
                }
            }

            if (toolCalls.length) {
                const assistantMsg = LanguageModelChatMessage.Assistant('');
                assistantMsg.content2 = toolCalls.map(toolCall => new LanguageModelChatResponseToolCallPart(toolCall.call.name, toolCall.call.toolCallId, toolCall.call.parameters));
                messages.push(assistantMsg);
                for (const toolCall of toolCalls) {
                    // NOTE that the result of calling a function is a special content type of a USER-message
                    const message = LanguageModelChatMessage.User('');

                    message.content2 = [new LanguageModelChatMessageToolResultPart(toolCall.call.toolCallId, (await toolCall.result)['text/plain']!)];
                    messages.push(message);
                }

                // IMPORTANT The prompt must end with a USER message (with no tool call)
                messages.push(LanguageModelChatMessage.User(`Above is the result of calling the functions ${toolCalls.map(call => call.call.name).join(', ')}. The user cannot see this result, so you should explain it to the user if referencing it in your answer.`));

                // RE-enter
                return runWithFunctions();
            }
        };

        await runWithFunctions();
    };

    private async getContextMessage(references: ReadonlyArray<ChatPromptReference>): Promise<string> {
        const contextParts = (await Promise.all(references.map(async ref => {
            if (ref.value instanceof Uri) {
                const fileContents = (await workspace.fs.readFile(ref.value)).toString();
                return `${ref.value.fsPath}:\n\`\`\`\n${fileContents}\n\`\`\``;
            } else if (ref.value instanceof Location) {
                const rangeText = (await workspace.openTextDocument(ref.value.uri)).getText(ref.value.range);
                return `${ref.value.uri.fsPath}:${ref.value.range.start.line + 1}-${ref.value.range.end.line + 1}\n\`\`\`${rangeText}\`\`\``;
            } else if (typeof ref.value === 'string') {
                return ref.value;
            }
            return null;
        }))).filter(part => part !== null) as string[];

        const context = contextParts
            .map(part => `<context>\n${part}\n</context>`)
            .join('\n');
        return `The user has provided these references:\n${context}`;
    }

    private async getHistoryMessages(context: ChatContext): Promise<LanguageModelChatMessage[]> {
        const messages: LanguageModelChatMessage[] = [];
        for (const message of context.history) {
            if (message instanceof ChatRequestTurn) {
                if (message.references.length) {
                    messages.push(LanguageModelChatMessage.User(await this.getContextMessage(message.references)));
                }
                messages.push(LanguageModelChatMessage.User(message.prompt));
            } else if (message instanceof ChatResponseTurn) {
                const strResponse = message.response.map(part => {
                    if (part instanceof ChatResponseMarkdownPart) {
                        return part.value.value;
                    } else if (part instanceof ChatResponseAnchorPart) {
                        if (part.value instanceof Location) {
                            return ` ${part.value.uri.fsPath}:${part.value.range.start.line}-${part.value.range.end.line} `;
                        } else if (part.value instanceof Uri) {
                            return ` ${part.value.fsPath} `;
                        }
                    }
                }).join('');
                messages.push(LanguageModelChatMessage.Assistant(strResponse));
            }
        }

        return messages;
    }
}

export function registerChatParticipant(context: ExtensionContext) {
    const chatParticipant = new WebSearchChatParticipant(context);
    const toolUser = chat.createChatParticipant('vscode-websearchparticipant.websearch', (request, context, response, token) => chatParticipant.handler(request, context, response, token));
    toolUser.iconPath = new ThemeIcon('web');
    context.subscriptions.push(toolUser);
}
