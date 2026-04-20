/**
 * AI Provider Interfaces
 * Defines the contract for AI providers
 */

export interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface ChatResponse {
	content: string;
	usage?: {
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
	};
}

/**
 * AI Provider interface
 * All AI providers must implement this interface
 */
export interface AIProvider {
	readonly id: string;
	readonly name: string;

	/**
	 * Send a chat request and receive a response
	 */
	chat(messages: ChatMessage[]): Promise<ChatResponse>;

	/**
	 * Check if the provider is ready to use
	 */
	isReady(): boolean;
}
