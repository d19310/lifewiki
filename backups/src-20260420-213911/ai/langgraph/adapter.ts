/**
 * AI Provider Adapter
 * Wraps existing AIProvider as a LangChain BaseChatModel for LangGraph
 */

import type { AIProvider } from '../provider';
import type { ChatMessage, ChatResponse } from '../../entities/types';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatResult, BaseCallOptions } from '@langchain/core/language_models/base';
import { AIMessage, BaseMessage, AIMessageChunk } from '@langchain/core/messages';
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
		return new AIMessage({ content: response.content });
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
			const response = await this.provider.chat(chatMessages);
			const aiMessage = this.toAIMessage(response);

			return {
				generations: [
					{
						text: response.content,
						message: aiMessage,
						generationInfo: {
							finishReason: 'stop',
							usage: response.usage
						}
					}
				],
				llmOutput: {
					tokenUsage: response.usage
				}
			};
		} catch (error) {
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
}
