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
   * Legacy 1.x entity-first analysis.
   *
   * LifeWiki 2.0 block capture uses chat() through CaptureAnalyzer and stores
   * BlockMemoryAnalysis. Keep this method only for old providers/tests/tools.
   */
  analyzeBlock(content: string): Promise<AnalysisResult>;

  /**
   * Check if the provider is configured and ready
   */
  isReady(): boolean;
}
