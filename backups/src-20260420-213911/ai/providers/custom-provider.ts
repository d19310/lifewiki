/**
 * Custom AI Provider
 * Supports custom API endpoints (OpenAI-compatible format)
 */

import type { AIProvider, ChatMessage, ChatResponse } from './interfaces';
import type { CustomProviderConfig } from './types';

export class CustomProvider implements AIProvider {
	readonly id: string;
	readonly name: string;
	readonly type = 'custom' as const;

	private config: CustomProviderConfig;

	constructor(config: CustomProviderConfig) {
		this.id = config.id;
		this.name = config.name;
		this.config = config;
	}

	async chat(messages: ChatMessage[]): Promise<ChatResponse> {
		const url = `${this.config.endpoint}/chat/completions`;

		const headers: Record<string, string> = {
			'Content-Type': 'application/json'
		};

		if (this.config.apiKey) {
			headers['Authorization'] = `Bearer ${this.config.apiKey}`;
		}

		const body: Record<string, unknown> = {
			model: this.config.model,
			messages: messages.map(m => ({
				role: m.role,
				content: m.content
			}))
		};

		// Merge extra params
		if (this.config.extraParams) {
			Object.assign(body, this.config.extraParams);
		}

		const response = await fetch(url, {
			method: 'POST',
			headers,
			body: JSON.stringify(body)
		});

		if (!response.ok) {
			throw new Error(`Custom provider error: ${response.status} ${response.statusText}`);
		}

		const data = await response.json();

		return {
			content: data.choices?.[0]?.message?.content || '',
			usage: data.usage
		};
	}

	isReady(): boolean {
		return !!this.config.endpoint && !!this.config.model;
	}

	getEndpoint(): string {
		return this.config.endpoint;
	}

	getModel(): string {
		return this.config.model;
	}
}
