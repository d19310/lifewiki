/**
 * BlockSession Types Tests
 * Tests for BlockSession and AnalysisPhase types
 */

import { Block, BlockSession, AnalysisPhase, EntityPreview } from './types';

describe('BlockSession', () => {
	describe('interface structure', () => {
		it('should have required fields for a session', () => {
			const session: BlockSession = {
				blockId: 'block-123',
				messages: [],
				analysisResult: null,
				createdAt: '2026-04-15T10:00:00Z',
				updatedAt: '2026-04-15T10:00:00Z',
				currentPhase: 'people'
			};

			expect(session.blockId).toBe('block-123');
			expect(session.messages).toEqual([]);
			expect(session.analysisResult).toBeNull();
			expect(session.createdAt).toBe('2026-04-15T10:00:00Z');
			expect(session.updatedAt).toBe('2026-04-15T10:00:00Z');
			expect(session.currentPhase).toBe('people');
		});

		it('should allow storing messages in session', () => {
			const session: BlockSession = {
				blockId: 'block-456',
				messages: [
					{ role: 'assistant', content: '你好，我是日记分析助手' },
					{ role: 'user', content: '今天和张三、李四讨论了项目' }
				],
				analysisResult: null,
				createdAt: '2026-04-15T10:00:00Z',
				updatedAt: '2026-04-15T10:05:00Z',
				currentPhase: 'people'
			};

			expect(session.messages.length).toBe(2);
			expect(session.messages[0].role).toBe('assistant');
			expect(session.messages[1].role).toBe('user');
		});

		it('should track analysis result in session', () => {
			const mockResult = {
				blockId: 'block-789',
				timestamp: '2026-04-15T10:00:00Z',
				category: '工作' as const,
				entities: {
					people: [{ type: 'person' as const, name: '张三', confidence: 0.9, context: '讨论中提及', isArchived: false }] as EntityPreview[],
					projects: [] as EntityPreview[],
					things: [] as EntityPreview[],
					ideas: [] as EntityPreview[],
					knowledge: [] as EntityPreview[]
				},
				needsConfirmation: ['张三'],
				aiResponse: '你提到的张三我不认识'
			};

			const session: BlockSession = {
				blockId: 'block-789',
				messages: [],
				analysisResult: mockResult,
				createdAt: '2026-04-15T10:00:00Z',
				updatedAt: '2026-04-15T10:00:00Z',
				currentPhase: 'people'
			};

			expect(session.analysisResult).not.toBeNull();
			expect(session.analysisResult?.aiResponse).toContain('张三');
		});
	});

	describe('AnalysisPhase enum', () => {
		it('should have correct phase values', () => {
			expect(AnalysisPhase.People).toBe('people');
			expect(AnalysisPhase.Projects).toBe('projects');
			expect(AnalysisPhase.Things).toBe('things');
			expect(AnalysisPhase.Ideas).toBe('ideas');
			expect(AnalysisPhase.Knowledge).toBe('knowledge');
			expect(AnalysisPhase.Complete).toBe('complete');
		});

		it('should support all phase values in session', () => {
			const phases: AnalysisPhase[] = [
				'people',
				'projects',
				'things',
				'ideas',
				'knowledge',
				'complete'
			];

			phases.forEach(phase => {
				const session: BlockSession = {
					blockId: `block-${phase}`,
					messages: [],
					analysisResult: null,
					createdAt: '2026-04-15T10:00:00Z',
					updatedAt: '2026-04-15T10:00:00Z',
					currentPhase: phase
				};
				expect(session.currentPhase).toBe(phase);
			});
		});
	});

	describe('phase transition', () => {
		it('should allow phase transitions in correct order', () => {
			const session: BlockSession = {
				blockId: 'block-test',
				messages: [],
				analysisResult: null,
				createdAt: '2026-04-15T10:00:00Z',
				updatedAt: '2026-04-15T10:00:00Z',
				currentPhase: 'people'
			};

			// Simulate phase progression
			session.currentPhase = 'projects';
			expect(session.currentPhase).toBe('projects');

			session.currentPhase = 'things';
			expect(session.currentPhase).toBe('things');

			session.currentPhase = 'complete';
			expect(session.currentPhase).toBe('complete');
		});
	});
});

describe('Block with session support', () => {
	it('should allow block to have analysis result', () => {
		const block: Block = {
			id: 'block-001',
			timestamp: '10:30',
			content: '今天和张三、李四讨论了公共算力平台项目',
			parentId: null,
			children: [],
			category: '工作',
			source: 'Lifewiki'
		};

		expect(block.aiAnalysis).toBeUndefined();

		block.aiAnalysis = {
			blockId: 'block-001',
			timestamp: '2026-04-15T10:30:00Z',
			category: '工作',
			entities: {
				people: [] as EntityPreview[],
				projects: [] as EntityPreview[],
				things: [] as EntityPreview[],
				ideas: [] as EntityPreview[],
				knowledge: [] as EntityPreview[]
			},
			needsConfirmation: [],
			aiResponse: '分析中...'
		};

		expect(block.aiAnalysis).toBeDefined();
		expect(block.aiAnalysis?.aiResponse).toBe('分析中...');
	});
});
