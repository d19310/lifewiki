/**
 * clip_and_summarize Executor
 * 抓取网页内容并生成摘要总结
 */

import type { AIProvider } from '../../../../ai/provider';
import type { ToolExecutionResult } from '../../types';

export interface ClipAndSummarizeInput {
  url: string;
}

// Import from existing web clipper utilities
import { clipWebpage } from '../../../src/utils/web-clipper';
import { summarizeContent } from '../../../src/utils/summarizer';

/**
 * Validate URL format
 */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function clipAndSummarizeExecutor(
  aiProvider: AIProvider,
  input: ClipAndSummarizeInput
): Promise<ToolExecutionResult> {
  try {
    // Validate URL
    if (!input.url || input.url.trim() === '') {
      return {
        success: false,
        error: 'URL is required'
      };
    }

    if (!isValidUrl(input.url)) {
      return {
        success: false,
        error: 'Invalid URL format'
      };
    }

    // Clip the webpage
    const clipResult = await clipWebpage(input.url);

    if (clipResult.error || !clipResult.content) {
      return {
        success: false,
        error: clipResult.error || 'Failed to clip content'
      };
    }

    // Summarize the content
    const summaryResult = await summarizeContent(
      clipResult.content,
      aiProvider,
      {
        title: clipResult.title,
        url: clipResult.url,
        author: clipResult.author
      }
    );

    if (summaryResult.error) {
      // Return clip result even if summarize fails
      return {
        success: true,
        data: {
          clipped: true,
          summarized: false,
          url: clipResult.url,
          title: clipResult.title,
          content: clipResult.content,
          author: clipResult.author,
          siteName: clipResult.siteName,
          clippedAt: clipResult.clippedAt,
          error: summaryResult.error
        }
      };
    }

    return {
      success: true,
      data: {
        success: true,
        clipped: true,
        summarized: true,
        url: clipResult.url,
        title: clipResult.title,
        content: clipResult.content,
        summary: summaryResult.summary,
        author: clipResult.author,
        siteName: clipResult.siteName,
        clippedAt: clipResult.clippedAt,
        extractedAt: new Date().toISOString(),
        originalLength: summaryResult.originalLength
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to clip and summarize: ${(error as Error).message}`
    };
  }
}
