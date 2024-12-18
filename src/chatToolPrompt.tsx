/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import {
    AssistantMessage,
    BasePromptElementProps,
    PromptElement,
    PromptPiece,
    PromptSizing,
    UserMessage
} from '@vscode/prompt-tsx';
import { FilesContext, History, Tag, ToolCall } from '@vscode/prompt-tsx-elements';
import { Chunk, TextChunk, ToolCall as ToolCallBase } from '@vscode/prompt-tsx/dist/base/promptElements';
import { ChatContext, ChatParticipantToolToken, ChatPromptReference, ChatRequest, LanguageModelToolCallPart, LanguageModelToolResult, Location, Uri, workspace } from 'vscode';

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
                {/* Give older History messages less priority and have them flexGrow last
                    Give the last message a higher priority than the other history messages
                    and reserve space for it to be present by not specifying flex */}
                <History
                    history={this.props.context.history}
                    passPriority
                    older={10}
                    newer={20}
                    flexGrow={3}
                    n={1}
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

class ToolCalls extends PromptElement<ToolCallsProps, void> {
	async render(state: void, sizing: PromptSizing) {
		if (!this.props.toolCallRounds.length) {
			return undefined;
		}

		// Note- the final prompt must end with a UserMessage
		return <>
			{this.props.toolCallRounds.map(round => this.renderOneToolCallRound(round))}
			<UserMessage>Above is the result of calling one or more tools. The user cannot see the results, so you should explain them to the user if referencing them in your answer.</UserMessage>
		</>;
	}

	private renderOneToolCallRound(round: ToolCallRound) {
		const assistantToolCalls: ToolCallBase[] = round.toolCalls.map(tc => ({ type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.input) }, id: tc.callId }));
		// TODO- just need to adopt prompt-tsx update in vscode-copilot
		return (
			<Chunk>
				<AssistantMessage toolCalls={assistantToolCalls}>{round.response}</AssistantMessage>
				{round.toolCalls.map(toolCall =>
					<ToolCall call={toolCall} invocationToken={this.props.toolInvocationToken} result={this.props.toolCallResults[toolCall.callId]} />)}
			</Chunk>);
	}
}

interface PromptReferencesProps extends BasePromptElementProps {
    references: ReadonlyArray<ChatPromptReference>;
}

class PromptReferences extends PromptElement<PromptReferencesProps, void> {
    render(state: void, sizing: PromptSizing): PromptPiece {
        return (
            <UserMessage>
                {this.props.references.map(ref => (
                    <FilesContext files={{
                        value: ref.value as Exclude<typeof ref.value, unknown>,
                        // turn off expansion to avoid diluting the information being search for
                        expand: false,
                    }} />
                ))}
            </UserMessage>
        );
    }
}
