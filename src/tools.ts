import { Disposable, LanguageModelChatTool, LanguageModelTool, lm } from "vscode";

interface LMTool {
    ctor: new <T>() => LanguageModelTool<T>;
    instance?: LanguageModelTool<any>;
    details: LanguageModelChatTool;
}

const internalTools = new Map<string, LMTool>();

export function getTools(): Array<LanguageModelChatTool> {
    return [...getPublicTools(), ...getInternalTools()];
}

export function getPublicTools(): Array<LanguageModelChatTool> {
    return lm.tools.map(tool => ({
        name: tool.id,
        description: tool.description,
        parametersSchema: tool.parametersSchema,
    }));
}

export function getInternalTools(): Array<LanguageModelChatTool> {
    return Array.from(internalTools.values()).map(tool => tool.details);
}

export function getInternalTool<T>(id: string): LanguageModelTool<T> | undefined {
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
        details,
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
