import { AuthenticationProvider, AuthenticationProviderAuthenticationSessionsChangeEvent, AuthenticationSession, EventEmitter, ThemeIcon, Uri, env, l10n, window } from "vscode";
import { BetterTokenStorage } from "./betterSecretStorage";

export abstract class BaseAuthProvider implements AuthenticationProvider {

	_didChangeSessions = new EventEmitter<AuthenticationProviderAuthenticationSessionsChangeEvent>();
	onDidChangeSessions = this._didChangeSessions.event;

	protected abstract readonly name: string;
	protected abstract readonly createKeyUrl: string | undefined;

	constructor(private readonly _secrets: BetterTokenStorage<AuthenticationSession>) {
	}

	protected abstract validateKey(key: string): Promise<boolean>;

	async getSessions(_scopes?: string[]): Promise<AuthenticationSession[]> {

		try {
			return await this._secrets.getAll();
		} catch (e) {
			console.error(e);
			return [];
		}
	}

	async createSession(_scopes: string[]): Promise<AuthenticationSession> {
		const input = window.createInputBox();
		input.totalSteps = 2;
		input.title = l10n.t(`${this.name} Login`);

		// Get API Key
		input.step = 1;
		input.placeholder = l10n.t(`Enter your ${this.name} API key`);
		input.ignoreFocusOut = true;
		if (this.createKeyUrl) {
			const createKeyUrl = this.createKeyUrl;
			input.buttons = [
				{
					iconPath: new ThemeIcon('key'),
					tooltip: l10n.t('Generate API key')
				}
			];
			input.onDidTriggerButton(button => {
				if (button === input.buttons[0]) {
					env.openExternal(Uri.parse(createKeyUrl));
				}
			});
		}
		input.onDidChangeValue(value => {
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
		});

		// Get a name for the session
		input.buttons = [];
		input.value = '';
		input.step = 2;
		input.placeholder = l10n.t('Enter a name for this account');
		input.busy = false;
		input.enabled = true;
		const name: string = await new Promise((resolve, reject) => {
			input.onDidAccept(() => {
				input.dispose();
				resolve(input.value);
			});
		});

		const id = Math.random().toString(36).slice(2);
		const authSession: AuthenticationSession = {
			accessToken: key,
			id,
			account: {
				label: name,
				id: name
			},
			scopes: []
		};

		// Store and return the session
		await this._secrets.store(id, authSession);
		this._didChangeSessions.fire({ added: [authSession], removed: [], changed: [] });
		return authSession;
	}

	async removeSession(sessionId: string): Promise<void> {
		const removed = await this._secrets.get(sessionId);
		await this._secrets.delete(sessionId);
		this._didChangeSessions.fire({ added: [], removed: removed ? [removed] : [], changed: [] });
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

			const result = await req.json() as any;
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

	// TODO
	protected readonly createKeyUrl = undefined;

	// TODO
	protected validateKey(key: string): Promise<boolean> {
		return Promise.resolve(true);
	}
}
