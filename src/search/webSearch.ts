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
				'X-Client-Name': 'vscode-websearchforcopilot',
			},
			body: JSON.stringify(body),
		});

		await TavilyEngine.checkResponse(response);
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
				'X-Client-Name': 'vscode-websearchforcopilot',
			},
			body: JSON.stringify({
				urls: params.urls,
				api_key: params.api_key,
			}),
		});

		await TavilyEngine.checkResponse(req);
		return (await req.json()) as ITavilyExtractResponse;
	}

	private static async checkResponse(response: Response): Promise<void> {
		if (response.ok) {
			return;
		}

		let detail = '';
		try {
			const text = await response.text();
			try {
				const body = JSON.parse(text);
				const error = body?.detail ?? body?.error ?? body?.message;
				detail = typeof error === 'string' ? error : error ? JSON.stringify(error) : '';
			} catch {
				detail = text;
			}
		} catch {
			// Keep the HTTP status even if the error response body cannot be read.
		}
		throw new Error(`Tavily request failed (HTTP ${response.status})${detail ? `: ${detail}` : ''}`);
	}
}


