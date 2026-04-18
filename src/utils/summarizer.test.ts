/**
 * Summarizer Tests
 * TDD for AI-powered content summarization
 */

import type { SummaryResult } from './summarizer';

// Mock AI provider
const mockAIProvider = {
	chat: jest.fn(),
	isReady: jest.fn(() => true)
};

describe('Summarizer', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('summarizeContent', () => {
		it('returns error when content is empty', async () => {
			const { summarizeContent } = await import('./summarizer');
			const result = await summarizeContent('', mockAIProvider as any);
			expect(result.error).toBe('No content to summarize');
		});

		it('returns error when content is whitespace only', async () => {
			const { summarizeContent } = await import('./summarizer');
			const result = await summarizeContent('   \n\n  ', mockAIProvider as any);
			expect(result.error).toBe('No content to summarize');
		});

		it('returns error when AI provider is not ready', async () => {
			const { summarizeContent } = await import('./summarizer');
			const notReadyProvider = { ...mockAIProvider, isReady: () => false };
			const result = await summarizeContent('Some content', notReadyProvider as any);
			expect(result.error).toBe('AI provider not available');
		});

		it('successfully summarizes content with AI', async () => {
			const { summarizeContent } = await import('./summarizer');

			(mockAIProvider.chat as jest.Mock).mockResolvedValue({
				content: 'This is a summary of the article about AI technology.',
				usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
			});

			const result = await summarizeContent(
				'# AI Technology\n\nThis article discusses artificial intelligence...',
				mockAIProvider as any
			);

			expect(result.success).toBe(true);
			expect(result.summary).toBe('This is a summary of the article about AI technology.');
			expect(mockAIProvider.chat).toHaveBeenCalled();
		});

		it('truncates very long content before sending to AI', async () => {
			const { summarizeContent } = await import('./summarizer');

			let capturedContent = '';
			(mockAIProvider.chat as jest.Mock).mockImplementation(async (messages: any) => {
				// Capture the content from the message
				const userMessage = messages.find((m: any) => m.role === 'user');
				if (userMessage) {
					capturedContent = userMessage.content;
				}
				return {
					content: 'Summary',
					usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
				};
			});

			// Create content longer than MAX_SUMMARIZE_LENGTH (10000)
			const longContent = 'x'.repeat(15000);
			await summarizeContent(longContent, mockAIProvider as any);

			// Content should be truncated
			expect(capturedContent.length).toBeLessThan(longContent.length);
			expect(capturedContent.length).toBeLessThanOrEqual(10000 + 500); // MAX + buffer
		});

		it('includes metadata in summary result', async () => {
			const { summarizeContent } = await import('./summarizer');

			(mockAIProvider.chat as jest.Mock).mockResolvedValue({
				content: 'Summary of the article.',
				usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
			});

			const clipMetadata = {
				title: 'Test Article',
				url: 'https://example.com/article',
				clippedAt: '2024-01-01T00:00:00.000Z',
				author: 'Test Author'
			};

			const result = await summarizeContent(
				'Article content here',
				mockAIProvider as any,
				clipMetadata
			);

			expect(result.success).toBe(true);
			expect(result.originalLength).toBe('Article content here'.length);
			expect(result.title).toBe('Test Article');
		});

		it('handles AI chat errors gracefully', async () => {
			const { summarizeContent } = await import('./summarizer');

			(mockAIProvider.chat as jest.Mock).mockRejectedValue(new Error('API Error'));

			const result = await summarizeContent('Some content', mockAIProvider as any);

			expect(result.success).toBe(false);
			expect(result.error).toBe('Summarization failed: API Error');
		});

		it('extracts summary from AI response even with surrounding text', async () => {
			const { summarizeContent } = await import('./summarizer');

			(mockAIProvider.chat as jest.Mock).mockResolvedValue({
				content: 'Here is the summary: This article is about AI. It covers machine learning.',
				usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
			});

			const result = await summarizeContent(
				'# AI Article\n\nContent here...',
				mockAIProvider as any
			);

			expect(result.success).toBe(true);
			expect(result.summary).toContain('AI');
		});
	});
});
