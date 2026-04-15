/**
 * ConversationFlow Tests
 * Tests for progressive entity analysis conversation flow
 */

import { ConversationFlow } from './conversation-flow';
import { AnalysisPhase, ChatMessage, AnalysisResult, EntityPreview } from '../entities/types';
import { AIProvider } from './provider';

// Mock AI Provider
const createMockProvider = () => ({
	chat: jest.fn(),
	analyzeBlock: jest.fn(),
	isReady: jest.fn().mockReturnValue(true)
});

describe('ConversationFlow', () => {
	let provider: ReturnType<typeof createMockProvider>;
	let flow: ConversationFlow;

	beforeEach(() => {
		provider = createMockProvider();
		flow = new ConversationFlow(provider as unknown as AIProvider);
	});

	describe('startBlockAnalysis', () => {
		it('should create session and start with people phase', async () => {
			const blockId = 'block-001';
			const content = '今天和张三、李四讨论了项目';

			provider.analyzeBlock.mockResolvedValue({
				blockId,
				timestamp: new Date().toISOString(),
				category: '工作' as const,
				entities: {
					people: [{ type: 'person' as const, name: '张三', confidence: 0.9, context: '提及', isArchived: false }] as EntityPreview[],
					projects: [] as EntityPreview[],
					things: [] as EntityPreview[],
					ideas: [] as EntityPreview[],
					knowledge: [] as EntityPreview[]
				},
				needsConfirmation: ['张三'],
				aiResponse: '你提到的 **张三** 我不认识'
			});

			const result = await flow.startBlockAnalysis(blockId, content);

			expect(result).toBeDefined();
			expect(result.session.blockId).toBe(blockId);
			expect(result.session.currentPhase).toBe(AnalysisPhase.People);
			expect(result.initialResponse).toContain('张三');
			expect(provider.analyzeBlock).toHaveBeenCalled();
		});

		it('should create new session if none exists', async () => {
			const blockId = 'block-new';

			provider.analyzeBlock.mockResolvedValue({
				blockId,
				timestamp: new Date().toISOString(),
				category: '工作' as const,
				entities: {
					people: [] as EntityPreview[],
					projects: [] as EntityPreview[],
					things: [] as EntityPreview[],
					ideas: [] as EntityPreview[],
					knowledge: [] as EntityPreview[]
				},
				needsConfirmation: [],
				aiResponse: '未识别到实体'
			});

			const result = await flow.startBlockAnalysis(blockId, '测试内容');

			expect(result.session.blockId).toBe(blockId);
			expect(result.session.messages.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe('continueAnalysis', () => {
		it('should add user message and get AI response', async () => {
			const blockId = 'block-002';

			// Create session first
			provider.analyzeBlock.mockResolvedValue({
				blockId,
				timestamp: new Date().toISOString(),
				category: '工作' as const,
				entities: {
					people: [] as EntityPreview[],
					projects: [] as EntityPreview[],
					things: [] as EntityPreview[],
					ideas: [] as EntityPreview[],
					knowledge: [] as EntityPreview[]
				},
				needsConfirmation: [],
				aiResponse: '好的'
			});

			await flow.startBlockAnalysis(blockId, '初始内容');

			// Mock chat for continuation
			provider.chat.mockResolvedValue({
				content: '已确认，他们是同事。',
				usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
			});

			const result = await flow.continueAnalysis(blockId, '他们是同事');

			expect(result).toBeDefined();
			expect(result.userMessage).toBe('他们是同事');
			expect(provider.chat).toHaveBeenCalled();
		});

		it('should return error for non-existent session', async () => {
			const result = await flow.continueAnalysis('non-existent', '用户消息');

			expect(result.error).toBe('Session not found');
		});
	});

	describe('phase transitions', () => {
		it('should start at people phase', async () => {
			const blockId = 'block-phase';

			provider.analyzeBlock.mockResolvedValue({
				blockId,
				timestamp: new Date().toISOString(),
				category: '工作' as const,
				entities: {
					people: [] as EntityPreview[],
					projects: [] as EntityPreview[],
					things: [] as EntityPreview[],
					ideas: [] as EntityPreview[],
					knowledge: [] as EntityPreview[]
				},
				needsConfirmation: [],
				aiResponse: '未识别到人脉'
			});

			const result = await flow.startBlockAnalysis(blockId, '测试');

			expect(result.session.currentPhase).toBe(AnalysisPhase.People);
		});

		it('should track phase in session', async () => {
			const blockId = 'block-phase-track';

			provider.analyzeBlock.mockResolvedValue({
				blockId,
				timestamp: new Date().toISOString(),
				category: '工作' as const,
				entities: {
					people: [] as EntityPreview[],
					projects: [] as EntityPreview[],
					things: [] as EntityPreview[],
					ideas: [] as EntityPreview[],
					knowledge: [] as EntityPreview[]
				},
				needsConfirmation: [],
				aiResponse: '完成'
			});

			await flow.startBlockAnalysis(blockId, '测试');
			const session = flow.getSession(blockId);

			expect(session?.currentPhase).toBe(AnalysisPhase.People);
		});
	});

	describe('message history', () => {
		it('should accumulate messages in session', async () => {
			const blockId = 'block-msgs';

			provider.analyzeBlock.mockResolvedValue({
				blockId,
				timestamp: new Date().toISOString(),
				category: '工作' as const,
				entities: {
					people: [] as EntityPreview[],
					projects: [] as EntityPreview[],
					things: [] as EntityPreview[],
					ideas: [] as EntityPreview[],
					knowledge: [] as EntityPreview[]
				},
				needsConfirmation: [],
				aiResponse: '你好'
			});

			await flow.startBlockAnalysis(blockId, '你好');

			provider.chat.mockResolvedValue({
				content: '回复1',
				usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 }
			});
			await flow.continueAnalysis(blockId, '用户消息1');

			provider.chat.mockResolvedValue({
				content: '回复2',
				usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 }
			});
			await flow.continueAnalysis(blockId, '用户消息2');

			const session = flow.getSession(blockId);
			// 1 initial AI + 1 user msg1 + 1 AI response1 + 1 user msg2 + 1 AI response2 = 5
			expect(session?.messages.length).toBe(5);
		});
	});

	describe('getSession', () => {
		it('should return existing session', async () => {
			const blockId = 'block-get';

			provider.analyzeBlock.mockResolvedValue({
				blockId,
				timestamp: new Date().toISOString(),
				category: '工作' as const,
				entities: {
					people: [] as EntityPreview[],
					projects: [] as EntityPreview[],
					things: [] as EntityPreview[],
					ideas: [] as EntityPreview[],
					knowledge: [] as EntityPreview[]
				},
				needsConfirmation: [],
				aiResponse: 'test'
			});

			await flow.startBlockAnalysis(blockId, 'test');

			const session = flow.getSession(blockId);
			expect(session).toBeDefined();
			expect(session?.blockId).toBe(blockId);
		});

		it('should return undefined for non-existent session', () => {
			const session = flow.getSession('non-existent');
			expect(session).toBeUndefined();
		});
	});
});
