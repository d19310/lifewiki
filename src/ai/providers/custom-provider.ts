/**
 * Custom AI Provider
 * Supports custom API endpoints (OpenAI-compatible format)
 */

import type { AIProvider, ChatMessage, ChatResponse, ToolDefinition } from './interfaces';
import type { CustomProviderConfig } from './types';

const DEBUG_PROVIDER = false;

export class CustomProvider implements AIProvider {
	readonly id: string;
	readonly name: string;
	readonly type = 'custom' as const;

	private config: CustomProviderConfig;

	constructor(config: CustomProviderConfig) {
		this.id = config.id;
		this.name = config.name;
		this.config = {
			...config,
			endpoint: config.endpoint.replace(/\/+$/, '')
		};
	}

	async chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<ChatResponse> {
		const url = `${this.config.endpoint}/chat/completions`;

		const headers: Record<string, string> = {
			'Content-Type': 'application/json'
		};

		if (this.config.apiKey) {
			headers['Authorization'] = `Bearer ${this.config.apiKey}`;
		}

		const body = this.buildRequestBody(messages, tools);

		let response;
		try {
			if (DEBUG_PROVIDER) {
				console.debug('[CustomProvider] Fetching URL:', url);
				console.debug('[CustomProvider] Request body:', JSON.stringify(body, null, 2));
			}
			response = await fetch(url, {
				method: 'POST',
				headers,
				body: JSON.stringify(body)
			});
			if (DEBUG_PROVIDER) {
				console.debug('[CustomProvider] Response status:', response.status, response.statusText);
			}
		} catch (fetchError) {
			console.error('[CustomProvider] Fetch failed:', (fetchError as Error).message);
			throw fetchError;
		}

		if (!response.ok) {
			await this.throwResponseError(response, body);
		}

		const data = await response.json();
		const message = data.choices?.[0]?.message;
		if (DEBUG_PROVIDER) {
			console.debug('[CustomProvider] Raw message keys:', Object.keys(message || {}));
			console.debug('[CustomProvider] Raw message:', JSON.stringify(message, null, 2)?.substring(0, 500));
			console.debug('[CustomProvider] Response message - content:', message?.content?.substring?.(0, 100), 'tool_calls:', message?.tool_calls?.length);
		}

		// Check if model returned a tool call
		if (message?.tool_calls && message.tool_calls.length > 0) {
			return {
				content: message.content || '',
				reasoningContent: message.reasoning_content || message.reasoningContent || '',
				usage: data.usage,
				toolCalls: message.tool_calls.map((tc: any) => ({
					name: tc.function.name,
					arguments: tc.function.arguments
				}))
			};
		}

		return {
			content: message?.content || '',
			reasoningContent: message?.reasoning_content || message?.reasoningContent || '',
			usage: data.usage
		};
	}

	async *streamChat(messages: ChatMessage[], tools?: ToolDefinition[]): AsyncGenerator<{ content?: string; reasoningContent?: string }, ChatResponse, void> {
		const url = `${this.config.endpoint}/chat/completions`;
		const headers: Record<string, string> = {
			'Content-Type': 'application/json'
		};

		if (this.config.apiKey) {
			headers['Authorization'] = `Bearer ${this.config.apiKey}`;
		}

		const body = {
			...this.buildRequestBody(messages, tools),
			stream: true
		};

		const response = await fetch(url, {
			method: 'POST',
			headers,
			body: JSON.stringify(body)
		});

		if (!response.ok) {
			await this.throwResponseError(response, body);
		}
		if (!response.body) {
			throw new Error('Streaming response body is empty');
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let content = '';
		let reasoningContent = '';

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });

				const lines = buffer.split(/\r?\n/);
				buffer = lines.pop() || '';

				for (const rawLine of lines) {
					const line = rawLine.trim();
					if (!line || !line.startsWith('data:')) continue;
					const payload = line.replace(/^data:\s*/, '');
					if (payload === '[DONE]') {
						return { content, reasoningContent };
					}
					try {
						const data = JSON.parse(payload);
						const delta = data.choices?.[0]?.delta || {};
						const contentDelta = delta.content || '';
						const reasoningDelta = delta.reasoning_content || delta.reasoningContent || '';
						if (reasoningDelta) {
							reasoningContent += reasoningDelta;
							yield { reasoningContent: reasoningDelta };
						}
						if (contentDelta) {
							content += contentDelta;
							yield { content: contentDelta };
						}
					} catch {
						// Ignore malformed SSE keep-alive lines.
					}
				}
			}
		} finally {
			reader.releaseLock();
		}

		return { content, reasoningContent };
	}

	private buildRequestBody(messages: ChatMessage[], tools?: ToolDefinition[]): Record<string, unknown> {
		const body: Record<string, unknown> = {
			model: this.config.model,
			messages: messages.map(m => ({
				role: m.role,
				content: m.content
			}))
		};

		// Add tools if provided (OpenAI tool calling format)
		if (tools && tools.length > 0) {
			body.tools = tools.map(tool => ({
				type: 'function',
				function: {
					name: tool.name,
					description: tool.description,
					parameters: tool.parameters
				}
			}));
		}

		body.thinking = { type: this.config.enableThinking ? 'enabled' : 'disabled' };
		if (this.config.reasoningEffort) {
			body.reasoning_effort = this.config.reasoningEffort;
		}

		// Merge extra params
		if (this.config.extraParams) {
			Object.assign(body, this.config.extraParams);
		}

		return body;
	}

	private async throwResponseError(response: Response, body: Record<string, unknown>): Promise<never> {
		console.error('[CustomProvider] Request failed:', response.status, response.statusText);
		console.error('[CustomProvider] Request body:', JSON.stringify(body, null, 2));
		let errorText;
		try {
			errorText = await response.text();
			console.error('[CustomProvider] Error response:', errorText);
		} catch (e) {
			console.error('[CustomProvider] Could not read error response:', e);
			errorText = 'Could not read error response';
		}
		throw new Error(`Custom provider error: ${response.status} ${response.statusText} - ${errorText}`);
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
