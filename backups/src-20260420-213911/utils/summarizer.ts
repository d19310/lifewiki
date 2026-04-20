/**
 * Content Summarizer
 * AI-powered summarization of clipped web content
 */

import type { AIProvider } from '../ai/provider';

// Maximum content length for summarization (10KB)
const MAX_SUMMARIZE_LENGTH = 10000;

/**
 * Metadata from clipped content
 */
export interface ClipMetadata {
	title?: string;
	url?: string;
	clippedAt?: string;
	author?: string;
	siteName?: string;
}

/**
 * Result of summarization
 */
export interface SummaryResult {
	success: boolean;
	summary?: string;
	error?: string;
	originalLength?: number;
	title?: string;
}

/**
 * Summarize content using AI
 */
export async function summarizeContent(
	content: string,
	provider: AIProvider,
	metadata?: ClipMetadata
): Promise<SummaryResult> {
	// Validate content
	if (!content || content.trim().length === 0) {
		return { success: false, error: 'No content to summarize' };
	}

	// Check if provider is ready
	if (!provider.isReady()) {
		return { success: false, error: 'AI provider not available' };
	}

	try {
		// Truncate content if too long
		let truncateContent = content;
		if (content.length > MAX_SUMMARIZE_LENGTH) {
			truncateContent = content.substring(0, MAX_SUMMARIZE_LENGTH) + '\n\n[内容已截断，原文长度: ' + content.length + '字符]';
		}

		// Build the prompt
		const metadataContext = metadata?.title
			? `文章标题: ${metadata.title}\n来源: ${metadata.url || '未知'}\n作者: ${metadata.author || '未知'}\n`
			: '';

		const prompt = `请为以下文章生成简洁的中文摘要（100-200字）：

${metadataContext}---
${truncateContent}
---

请直接输出摘要内容，不要包含"摘要"等前缀。`;

		// Call AI
		const response = await provider.chat([
			{ role: 'user' as const, content: prompt }
		]);

		// Extract summary from response
		let summary = response.content.trim();

		// If response has prefix like "摘要:", remove it
		summary = summary.replace(/^(摘要|summary|总结|概述)[:：]\s*/i, '');

		return {
			success: true,
			summary,
			originalLength: content.length,
			title: metadata?.title
		};
	} catch (error) {
		return {
			success: false,
			error: `Summarization failed: ${(error as Error).message}`
		};
	}
}
