export interface ISearchEngine {
	search(query: string): Promise<IWebSearchResults>;
	extract?: (params: ITavilyExtractParameters) => Promise<ITavilyExtractResponse>;
}

export interface IWebSearchToolParameters {
	api_key: string;
	query: string;
	urls?: string[];
}

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
