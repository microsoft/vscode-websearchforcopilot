/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ExtensionContext, ChatRequestHandler, ChatRequest, ChatContext, ChatResponseStream, CancellationToken, lm, LanguageModelChatRequestOptions, chat, ThemeIcon, LanguageModelTextPart, LanguageModelToolCallPart, LanguageModelChatTool, Uri, l10n } from "vscode";
import { renderPrompt } from '@vscode/prompt-tsx';
import { ToolUserPrompt } from "./chatToolPrompt";
import { WebSearchTool } from "./chatTool";

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
            justification: l10n.t('To analyze web search results and summarize an answer'),
        };
        let { messages, references } = await renderPrompt(
            ToolUserPrompt,
            {
                context: chatContext,
                request,
                toolCalls: [],
            },
            { modelMaxPromptTokens: model.maxInputTokens },
            model);

        const toolReferences = [...request.toolReferences.filter(ref => ref.id === WebSearchTool.ID), { id: WebSearchTool.ID }];
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
                const result = await renderPrompt(
                    ToolUserPrompt,
                    {
                        context: chatContext,
                        request: request,
                        toolCalls: toolCalls,
                    },
                    { modelMaxPromptTokens: model.maxInputTokens },
                    model);
                messages = result.messages;
                references = result.references;

                // RE-enter
                return runWithFunctions();
            }
        };

        await runWithFunctions();
        for (const ref of references) {
            // TODO: why `as`?
            stream.reference(ref.anchor as Uri);
        }
    };
}

export function registerChatParticipant(context: ExtensionContext) {
    const chatParticipant = new WebSearchChatParticipant(context);
    const toolUser = chat.createChatParticipant('vscode-websearchparticipant.websearch', (request, context, response, token) => chatParticipant.handler(request, context, response, token));
    toolUser.iconPath = new ThemeIcon('globe');
    context.subscriptions.push(toolUser);
}
