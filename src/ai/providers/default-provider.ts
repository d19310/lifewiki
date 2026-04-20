/**
 * Default AI Provider
 * Wraps the existing AIProvider for backward compatibility
 */

import type { AIProvider as NewAIProvider, ChatMessage, ChatResponse } from './interfaces';
import type { AIProvider as ExistingAIProvider } from '../provider';

export class DefaultAIProvider implements NewAIProvider {
	readonly id = 'default';
	readonly name = 'Default AI Provider';

	constructor(private existingProvider: ExistingAIProvider) {}

	async chat(messages: ChatMessage[]): Promise<ChatResponse> {
		return this.existingProvider.chat(messages);
	}

	isReady(): boolean {
		return this.existingProvider.isReady();
	}
}
