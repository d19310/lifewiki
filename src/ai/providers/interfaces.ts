/**
 * AI Provider Interfaces
 * Defines the contract for AI providers
 */

export interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface ToolDefinition {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
}

export interface ChatResponse {
	content: string;
	reasoningContent?: string;
	usage?: {
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
	};
	toolCalls?: Array<{
		name: string;
		arguments: string;
	}>;
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
	chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<ChatResponse>;

	streamChat?(
		messages: ChatMessage[],
		tools?: ToolDefinition[]
	): AsyncGenerator<{ content?: string; reasoningContent?: string }, ChatResponse, void>;

	/**
	 * Check if the provider is ready to use
	 */
	isReady(): boolean;
}
