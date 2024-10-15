/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ChatParticipantToolToken, ChatResponseStream } from "vscode";

// HUGE HACK: This is a global state that is used to store the chat response stream
// We use this so that we can call the stream methods from the WebSearchTool.
// This allows us access to the references method that lets us associate progress and references together
class ChatState {
    private _map: Map<string, ChatResponseStream> = new Map();

    get(token: ChatParticipantToolToken) {
        // Who knows how long this will cast right :)
        const casted = token as { sessionId: string };
        return this._map.get(casted.sessionId);
    }

    set(token: ChatParticipantToolToken, stream: ChatResponseStream) {
        // Who knows how long this will cast right :)
        const casted = token as { sessionId: string };
        this._map.set(casted.sessionId, stream);
        // remove the stream after a certain amount of time
        setTimeout(() => {
            this._map.delete(casted.sessionId);
        }, 1000 * 60 * 5); // 5 minutes
    }
}

export default new ChatState();
