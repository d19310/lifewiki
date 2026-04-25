/**
 * AI Provider Adapter
 * Wraps existing AIProvider as a LangChain BaseChatModel for LangGraph
 */

import type { AIProvider } from '../provider';
import type { ChatMessage, ChatResponse } from '../../entities/types';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatResult, BaseCallOptions } from '@langchain/core/language_models/base';
import { AIMessage, BaseMessage, AIMessageChunk, ToolCall } from '@langchain/core/messages';
import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';

/**
 * Adapter that wraps an AIProvider to work with LangChain/LangGraph
 */
export class AIProviderAdapter extends BaseChatModel {
	private provider: AIProvider;
	private _usage?: {
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
	};
	private _boundTools: any[] = [];

	_llmType(): string {
		return 'ai-provider-adapter';
	}

	bindTools(tools: any[]): this {
		this._boundTools = tools;
		return this;
	}

	constructor(provider: AIProvider) {
		super({});
		this.provider = provider;
	}

	/**
	 * Convert LangChain messages to our ChatMessage format
	 */
	private toChatMessages(messages: BaseMessage[]): ChatMessage[] {
		return messages.map(msg => {
			if (msg._getType() === 'system') {
				return { role: 'system' as const, content: msg.content.toString() };
			} else if (msg._getType() === 'human') {
				return { role: 'user' as const, content: msg.content.toString() };
			} else if (msg._getType() === 'ai') {
				// Handle AI messages with tool calls
				if ((msg as any).tool_calls) {
					return {
						role: 'assistant' as const,
						content: msg.content.toString()
					};
				}
				return { role: 'assistant' as const, content: msg.content.toString() };
			}
			return { role: 'user' as const, content: msg.content.toString() };
		});
	}

	/**
	 * Convert our response to LangChain AIMessage
	 */
	private toAIMessage(response: ChatResponse): AIMessage {
		if (response.usage) {
			this._usage = response.usage;
		}

		const kwargs: any = { content: response.content };

		// Handle tool calls
		if (response.toolCalls && response.toolCalls.length > 0) {
			kwargs.tool_calls = response.toolCalls.map(tc => ({
				name: tc.name,
				args: typeof tc.arguments === 'string' ? this.parseToolArguments(tc.arguments) : tc.arguments,
				id: `call_${Date.now()}`
			}));
		}

		return new AIMessage(kwargs);
	}

	private parseToolArguments(value: string): Record<string, unknown> {
		try {
			const parsed = JSON.parse(value || '{}');
			return parsed && typeof parsed === 'object' ? parsed : {};
		} catch {
			return {};
		}
	}

	/**
	 * Main chat method - called by LangGraph
	 */
	async _generate(
		messages: BaseMessage[],
		_options?: BaseCallOptions,
		_runManager?: CallbackManagerForLLMRun
	): Promise<ChatResult> {
		try {
			const chatMessages = this.toChatMessages(messages);

			// Convert bound tools to our format
			const tools = this._boundTools.map(tool => ({
				name: tool.name,
				description: tool.description,
				parameters: tool.schema || {}
			}));

			const response = await this.provider.chat(chatMessages, tools.length > 0 ? tools : undefined);
			const aiMessage = this.toAIMessage(response);

			// Determine finish reason
			const finishReason = response.toolCalls?.length ? 'tool_calls' : 'stop';

			return {
				generations: [
					{
						text: response.content,
						message: aiMessage,
						generationInfo: {
							finishReason,
							usage: response.usage
						}
					}
				],
				llmOutput: {
					tokenUsage: response.usage
				}
			};
		} catch (error) {
			console.error('[AIProviderAdapter] CATCH in _generate:', error);
			throw new Error(`AIProvider chat failed: ${(error as Error).message}`);
		}
	}

	/**
	 * Stream implementation - not supported by all providers
	 */
	async *_streamResponseChunks(
		_messages: BaseMessage[],
		_options?: BaseCallOptions,
		_runManager?: CallbackManagerForLLMRun
	): AsyncGenerator<AIMessageChunk> {
		// Most providers don't support streaming, so we yield a single chunk
		const response = await this._generate(_messages, _options, _runManager);
		const text = response.generations[0].text;
		yield new AIMessageChunk({ content: text });
	}

	_getLsParams(options: BaseCallOptions) {
		return {
			lsProvider: 'adapter',
			lsModelName: 'unknown',
			lsModelType: 'chat' as const,
			lsTemperature: options.temperature ?? 0.7,
			lsMaxTokens: options.maxTokens ?? 2048,
			lsStop: options.stop
		};
	}

	/**
	 * Check if provider is ready
	 */
	isReady(): boolean {
		return this.provider.isReady();
	}

	/**
	 * Direct chat method - bypasses LangChain's invoke machinery
	 * Used for forced tool calling where we need direct control
	 */
	async directChat(
		messages: BaseMessage[],
		tools: { name: string; description: string; schema: Record<string, unknown> }[]
	): Promise<ChatResult> {
		try {
			const chatMessages = this.toChatMessages(messages);

			const toolsFormatted = tools.map(tool => ({
				name: tool.name,
				description: tool.description,
				parameters: tool.schema || {}
			}));

			// Some APIs (like MiniMax) require a user message with non-empty content when using tools
			// Add a placeholder user message if only system message is present
			if (chatMessages.length === 1 && chatMessages[0].role === 'system') {
				chatMessages.push({ role: 'user' as const, content: '请分析。' });
			}

			const response = await this.provider.chat(chatMessages, toolsFormatted);

			const aiMessage = this.toAIMessage(response);
			const finishReason = response.toolCalls?.length ? 'tool_calls' : 'stop';

			return {
				generations: [{
					text: response.content,
					message: aiMessage,
					generationInfo: { finishReason, usage: response.usage }
				}],
				llmOutput: { tokenUsage: response.usage }
			};
		} catch (error) {
			console.error('[AIProviderAdapter] directChat CATCH:', error);
			throw new Error(`AIProvider chat failed: ${(error as Error).message}`);
		}
	}
}
