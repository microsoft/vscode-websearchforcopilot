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
    PromptMetadata,
} from '@vscode/prompt-tsx';
import { Chunk, TextChunk, ToolCall, ToolMessage, ToolResult } from '@vscode/prompt-tsx/dist/base/promptElements';
import { CancellationToken, CancellationTokenSource, ChatContext, ChatParticipantToolToken, ChatPromptReference, ChatRequest, ChatRequestTurn, ChatResponseAnchorPart, ChatResponseMarkdownPart, ChatResponseTurn, l10n, LanguageModelPromptTsxPart, LanguageModelTextPart, LanguageModelToolCallPart, LanguageModelToolResult, LanguageModelToolTokenizationOptions, lm, Location, Uri, workspace } from 'vscode';

export interface ToolUserProps extends BasePromptElementProps {
    request: ChatRequest;
    context: ChatContext;
    toolCallRounds: ToolCallRound[];
	toolCallResults: Record<string, LanguageModelToolResult>;
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
                    - DO NOT CALL multi_tool_use.parallel FOR ANY REASON. This is a special tool for internal use only.<br />
                    - Today's date is {new Date().toLocaleDateString()} so keep that in mind.
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
                <ToolCalls
					toolCallRounds={this.props.toolCallRounds}
					toolInvocationToken={this.props.request.toolInvocationToken}
					toolCallResults={this.props.toolCallResults}>
				</ToolCalls>
            </>
        );
    }
}

export interface ToolCallRound {
	response: string;
	toolCalls: LanguageModelToolCallPart[];
}

interface ToolCallsProps extends BasePromptElementProps {
	toolCallRounds: ToolCallRound[];
	toolCallResults: Record<string, LanguageModelToolResult>;
	toolInvocationToken: ChatParticipantToolToken | undefined;
}

const dummyCancellationToken: CancellationToken = new CancellationTokenSource().token;

class ToolCalls extends PromptElement<ToolCallsProps, void> {
	async render(state: void, sizing: PromptSizing) {
		if (!this.props.toolCallRounds.length) {
			return undefined;
		}

		// Note- the final prompt must end with a UserMessage
		return <>
			{this.props.toolCallRounds.map(round => this.renderOneToolCallRound(round))}
			<UserMessage>Above is the result of calling one or more tools. The user cannot see the results, so you should explain them to the user if referencing them in your answer.</UserMessage>
		</>
	}

	private renderOneToolCallRound(round: ToolCallRound) {
		const assistantToolCalls: ToolCall[] = round.toolCalls.map(tc => ({ type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.parameters) }, id: tc.callId }));
		// TODO- just need to adopt prompt-tsx update in vscode-copilot
		return (
			<Chunk>
				<AssistantMessage toolCalls={assistantToolCalls}>{round.response}</AssistantMessage>
				{round.toolCalls.map(toolCall =>
					<ToolCallElement toolCall={toolCall} toolInvocationToken={this.props.toolInvocationToken} toolCallResult={this.props.toolCallResults[toolCall.callId]}></ToolCallElement>)}
			</Chunk>);
	}
}

interface ToolCallElementProps extends BasePromptElementProps {
	toolCall: LanguageModelToolCallPart;
	toolInvocationToken: ChatParticipantToolToken | undefined;
	toolCallResult: LanguageModelToolResult | undefined;
}

class ToolCallElement extends PromptElement<ToolCallElementProps, void> {
	async render(state: void, sizing: PromptSizing): Promise<PromptPiece | undefined> {
		const tool = lm.tools.find(t => t.name === this.props.toolCall.name);
		if (!tool) {
			console.error(`Tool not found: ${this.props.toolCall.name}`);
			return <ToolMessage toolCallId={this.props.toolCall.callId}>Tool not found</ToolMessage>;
		}

		const tokenizationOptions: LanguageModelToolTokenizationOptions = {
			tokenBudget: sizing.tokenBudget,
			countTokens: async (content: string) => sizing.countTokens(content),
		};

		const toolResult = this.props.toolCallResult ??
			await lm.invokeTool(this.props.toolCall.name, { parameters: this.props.toolCall.parameters, toolInvocationToken: this.props.toolInvocationToken, tokenizationOptions }, dummyCancellationToken);

		// Important- since these parts may have been serialized/deserialized via ChatResult metadata, we need to check their types
		// in a more flexible way. Extensions should not have to do this, vscode will have a better solution in the future.
		toolResult.content = toolResult.content.map(part => {
			if (part instanceof LanguageModelTextPart || part instanceof LanguageModelPromptTsxPart) {
				return part;
			} else if ((part as LanguageModelPromptTsxPart).mime) {
				return new LanguageModelPromptTsxPart((part as LanguageModelPromptTsxPart).value, (part as LanguageModelPromptTsxPart).mime);
			} else if (typeof (part as LanguageModelTextPart).value === 'string') {
				return new LanguageModelTextPart((part as LanguageModelTextPart).value);
			}
		});
		return (
			<ToolMessage toolCallId={this.props.toolCall.callId}>
				<meta value={new ToolResultMetadata(this.props.toolCall.callId, toolResult)}></meta>
				<ToolResult data={toolResult} />
			</ToolMessage>
		);
	}
}

export class ToolResultMetadata extends PromptMetadata {
	constructor(
		public toolCallId: string,
		public result: LanguageModelToolResult,
	) {
		super();
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
