/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the real engine with VS Code authentication and HTTP replaced locally.
const source = fs.readFileSync(path.join(__dirname, '../src/search/webSearch.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
	compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function engine(response) {
	const calls = [];
	const exports = {};
	vm.runInNewContext(compiled, {
		exports,
		require(name) {
			assert.equal(name, 'vscode');
			return { authentication: { getSession: async () => ({ accessToken: 'test-key' }) } };
		},
		fetch: async (url, options) => { calls.push({ url, ...options }); return response; },
	});
	return { api: exports.TavilyEngine, calls };
}

function invoke(api, operation) {
	return operation === 'search'
		? api.search('test query', 'example.com')
		: api.extract({ urls: ['https://example.com'], api_key: 'test-key' });
}

for (const operation of ['search', 'extract']) {
	test(`${operation}: preserves successful requests and responses`, async () => {
		const payload = operation === 'search'
			? { results: [{ url: 'https://example.com', title: 'Example', content: 'Content' }], answer: 'Answer' }
			: { results: [{ url: 'https://example.com', raw_content: 'Content' }], failed_results: [{ url: 'https://example.org', error: 'Unavailable' }] };
		const { api, calls } = engine(new Response(JSON.stringify(payload), { status: 200 }));
		const result = JSON.parse(JSON.stringify(await invoke(api, operation)));
		assert.deepEqual(result, operation === 'search'
			? { urls: [{ url: 'https://example.com', title: 'Example', snippet: 'Content' }], answer: 'Answer' }
			: payload);
		assert.equal(calls.length, 1);
		assert.equal(calls[0].url, `https://api.tavily.com/${operation}`);
		assert.equal(calls[0].headers['X-Client-Source'], undefined);
		assert.deepEqual(JSON.parse(calls[0].body), operation === 'search'
			? { api_key: 'test-key', query: 'test query', include_domains: ['example.com'], include_answer: true }
			: { urls: ['https://example.com'], api_key: 'test-key' });
	});
	test(`${operation}: identifies the client`, async () => {
		const { api, calls } = engine(new Response(JSON.stringify({ results: [] }), { status: 200 }));
		await invoke(api, operation);
		assert.equal(calls[0].headers['X-Client-Name'], 'vscode-websearchforcopilot');
	});
	for (const status of [401, 429, 500]) {
		for (const body of [JSON.stringify({ detail: { error: 'Service failure' } }), JSON.stringify({ detail: 'Service failure' }), 'Service failure']) {
			test(`${operation}: preserves HTTP ${status} and error detail ${body}`, async () => {
				const { api } = engine(new Response(body, { status }));
				await assert.rejects(invoke(api, operation), error => {
					assert.match(error.message, new RegExp(`HTTP ${status}`));
					assert.match(error.message, /Service failure/);
					return true;
				});
			});
		}
	}
	for (const body of ['', '{}', 'null']) {
		test(`${operation}: retains status without error details (${body})`, async () => {
			const { api } = engine(new Response(body, { status: 503 }));
			await assert.rejects(invoke(api, operation), /HTTP 503/);
		});
	}
	test(`${operation}: retains status when the error body cannot be read`, async () => {
		const { api } = engine({ ok: false, status: 502, text: async () => { throw new Error('read failed'); } });
		await assert.rejects(invoke(api, operation), /HTTP 502/);
	});
}
