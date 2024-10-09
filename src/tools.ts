import { Disposable, LanguageModelChatTool, LanguageModelTool, lm } from "vscode";

interface LMTool<O, T extends LanguageModelTool<O>> {
    ctor: new () => T;
    instance?: T;
    details: ILanguageModelToolDetails;
}

export interface ILanguageModelToolDetails extends LanguageModelChatTool {
    type: 'internal' | 'public';
}

const internalTools = new Map<string, LMTool<any, any>>();

export function getTools(): Array<ILanguageModelToolDetails> {
    return [...getPublicTools(), ...getInternalTools()];
}

export function getPublicTools(): Array<ILanguageModelToolDetails> {
    return lm.tools.map(tool => ({
        name: tool.id,
        type: 'public',
        description: tool.description,
        parametersSchema: tool.parametersSchema,
    }));
}

export function getInternalTools(): Array<ILanguageModelToolDetails> {
    return Array.from(internalTools.values()).map(tool => ({
        ...tool.details,
        type: 'internal',
    }));
}

export function getInternalTool<O, T extends LanguageModelTool<O>>(id: string): T | undefined {
    const tool = internalTools.get(id);
    if (!tool) {
        return undefined;
    }
    if (tool.instance) {
        return tool.instance;
    }
    tool.instance = new tool.ctor();
    return tool.instance;
}

export function registerInternalTool(id: string, details: LanguageModelChatTool, ctor: new () => LanguageModelTool<any>): Disposable {
    internalTools.set(id, {
        ctor,
        details: {
            ...details,
            type: 'internal',
        },
    });
    return {
        dispose() {
            unregisterInternalTool(id);
        },
    };
}

export function unregisterInternalTool(id: string): void {
    internalTools.delete(id);
}
