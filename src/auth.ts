import * as path from 'node:path';
import inquirer from 'inquirer';
import 'dotenv/config';
import { updateEnvFile } from './utils/env';
import { logger } from './utils/logger';

export interface Cookie {
	name: string;
	value: string;
	domain: string;
}

export interface Credentials {
	cookies: Cookie[];
	credentialsToken: string;
	getAccessToken: () => string;
}

const ACCESS_TOKEN_REGEX = /accessToken":"(.*?)"/;
const ENV_FILE_PATH = path.join(process.cwd(), '.env');

export class DomestikaAuth {
	public cookies: Cookie[] = [];
	public credentialsToken = '';

	constructor() {
		this.readEnvCredentials();
	}

	readEnvCredentials(): void {
		this.cookies = [
			{
				name: '_domestika_session',
				value: process.env.DOMESTIKA_SESSION || '',
				domain: 'www.domestika.org',
			},
		];
		this.credentialsToken = process.env.DOMESTIKA_CREDENTIALS || '';
	}

	private extractAccessToken(): string | null {
		try {
			const match = ACCESS_TOKEN_REGEX.exec(decodeURI(this.credentialsToken));
			return match?.[1] ?? null;
		} catch {
			return null;
		}
	}

	async promptForCredentials(forceUpdate = false): Promise<void> {
		logger.header('Cookie Setup');
		logger.list([
			'Log in to Domestika',
			'Open Developer Tools (F12)',
			'Go to the Storage tab → Cookies',
			'Copy the value of: _domestika_session',
			'Copy the value of: _credentials',
		]);

		const answers = await inquirer.prompt<{
			sessionCookie?: string;
			credentialsCookie?: string;
		}>([
			{
				type: 'input',
				name: 'sessionCookie',
				message: 'Enter the value of the _domestika_session cookie:',
				when: () => forceUpdate || !this.cookies[0].value,
			},
			{
				type: 'input',
				name: 'credentialsCookie',
				message: 'Enter the value of the _credentials cookie:',
				when: () => forceUpdate || !this.credentialsToken,
			},
		]);

		if (answers.sessionCookie) {
			this.cookies[0].value = answers.sessionCookie;
		}
		if (answers.credentialsCookie) {
			this.credentialsToken = answers.credentialsCookie;
		}

		this.saveCredentials();
	}

	saveCredentials(): void {
		updateEnvFile(ENV_FILE_PATH, {
			DOMESTIKA_SESSION: this.cookies[0].value,
			DOMESTIKA_CREDENTIALS: this.credentialsToken,
		});

		process.env.DOMESTIKA_SESSION = this.cookies[0].value;
		process.env.DOMESTIKA_CREDENTIALS = this.credentialsToken;
	}

	validateCredentials(): boolean {
		return !!this.extractAccessToken() && !!this.cookies[0].value;
	}

	async getCookies(): Promise<Credentials> {
		if (!this.validateCredentials()) {
			await this.promptForCredentials();

			if (!this.validateCredentials()) {
				throw new Error(
					'Could not obtain valid credentials. Please verify your Domestika cookies.'
				);
			}
		}

		return {
			cookies: this.cookies,
			credentialsToken: this.credentialsToken,
			getAccessToken: () => {
				const token = this.extractAccessToken();
				if (!token) throw new Error('Could not extract access token from credentials');
				return token;
			},
		};
	}
}

export default new DomestikaAuth();
