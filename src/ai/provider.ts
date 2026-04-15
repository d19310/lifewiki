/**
 * AI Provider Interface
 * Defines the contract for AI analysis providers
 */

import { ChatMessage, ChatResponse, AnalysisResult } from '../entities/types';

/**
 * AI Provider interface
 * Implement this interface to add new AI providers (DashScope, OpenAI, Claude, etc.)
 */
export interface AIProvider {
  /**
   * Send chat messages and get response
   */
  chat(messages: ChatMessage[]): Promise<ChatResponse>;

  /**
   * Analyze a journal block and extract entities
   */
  analyzeBlock(content: string): Promise<AnalysisResult>;

  /**
   * Check if the provider is configured and ready
   */
  isReady(): boolean;
}
