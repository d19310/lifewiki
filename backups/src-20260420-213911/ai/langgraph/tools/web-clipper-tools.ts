/**
 * Web Clipper Tools for LangGraph
 * Tool implementations for web clipping and summarization
 */

import { z } from 'zod';
import { clipWebpage } from '../../../utils/web-clipper';
import { summarizeContent } from '../../../utils/summarizer';
import type { AIProvider } from '../../provider';
import type { ToolExecutionResult } from '../types';

// Tool input schemas
export const ClipWebpageInputSchema = z.object({
	url: z.string().describe('URL of the webpage to clip')
});

export const SummarizeContentInputSchema = z.object({
	content: z.string().describe('Markdown content to summarize'),
	title: z.string().optional().describe('Optional title of the content'),
	url: z.string().optional().describe('Optional source URL'),
	author: z.string().optional().describe('Optional author name')
});

export type ClipWebpageInput = z.infer<typeof ClipWebpageInputSchema>;
export type SummarizeContentInput = z.infer<typeof SummarizeContentInputSchema>;

/**
 * Tool implementation functions for web clipping and summarization
 */
export class WebClipperTools {
	constructor(
		private aiProvider: AIProvider,
		private vaultPath: string
	) {}

	/**
	 * Clip a webpage and convert to Markdown
	 * Supports both generic websites and WeChat articles
	 */
	async clipWebpageTool(input: ClipWebpageInput): Promise<ToolExecutionResult> {
		try {
			const result = await clipWebpage(input.url);

			if (result.error) {
				return { success: false, error: result.error };
			}

			return {
				success: true,
				data: {
					title: result.title,
					content: result.content,
					author: result.author,
					siteName: result.siteName,
					url: result.url,
					clippedAt: result.clippedAt,
					truncated: result.truncated || false,
					// Include first 500 chars as preview
					preview: result.content.substring(0, 500)
				}
			};
		} catch (error) {
			return { success: false, error: `Clip failed: ${(error as Error).message}` };
		}
	}

	/**
	 * Summarize content using AI
	 */
	async summarizeContentTool(input: SummarizeContentInput): Promise<ToolExecutionResult> {
		try {
			const result = await summarizeContent(
				input.content,
				this.aiProvider,
				{
					title: input.title,
					url: input.url,
					author: input.author
				}
			);

			if (result.error) {
				return { success: false, error: result.error };
			}

			return {
				success: true,
				data: {
					summary: result.summary,
					originalLength: result.originalLength,
					title: result.title
				}
			};
		} catch (error) {
			return { success: false, error: `Summarize failed: ${(error as Error).message}` };
		}
	}

	/**
	 * Clip and summarize a webpage in one step
	 */
	async clipAndSummarize(input: ClipWebpageInput): Promise<ToolExecutionResult> {
		try {
			// First clip the webpage
			const clipResult = await clipWebpage(input.url);

			if (clipResult.error || !clipResult.content) {
				return { success: false, error: clipResult.error || 'Failed to clip content' };
			}

			// Then summarize
			const summaryResult = await summarizeContent(
				clipResult.content,
				this.aiProvider,
				{
					title: clipResult.title,
					url: clipResult.url,
					author: clipResult.author,
					siteName: clipResult.siteName
				}
			);

			if (summaryResult.error) {
				// Return clip result even if summarize fails
				return {
					success: true,
					data: {
						clipped: true,
						summarized: false,
						title: clipResult.title,
						content: clipResult.content,
						url: clipResult.url,
						error: summaryResult.error
					}
				};
			}

			return {
				success: true,
				data: {
					clipped: true,
					summarized: true,
					title: clipResult.title,
					content: clipResult.content,
					summary: summaryResult.summary,
					url: clipResult.url,
					author: clipResult.author,
					siteName: clipResult.siteName,
					clippedAt: clipResult.clippedAt,
					originalLength: summaryResult.originalLength
				}
			};
		} catch (error) {
			return { success: false, error: `Clip and summarize failed: ${(error as Error).message}` };
		}
	}
}
