/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { ITavilySearchOptions, IWebSearchResults, ITavilyExtractParameters, ITavilyExtractResponse, ISearchEngine } from './webSearchTypes';

export function registerWebSearch(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('vscode-websearchparticipant.tavilySearch', async () => {
		const query = await vscode.window.showInputBox({
			prompt: 'Enter your search query',
			placeHolder: 'Search...',
		});

		if (!query) {
			vscode.window.showErrorMessage('Search query cannot be empty.');
			return;
		}

		const domain = await vscode.window.showInputBox({
			prompt: 'Enter the domain to search within',
			placeHolder: 'example.com',
		});

		const result = await TavilyEngine.search(query, domain);
		console.log(result);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('vscode-websearchparticipant.bingSearch', async () => {
		const query = await vscode.window.showInputBox({
			prompt: 'Enter your search query',
			placeHolder: 'Search...',
		});

		if (!query) {
			vscode.window.showErrorMessage('Search query cannot be empty.');
			return;
		}

		const result = await BingEngine.search(query);
		console.log(result);
	}));
}


export class SearchEngineManager {
	static async search(query: string): Promise<IWebSearchResults> {
		const engineChoice = vscode.workspace.getConfiguration('websearch').get<'tavily' | 'bing'>('preferredEngine');
		if (engineChoice === 'tavily') {
			return await TavilyEngine.search(query);
		} else {
			return await BingEngine.search(query);
		}
	}
}


export class TavilyEngine {
	static TAVILY_API_BASE_URL = 'https://api.tavily.com';

	static async search(query: string, url?: string): Promise<IWebSearchResults> {
		const session = await vscode.authentication.getSession('tavily', [], {
			createIfNone: true,
		});

		const body: ITavilySearchOptions = {
			api_key: session.accessToken,
			query: query,
			include_domains: [url ?? ''],
			include_answer: true,
		};

		const response = await fetch(TavilyEngine.TAVILY_API_BASE_URL + '/search', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(body),
		});

		const raw = await response.json();
		const result: IWebSearchResults = {
			urls: raw.results.map((x: any) => {
				return {
					url: x.url,
					title: x.title,
					snippet: x.content,
				};
			}),
			answer: raw.answer,
		};
		return result;
	}

	static async extract(params: ITavilyExtractParameters): Promise<ITavilyExtractResponse> {
		const req = await fetch(TavilyEngine.TAVILY_API_BASE_URL + '/extract', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				urls: params.urls,
				api_key: params.api_key,
			}),
		});

		return (await req.json()) as ITavilyExtractResponse;
	}
}

export class BingEngine {
	static BING_API_BASE_URL = 'https://api.bing.microsoft.com';

	static async search(query: string): Promise<IWebSearchResults> {
		const session = await vscode.authentication.getSession('bing', [], {
			createIfNone: true,
		});

		const response = await fetch(
			BingEngine.BING_API_BASE_URL + '/v7.0/search?q=' + encodeURIComponent(query),
			{
				method: 'GET',
				headers: {
					'Ocp-Apim-Subscription-Key': session.accessToken,
				},
			}
		);

		const raw = await response.json();
		const result: IWebSearchResults = {
			urls: raw.webPages.value.map((x: any) => {
				return {
					url: x.url,
					title: x.name,
					snippet: x.snippet,
				};
			}),
			answer: raw.webPages.value[0].snippet,
		};
		return result;
	}
}
