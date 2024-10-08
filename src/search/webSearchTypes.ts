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
export interface ITavilySearchResponse {
	query: string;
	results: ITavilySearchResult[];
	answer?: string;
	images?: string[];
	follow_up_questions?: string[];
	response_time: string;
}
export interface ITavilySearchResult {
	url: string;
	title: string;
	content: string;
	raw_content?: string;
	score: string;
}

export interface IBingSearchResponse {}

export interface IBingSearchOptions {
	q: string;
}

export interface IWebSearchToolParameters {
	api_key: string;
	query: string;
	urls?: string[];
}

export interface IWebSearchToolResults {
	urls: {
		url: string;
		title?: string;
		snippet?: string;
	}[];
	answer?: string;
}

export interface IExtractParameters {
	api_key: string;
	urls: string[];
}

export interface IExtractResponse {
	results: { url: string; raw_content: string }[];
	failed_results: any[];
	response_time: number;
}
