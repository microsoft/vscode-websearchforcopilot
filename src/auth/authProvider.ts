/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import {
	AuthenticationProvider,
	AuthenticationProviderAuthenticationSessionsChangeEvent,
	AuthenticationSession,
	Disposable,
	EventEmitter,
	ThemeIcon,
	Uri,
	env,
	l10n,
	window,
} from 'vscode';
import { BingEngine } from '../search/webSearch';
import { ApiKeyDetails, ApiKeySecretStorage } from './secretStorage';

export abstract class BaseAuthProvider implements AuthenticationProvider {
	private readonly _disposable: Disposable;

	private readonly _didChangeSessions = new EventEmitter<AuthenticationProviderAuthenticationSessionsChangeEvent>();
	onDidChangeSessions = this._didChangeSessions.event;

	protected abstract readonly name: string;
	protected abstract readonly createKeyUrl: string | undefined;

	constructor(private readonly _secrets: ApiKeySecretStorage) {
		this._disposable = Disposable.from(
			this._didChangeSessions,
			_secrets.onDidChange((e) => this._didChangeSessions.fire({
				added: e.added.map((a) => this._toAuthenticationSession(a)),
				removed: e.removed.map((a) => this._toAuthenticationSession(a)),
				changed: e.changed.map((a) => this._toAuthenticationSession(a))
			}))
		);
	}

	protected abstract validateKey(key: string): Promise<boolean>;

	async getSessions(_scopes?: string[]): Promise<AuthenticationSession[]> {
		try {
			return this._secrets.getAll().map((a) => this._toAuthenticationSession(a));
		} catch (e) {
			console.error(e);
			return [];
		}
	}

	async createSession(_scopes: string[]): Promise<AuthenticationSession> {
		const input = window.createInputBox();
		input.totalSteps = 2;
		input.title = l10n.t('{0} Login', this.name);

		// Get API Key
		input.step = 1;
		input.password = true;
		const placeholderText = l10n.t('Enter your {0} API key', this.name);
		input.placeholder = placeholderText;
		input.ignoreFocusOut = true;
		if (this.createKeyUrl) {
			const createKeyUrl = this.createKeyUrl;
			input.buttons = [
				{
					iconPath: new ThemeIcon('key'),
					tooltip: l10n.t('Generate API key'),
				},
			];
			input.onDidTriggerButton((button) => {
				if (button === input.buttons[0]) {
					env.openExternal(Uri.parse(createKeyUrl));
				}
			});
		}
		input.onDidChangeValue((value) => {
			input.validationMessage = undefined;
		});
		input.show();
		const key: string = await new Promise((resolve, reject) => {
			const disposable = input.onDidAccept(async () => {
				input.busy = true;
				input.enabled = false;
				if (!input.value || !(await this.validateKey(input.value))) {
					input.validationMessage = l10n.t('Invalid API key');
					input.busy = false;
					input.enabled = true;
					return;
				}
				disposable.dispose();
				resolve(input.value);
			});

			const hideDisposable = input.onDidHide(async () => {
				if (!input.value || !(await this.validateKey(input.value))) {
					disposable.dispose();
					hideDisposable.dispose();
					reject(new Error('Invalid API key'));
				}
			});
		});

		// Get a name for the session
		input.buttons = [];
		input.value = 'Default'; // Set default value to 'Default'
		input.step = 2;
		input.password = false;
		input.placeholder = l10n.t('Enter a name for this account');
		input.busy = false;
		input.enabled = true;

		input.onDidChangeValue((value) => {
			input.validationMessage = !value ? l10n.t('Name cannot be empty') : undefined;
		});

		const name: string = await new Promise((resolve, reject) => {
			input.onDidAccept(() => {
				if (!input.value) {
					input.validationMessage = l10n.t('Name cannot be empty');
					return;
				}
				input.dispose();
				resolve(input.value);
			});
		});

		const authSession: AuthenticationSession = {
			accessToken: key,
			id: name,
			account: {
				label: name,
				id: name,
			},
			scopes: [],
		};

		// Store and return the session
		await this._secrets.set(name, key);
		return authSession;
	}

	async removeSession(sessionId: string): Promise<void> {
		await this._secrets.delete(sessionId);
	}

	private _toAuthenticationSession(details: ApiKeyDetails): AuthenticationSession {
		return {
			accessToken: details.apiKey,
			id: details.name,
			account: {
				label: details.name,
				id: details.name,
			},
			scopes: [],
		};
	}

	dispose() {
		this._disposable.dispose();
	}
}

export class TavilyAuthProvider extends BaseAuthProvider {
	static readonly ID = 'tavily';
	static readonly NAME = 'Tavily';

	protected name = TavilyAuthProvider.NAME;
	protected createKeyUrl = 'https://app.tavily.com/home';

	protected async validateKey(key: string) {
		try {
			const req = await fetch('https://api.tavily.com/search', {
				method: 'POST',
				headers: {
					// eslint-disable-next-line @typescript-eslint/naming-convention
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					query: 'testing',
					// eslint-disable-next-line @typescript-eslint/naming-convention
					api_key: key,
				}),
			});

			const result = (await req.json()) as any;
			if (!req.ok) {
				throw new Error(result.detail.error);
			}
			return true;
		} catch (e: any) {
			return false;
		}
	}
}

export class BingAuthProvider extends BaseAuthProvider {
	static readonly ID = 'bing';
	static readonly NAME = 'Bing';

	protected readonly name = BingAuthProvider.NAME;

	protected readonly createKeyUrl = 'https://www.microsoft.com/en-us/bing/apis/bing-web-search-api';

	protected async validateKey(key: string): Promise<boolean> {
		try {
			const req = await fetch(
				BingEngine.BING_API_BASE_URL +
					'/v7.0/search?q=' +
					encodeURIComponent('testing'),
				{
					method: 'GET',
					headers: {
						'Ocp-Apim-Subscription-Key': key,
					},
				}
			);

			const result = (await req.json()) as any;
			if (!req.ok) {
				throw new Error(result.detail.error);
			}
			return true;
		} catch (e: any) {
			return false;
		}
	}
}
