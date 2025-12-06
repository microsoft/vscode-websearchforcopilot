/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ITavilySearchOptions, IWebSearchResults, ITavilyExtractParameters, ITavilyExtractResponse } from './webSearchTypes';

export class TavilyEngine {
	static TAVILY_API_BASE_URL = 'https://api.tavily.com';

	static async search(query: string, url?: string): Promise<IWebSearchResults> {
		const session = await vscode.authentication.getSession('tavily', [], {
			createIfNone: true,
		});

		const body: ITavilySearchOptions = {
			api_key: session.accessToken,
			query: query,
			include_domains: url ? [url] : [],
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


