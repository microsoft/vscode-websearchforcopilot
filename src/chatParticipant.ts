/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ExtensionContext, ChatRequestHandler, ChatRequest, ChatContext, ChatResponseStream, CancellationToken, lm, LanguageModelChatRequestOptions, chat, ThemeIcon, LanguageModelTextPart, LanguageModelToolCallPart, LanguageModelChatTool, Uri, l10n, LanguageModelChatToolMode, LanguageModelToolResult } from "vscode";
import { ToolCallRound, ToolResultMetadata, ToolUserPrompt } from "./chatToolPrompt";
import { WebSearchTool } from "./chatTool";
import Logger from "./logger";
import { renderPrompt } from "./promptTracing";

export interface TsxToolUserMetadata {
    toolCallsMetadata: ToolCallsMetadata;
}

export interface ToolCallsMetadata {
    toolCallRounds: ToolCallRound[];
    toolCallResults: Record<string, LanguageModelToolResult>;
}

class WebSearchChatParticipant {
    constructor(private readonly _context: ExtensionContext) { }

    handler: ChatRequestHandler = async (request: ChatRequest, context: ChatContext, stream: ChatResponseStream, token: CancellationToken) => {
        const model = request.model;
        Logger.debug(`Using model ${model.name}`);

        const allTools = lm.tools.map((tool): LanguageModelChatTool => {
            return {
                name: tool.name,
                description: tool.description,
                parametersSchema: tool.parametersSchema ?? {}
            };
        });

        const options: LanguageModelChatRequestOptions = {
            justification: l10n.t('To analyze web search results and summarize an answer'),
        };

        let { messages, references } = await renderPrompt(
            { modelMaxPromptTokens: model.maxInputTokens },
            ToolUserPrompt,
            {
                context,
                request,
                toolCallRounds: [],
                toolCallResults: {}
            },
            model,
            token
        );

        // Put our tool at the very end so that it processes the search query after resolving all other variables
        const toolReferences = [...request.toolReferences.filter(ref => ref.name === WebSearchTool.ID), { name: WebSearchTool.ID }];
        const accumulatedToolResults: Record<string, LanguageModelToolResult> = {};
        const toolCallRounds: ToolCallRound[] = [];
        const runWithFunctions = async (): Promise<void> => {
            const requestedTool = toolReferences.shift();
            if (requestedTool) {
                options.toolMode = LanguageModelChatToolMode.Required;
                options.tools = allTools.filter(tool => tool.name === requestedTool.name);
            } else {
                options.toolMode = undefined;
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
                    toolCalls.push(part);
                }
            }

            if (toolCalls.length) {
                toolCallRounds.push({
                    response: responseStr,
                    toolCalls
                });
                const result = await renderPrompt(
                    { modelMaxPromptTokens: model.maxInputTokens },
                    ToolUserPrompt,
                    {
                        context,
                        request,
                        toolCallRounds,
                        toolCallResults: accumulatedToolResults
                    },
                    model,
                    token
                );
                messages = result.messages;
                references = result.references;

                const toolResultMetadata = result.metadatas.getAll(ToolResultMetadata);
                if (toolResultMetadata?.length) {
                    toolResultMetadata.forEach(meta => accumulatedToolResults[meta.toolCallId] = meta.result);
                }
                // RE-enter
                return runWithFunctions();
            }
        };

        await runWithFunctions();
        for (const ref of references) {
            // TODO: why `as`?
            stream.reference(ref.anchor as Uri);
        }

        return {
            metadata: {
                toolCallsMetadata: {
                    toolCallResults: accumulatedToolResults,
                    toolCallRounds
                }
            } satisfies TsxToolUserMetadata
        };
    };
}

export function registerChatParticipant(context: ExtensionContext) {
    const chatParticipant = new WebSearchChatParticipant(context);
    const toolUser = chat.createChatParticipant('vscode-websearchforcopilot.websearch', (request, context, response, token) => chatParticipant.handler(request, context, response, token));
    toolUser.iconPath = new ThemeIcon('globe');
    context.subscriptions.push(toolUser);
}
