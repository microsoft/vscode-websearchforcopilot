/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import {
    AssistantMessage,
    BasePromptElementProps,
    contentType as promptTsxContentType,
    PrioritizedList,
    PromptElement,
    PromptElementProps,
    PromptPiece,
    PromptSizing,
    UserMessage,
} from '@vscode/prompt-tsx';
import { TextChunk, ToolMessage } from '@vscode/prompt-tsx/dist/base/promptElements';
import { CancellationToken, CancellationTokenSource, ChatContext, ChatParticipantToolToken, ChatPromptReference, ChatRequest, ChatRequestTurn, ChatResponseAnchorPart, ChatResponseMarkdownPart, ChatResponseTurn, l10n, LanguageModelToolCallPart, LanguageModelToolDescription, LanguageModelToolInvocationOptions, lm, Location, Uri, workspace } from 'vscode';
import { WebSearchTool, WebSearchToolParameters } from './chatTool';

export interface ToolUserProps extends BasePromptElementProps {
    request: ChatRequest;
    context: ChatContext;
    toolCalls: LanguageModelToolCallPart[];
}

export class ToolUserPrompt extends PromptElement<ToolUserProps, void> {
    render(state: void, sizing: PromptSizing) {
        return (
            <>
                <UserMessage priority={60}>
                    Instructions:<br />
                    - The user will ask a question, or ask you to perform a task, and it may
                    require lots of research to answer correctly. There is a selection of
                    tools that let you perform actions or retrieve helpful context to answer
                    the user's question.<br />
                    - If you aren't sure which tool is relevant, you can call multiple
                    tools. You can call tools repeatedly to take actions or gather as much
                    context as needed until you have completed the task fully. Don't give up
                    unless you are sure the request cannot be fulfilled with the tools you
                    have.<br />
                    - Don't make assumptions about the situation- gather context first, then
                    perform the task or answer the question. <br />
                    - Don't ask the user for confirmation to use tools, just use them.<br />
                    - After editing a file, DO NOT show the user a codeblock with the
                    edit or new file contents. Assume that the user can see the result.<br />
                    - DO NOT CALL multi_tool_use.parallel FOR ANY REASON. This is a special tool for internal use only.
                </UserMessage>
                {/* Give older History messages less priority and have them flexGrow last */}
                <History
                    context={this.props.context}
                    start={0}
                    end={this.props.context.history.length - 1}
                    priority={10}
                    flexGrow={3}
                />
                {/* Give the last message a higher priority than the other history messages
                    and reserve space for it to be present by not specifying flex */}
                <History
                    context={this.props.context}
                    start={this.props.context.history.length - 1}
                    end={this.props.context.history.length}
                    priority={20}
                />
                {/* References have a higher priority than history because we care about them more. We also use flexGrow to include
                    as much as we can before we render history. Lastly we use flexReserve to reserve some amount of budget so
                    that they do get reserved some space to render */}
                <PromptReferences
                    references={this.props.request.references}
                    priority={30}
                    flexReserve='/3'
                    flexGrow={2}
                />
                {/* It's the prompt, it needs a higher priority than any of the above */}
                <UserMessage priority={50}>{this.props.request.prompt}</UserMessage>
                {/* Tool calls are slightly more important than references and are given the opportunity to flexGrow before anything else */}
                <ToolCalls priority={40} toolCalls={this.props.toolCalls} toolInvocationToken={this.props.request.toolInvocationToken} flexGrow={1}></ToolCalls>
            </>
        );
    }
}

export interface ToolCallsProps extends BasePromptElementProps {
    toolCalls: LanguageModelToolCallPart[];
    toolInvocationToken: ChatParticipantToolToken;
}

class ToolCalls extends PromptElement<ToolCallsProps, void> {
    render(state: void, sizing: PromptSizing) {
        const assistantToolCalls: any[] = this.props.toolCalls.map(tc => ({ type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.parameters) }, id: tc.toolCallId }));
        return <>
            <AssistantMessage toolCalls={assistantToolCalls}>todo</AssistantMessage>
            {this.props.toolCalls.map(toolCall => {
                const tool = lm.tools.find(t => t.name === toolCall.name);
                if (!tool) {
                    console.error(l10n.t('Tool not found: {0}', toolCall.name));
                    return undefined;
                }

                return <ToolCall tool={tool} toolCall={toolCall} toolInvocationToken={this.props.toolInvocationToken}></ToolCall>;
            })}
            <UserMessage priority={100}>Above is the result of calling one or more tools. The user cannot see the results, so you should explain them to the user if referencing them in your answer.</UserMessage>
        </>;
    }
}

interface ToolCallProps extends BasePromptElementProps {
    tool: LanguageModelToolDescription;
    toolCall: LanguageModelToolCallPart;
    toolInvocationToken: ChatParticipantToolToken;
}

const agentSupportedContentTypes = [promptTsxContentType, 'text/plain'];

const dummyCancellationToken: CancellationToken = new CancellationTokenSource().token;
export class ToolCall extends PromptElement<ToolCallProps, void> {
    async render(state: void, sizing: PromptSizing) {
        const contentType = agentSupportedContentTypes.find(type => this.props.tool.supportedContentTypes.includes(type));
        if (!contentType) {
            console.error(l10n.t('Tool does not support any of the agent\'s content types: {0}', this.props.tool.name));
            return <ToolMessage toolCallId={this.props.toolCall.toolCallId}>Tool unsupported</ToolMessage>;
        }

        // Would be nice if this could just be `sizing`... their types are nearly the same.
        const tokenOptions: LanguageModelToolInvocationOptions<unknown>['tokenOptions'] = {
            tokenBudget: sizing.tokenBudget,
            countTokens: async (content: string) => sizing.countTokens(content),
        };

        // HACK: This is a temporary workaround to allow the tool to access the chat response stream.
        let toolInvocationToken = this.props.toolInvocationToken;
        let parameters: WebSearchToolParameters = this.props.toolCall.parameters as WebSearchToolParameters;
        if (this.props.tool.name === WebSearchTool.ID) {
            toolInvocationToken = undefined;
            parameters.toolInvocationToken = this.props.toolInvocationToken;
        }
        const result = await lm.invokeTool(
            this.props.toolCall.name,
            {
                parameters: this.props.toolCall.parameters,
                requestedContentTypes: [contentType],
                toolInvocationToken,
                tokenOptions
            },
            dummyCancellationToken
        );
        return <>
            <ToolMessage toolCallId={this.props.toolCall.toolCallId}>
                {contentType === 'text/plain' ?
                    result[contentType] :
                    <elementJSON data={result[contentType]}></elementJSON>}
            </ToolMessage>
        </>;
    }
}

interface HistoryProps extends BasePromptElementProps {
    priority: number;
    context: ChatContext;
    start: number;
    end: number;
}

class History extends PromptElement<HistoryProps, void> {
    render(state: void, sizing: PromptSizing) {
        return (
            <PrioritizedList priority={this.props.priority} descending={false}>
                {this.props.context.history.slice(this.props.start, this.props.end).map((message) => {
                    if (message instanceof ChatRequestTurn) {
                        return (
                            <>
                                {<PromptReferences references={message.references} />}
                                <UserMessage>{message.prompt}</UserMessage>
                            </>
                        );
                    } else if (message instanceof ChatResponseTurn) {
                        return (
                            <AssistantMessage>
                                {chatResponseToString(message)}
                            </AssistantMessage>
                        );
                    }
                })}
            </PrioritizedList>
        );
    }
}

function chatResponseToString(response: ChatResponseTurn): string {
    return response.response
        .map((r) => {
            if (r instanceof ChatResponseMarkdownPart) {
                return r.value.value;
            } else if (r instanceof ChatResponseAnchorPart) {
                if (r.value instanceof Uri) {
                    return r.value.fsPath;
                } else {
                    return r.value.uri.fsPath;
                }
            }

            return '';
        })
        .join('');
}

interface PromptReferencesProps extends BasePromptElementProps {
    references: ReadonlyArray<ChatPromptReference>;
}

class PromptReferences extends PromptElement<PromptReferencesProps, void> {
    render(state: void, sizing: PromptSizing): PromptPiece {
        return (
            <UserMessage>
                {this.props.references.map((ref, index) => (
                    <PromptReference ref={ref}></PromptReference>
                ))}
            </UserMessage>
        );
    }
}

interface PromptReferenceProps extends BasePromptElementProps {
    ref: ChatPromptReference;
}

class PromptReference extends PromptElement<PromptReferenceProps> {
    async render(state: void, sizing: PromptSizing): Promise<PromptPiece | undefined> {
        const value = this.props.ref.value;
        if (value instanceof Uri) {
            const fileContents = (await workspace.fs.readFile(value)).toString();
            return (
                <Tag name="context">
                    {value.toString(true)}
                    ``` <br />
                    <TextChunk breakOnWhitespace>{fileContents}</TextChunk><br />
                    ```<br />
                </Tag>
            );
        } else if (value instanceof Location) {
            const rangeText = (await workspace.openTextDocument(value.uri)).getText(value.range);
            return (
                <Tag name="context">
                    {value.uri.toString(true)}:{value.range.start.line + 1}-{value.range.end.line + 1}
                    ```<br />
                    <TextChunk breakOnWhitespace>{rangeText}</TextChunk><br />
                    ```
                </Tag>
            );
        } else if (typeof value === 'string') {
            return <Tag name="context">{value}</Tag>;
        }
    }
}

export type TagProps = PromptElementProps<{
    name: string;
}>;

export class Tag extends PromptElement<TagProps> {
    private static readonly _regex = /^[a-zA-Z_][\w\.\-]*$/;

    render() {
        const { name } = this.props;

        if (!Tag._regex.test(name)) {
            throw new Error(l10n.t('Invalid tag name: {0}', name));
        }

        return (
            <>
                {'<' + name + '>'}<br />
                <>
                    {this.props.children}<br />
                </>
                {'</' + name + '>'}<br />
            </>
        );
    }
}
