/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IWebSearchResults {
	urls: {
		url: string;
		title?: string;
		snippet?: string;
	}[];
	answer?: string;
}

export interface ITavilySearchOptions {
	api_key: string;
	query: string;
	search_depth?: 'basic' | 'advanced';
	include_answer?: boolean;
	include_images?: boolean;
	include_raw_content?: boolean;
	max_results?: number;
	include_domains?: string[];
	exclude_domains?: string[];
}

export interface ITavilyExtractParameters {
	api_key: string;
	urls: string[];
}

export interface ITavilyExtractResponse {
	results: { url: string; raw_content: string }[];
	failed_results: any[];
	response_time: number;
}
