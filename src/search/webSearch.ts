import * as vscode from 'vscode';
import {
	IWebSearchToolParameters,
	ITavilySearchOptions,
	IWebSearchToolResults,
	IExtractParameters,
	IExtractResponse,
} from './webSearchTypes';

export function registerWebSearch(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('vscode-websearchparticipant.tavilySearch', async () => {
			const auth = await vscode.authentication.getSession('tavily', [], {
				createIfNone: true,
				clearSessionPreference: true,
			});

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

			const result = await WebSearchTool.tavilySearch({
				api_key: auth.accessToken,
				query: query,
				urls: domain ? [domain] : undefined,
			});

			console.log(result);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('vscode-websearchparticipant.bingSearch', async () => {
			// const auth = await vscode.authentication.getSession('bing', [], {
			// 	createIfNone: true,
			// 	clearSessionPreference: true,
			// });

			const query = await vscode.window.showInputBox({
				prompt: 'Enter your search query',
				placeHolder: 'Search...',
			});

			if (!query) {
				vscode.window.showErrorMessage('Search query cannot be empty.');
				return;
			}

			const result = await WebSearchTool.bingSearch({
				api_key: '72d22ec885834394b1c276447b8a7656', // this is our key lol
				query: query,
				urls: undefined,
			});

			console.log(result);
		})
	);
}

export class WebSearchTool implements vscode.LanguageModelTool<IWebSearchToolParameters> {
	static TAVILY_API_BASE_URL = 'https://api.tavily.com';
	static BING_API_BASE_URL = 'https://api.bing.microsoft.com';

	async invoke(
		options: vscode.LanguageModelToolInvocationOptions<IWebSearchToolParameters>,
		token: vscode.CancellationToken
	): Promise<vscode.ProviderResult<vscode.LanguageModelToolResult>> {
		// TODO: maybe a slash command to intelligently pick bing vs tavily? idk
		return WebSearchTool.tavilySearch(options.parameters as IWebSearchToolParameters);
	}

	static async tavilySearch(params: IWebSearchToolParameters) {
		const body: ITavilySearchOptions = {
			api_key: params.api_key,
			query: params.query,
			include_domains: params.urls,
			include_answer: true,
		};

		const response = await fetch(WebSearchTool.TAVILY_API_BASE_URL + '/search', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(body),
		});

		const raw = await response.json();
		const result: IWebSearchToolResults = {
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

	static async bingSearch(params: IWebSearchToolParameters) {
		const response = await fetch(
			WebSearchTool.BING_API_BASE_URL + '/v7.0/search?q=' + encodeURIComponent(params.query),
			{
				method: 'GET',
				headers: {
					'Ocp-Apim-Subscription-Key': params.api_key,
				},
			}
		);

		const raw = await response.json();
		const result: IWebSearchToolResults = {
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

	static async tavilyExtract(params: IExtractParameters): Promise<IExtractResponse> {
		const req = await fetch(WebSearchTool.TAVILY_API_BASE_URL + '/extract', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				urls: params.urls,
				api_key: params.api_key,
			}),
		});

		return (await req.json()) as IExtractResponse;
	}
}
