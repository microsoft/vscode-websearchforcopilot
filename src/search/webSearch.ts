import * as vscode from 'vscode';

interface SearchOptions {
    /** Your Tavily API key. (required) */
    api_key: string;
    /** Search query. (required) */
    query: string;
    /** The depth of the search. It can be basic or advanced. Default is basic for quick results and advanced for indepth high quality results but longer response time. Advanced calls equals 2 requests. */
    search_depth?: 'basic' | 'advanced';
    /** Include answers in the search results. Default is `false`. */
    include_answer?: boolean;
    /** Include a list of query related images in the response. Default is `false`. */
    include_images?: boolean;
    /** Include raw content in the search results. Default is `false`. */
    include_raw_content?: boolean;
    /** The number of maximum search results to return. Default is `5`. */
    max_results?: number;
    /** A list of domains to specifically include in the search results. Default is `undefined`, which includes all domains. */
    include_domains?: string[];
    /** A list of domains to specifically exclude from the search results. Default is `undefined`, which doesn't exclude any domains. */
    exclude_domains?: string[];
}
interface SearchResponse {
    /** The search query. */
    query: string;
    /** A list of sorted search results ranked by relevancy. */
    results: SearchResult[];
    /** The answer to your search query. */
    answer?: string;
    /** A list of query related image urls. */
    images?: string[];
    /** A list of suggested research follow up questions related to original query. */
    follow_up_questions?: string[];
    /** How long it took to generate a response. */
    response_time: string;
}
interface SearchResult {
    /** The url of the search result. */
    url: string;
    /** The title of the search result page. */
    title: string;
    /**
     * The most query related content from the scraped url. We use proprietary AI and algorithms to extract only the most relevant content from each url, to optimize for context quality and size.
     */
    content: string;
    /** The parsed and cleaned HTML of the site. For now includes parsed text only. */
    raw_content?: string;
    /** The relevance score of the search result. */
    score: string;
}

interface IWebSearchParameters {
    api_key: string;
    query: string;
    urls?: string[];
}

interface IExtractParameters {
    api_key: string;
    urls: string[];
}

interface IExtractResponse {
    results: {url: string, raw_content:string}[];
    failed_results: any[];
    response_time: number;
}

export function registerWebSearch(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('vscode-websearchparticipant.search', async () => {
        const auth = await vscode.authentication.getSession('tavily', [], { createIfNone: true, clearSessionPreference: true });

        const query = await vscode.window.showInputBox({
            prompt: 'Enter your search query',
            placeHolder: 'Search...'
        });

        if (!query) {
            vscode.window.showErrorMessage('Search query cannot be empty.');
            return;
        }

        const domain = await vscode.window.showInputBox({
            prompt: 'Enter the domain to search within',
            placeHolder: 'example.com'
        });

        const result = await WebSearchTool.search({
            api_key: auth.accessToken,
            query: query,
            urls: domain ? [domain] : undefined
        });

        console.log(result);
    }));}

const API_BASE_URL = "https://api.tavily.com";

export class WebSearchTool implements vscode.LanguageModelTool<IWebSearchParameters> {
    prepareToolInvocation?(options: vscode.LanguageModelToolInvocationPrepareOptions<IWebSearchParameters>, token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation> {
        throw new Error('Method not implemented.');
    }

    async invoke(options: vscode.LanguageModelToolInvocationOptions<IWebSearchParameters>, token: vscode.CancellationToken): Promise<vscode.ProviderResult<vscode.LanguageModelToolResult>> {
        return WebSearchTool.search(options.parameters as IWebSearchParameters);
    }

    static async search(params: IWebSearchParameters): Promise<SearchResponse> {
        const body: SearchOptions = {
            api_key: params.api_key,
            query: params.query,
            include_domains: params.urls,
            include_answer: true,
        };

        const response = await fetch(API_BASE_URL+'/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body),
        });

        return response.json();
    }

    static async extract(params:IExtractParameters): Promise<IExtractResponse> {
        const req = await fetch(API_BASE_URL+'/extract', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                urls: params.urls,
                api_key: params.api_key,
            }),
        });

		return await req.json() as IExtractResponse;
    }
}
