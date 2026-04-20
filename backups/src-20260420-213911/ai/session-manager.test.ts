/**
 * SessionManager Tests
 * Tests for per-block AI session management
 */

import { SessionManager } from './session-manager';
import { AnalysisPhase, ChatMessage, AnalysisResult, EntityPreview } from '../entities/types';

describe('SessionManager', () => {
	let manager: SessionManager;
	let mockApp: any;

	beforeEach(() => {
		mockApp = {
			vault: {
				getAbstractFileByPath: jest.fn().mockReturnValue(null),
				adapter: {
					list: jest.fn().mockResolvedValue({ files: [] }),
					write: jest.fn().mockResolvedValue(undefined)
				}
			}
		};
		manager = new SessionManager(mockApp);
	});

	describe('session creation', () => {
		it('should create a new session for a block', () => {
			const blockId = 'block-001';
			const session = manager.getOrCreateSession(blockId);

			expect(session).toBeDefined();
			expect(session.blockId).toBe(blockId);
			expect(session.messages).toEqual([]);
			expect(session.analysisResult).toBeNull();
			expect(session.currentPhase).toBe(AnalysisPhase.People);
		});

		it('should return existing session for same blockId', () => {
			const blockId = 'block-002';

			const session1 = manager.getOrCreateSession(blockId);
			session1.messages.push({ role: 'user', content: '测试消息' });

			const session2 = manager.getOrCreateSession(blockId);

			expect(session2).toBe(session1);
			expect(session2.messages.length).toBe(1);
		});

		it('should create separate sessions for different blocks', () => {
			const session1 = manager.getOrCreateSession('block-A');
			const session2 = manager.getOrCreateSession('block-B');

			expect(session1).not.toBe(session2);
			expect(session1.blockId).toBe('block-A');
			expect(session2.blockId).toBe('block-B');
		});

		it('should initialize with correct default values', () => {
			const session = manager.getOrCreateSession('block-new');

			expect(session.createdAt).toBeTruthy();
			expect(session.updatedAt).toBeTruthy();
			expect(session.messages).toEqual([]);
			expect(session.analysisResult).toBeNull();
			expect(session.currentPhase).toBe(AnalysisPhase.People);
		});
	});

	describe('message management', () => {
		it('should add a message to session', () => {
			const blockId = 'block-003';
			manager.getOrCreateSession(blockId);

			manager.addMessage(blockId, {
				role: 'assistant',
				content: '你提到的张三我不认识'
			});

			const session = manager.getSession(blockId);
			expect(session?.messages.length).toBe(1);
			expect(session?.messages[0].content).toContain('张三');
		});

		it('should add multiple messages in order', () => {
			const blockId = 'block-004';
			manager.getOrCreateSession(blockId);

			manager.addMessage(blockId, { role: 'assistant', content: '第一条' });
			manager.addMessage(blockId, { role: 'user', content: '用户回复' });
			manager.addMessage(blockId, { role: 'assistant', content: '第二条' });

			const session = manager.getSession(blockId);
			expect(session?.messages.length).toBe(3);
			expect(session?.messages[0].content).toBe('第一条');
			expect(session?.messages[1].content).toBe('用户回复');
			expect(session?.messages[2].content).toBe('第二条');
		});

		it('should update session timestamp when adding message', async () => {
			const blockId = 'block-005';
			const session = manager.getOrCreateSession(blockId);
			const originalUpdatedAt = session.updatedAt;

			// Wait a tiny bit to ensure timestamp difference
			await new Promise(resolve => setTimeout(resolve, 10));
			manager.addMessage(blockId, { role: 'user', content: '新消息' });

			expect(session.updatedAt).not.toBe(originalUpdatedAt);
		});

		it('should return undefined when adding message to non-existent session', () => {
			const result = manager.addMessage('non-existent', { role: 'user', content: 'test' });
			expect(result).toBeUndefined();
		});
	});

	describe('session retrieval', () => {
		it('should return session for existing block', () => {
			const blockId = 'block-006';
			manager.getOrCreateSession(blockId);

			const session = manager.getSession(blockId);
			expect(session).toBeDefined();
			expect(session?.blockId).toBe(blockId);
		});

		it('should return undefined for non-existent block', () => {
			const session = manager.getSession('non-existent-block');
			expect(session).toBeUndefined();
		});
	});

	describe('phase management', () => {
		it('should update current phase', () => {
			const blockId = 'block-007';
			manager.getOrCreateSession(blockId);

			manager.updatePhase(blockId, AnalysisPhase.Projects);

			const session = manager.getSession(blockId);
			expect(session?.currentPhase).toBe(AnalysisPhase.Projects);
		});

		it('should return false when updating phase for non-existent session', () => {
			const result = manager.updatePhase('non-existent', AnalysisPhase.Things);
			expect(result).toBe(false);
		});

		it('should progress through phases correctly', () => {
			const blockId = 'block-008';
			manager.getOrCreateSession(blockId);

			expect(manager.getSession(blockId)?.currentPhase).toBe(AnalysisPhase.People);

			manager.updatePhase(blockId, AnalysisPhase.Projects);
			expect(manager.getSession(blockId)?.currentPhase).toBe(AnalysisPhase.Projects);

			manager.updatePhase(blockId, AnalysisPhase.Things);
			expect(manager.getSession(blockId)?.currentPhase).toBe(AnalysisPhase.Things);

			manager.updatePhase(blockId, AnalysisPhase.Ideas);
			expect(manager.getSession(blockId)?.currentPhase).toBe(AnalysisPhase.Ideas);

			manager.updatePhase(blockId, AnalysisPhase.Knowledge);
			expect(manager.getSession(blockId)?.currentPhase).toBe(AnalysisPhase.Knowledge);

			manager.updatePhase(blockId, AnalysisPhase.Complete);
			expect(manager.getSession(blockId)?.currentPhase).toBe(AnalysisPhase.Complete);
		});
	});

	describe('analysis result management', () => {
		it('should set analysis result', () => {
			const blockId = 'block-009';
			manager.getOrCreateSession(blockId);

			const result: AnalysisResult = {
				blockId,
				timestamp: '2026-04-15T10:00:00Z',
				category: '工作',
				entities: {
					people: [{ type: 'person', name: '张三', confidence: 0.9, context: '提及', isArchived: false }] as EntityPreview[],
					projects: [] as EntityPreview[],
					things: [] as EntityPreview[],
					ideas: [] as EntityPreview[],
					knowledge: [] as EntityPreview[]
				},
				needsConfirmation: ['张三'],
				aiResponse: '你提到的张三我不认识'
			};

			manager.setAnalysisResult(blockId, result);

			const session = manager.getSession(blockId);
			expect(session?.analysisResult).not.toBeNull();
			expect(session?.analysisResult?.aiResponse).toContain('张三');
		});

		it('should return false when setting result for non-existent session', () => {
			const result: AnalysisResult = {
				blockId: 'fake',
				timestamp: '2026-04-15T10:00:00Z',
				category: '工作',
				entities: {
					people: [] as EntityPreview[],
					projects: [] as EntityPreview[],
					things: [] as EntityPreview[],
					ideas: [] as EntityPreview[],
					knowledge: [] as EntityPreview[]
				},
				needsConfirmation: [],
				aiResponse: ''
			};

			const success = manager.setAnalysisResult('non-existent', result);
			expect(success).toBe(false);
		});
	});

	describe('session clearing', () => {
		it('should clear specific session', async () => {
			const blockId = 'block-010';
			manager.getOrCreateSession(blockId);
			manager.addMessage(blockId, { role: 'user', content: 'test' });

			const cleared = await manager.clearSession(blockId);
			expect(cleared).toBe(true);
			expect(manager.getSession(blockId)).toBeUndefined();
		});

		it('should return false when clearing non-existent session', async () => {
			const cleared = await manager.clearSession('non-existent');
			expect(cleared).toBe(false);
		});

		it('should clear all sessions', () => {
			manager.getOrCreateSession('block-A');
			manager.getOrCreateSession('block-B');
			manager.getOrCreateSession('block-C');

			manager.clearAllSessions();

			expect(manager.getSession('block-A')).toBeUndefined();
			expect(manager.getSession('block-B')).toBeUndefined();
			expect(manager.getSession('block-C')).toBeUndefined();
		});
	});

	describe('active session management', () => {
		it('should set and get active block', () => {
			manager.getOrCreateSession('block-active');
			manager.setActiveBlock('block-active');

			expect(manager.getActiveBlockId()).toBe('block-active');
		});

		it('should return null when no active block', () => {
			expect(manager.getActiveBlockId()).toBeNull();
		});

		it('should switch active block', () => {
			manager.getOrCreateSession('block-1');
			manager.getOrCreateSession('block-2');
			manager.setActiveBlock('block-1');

			manager.setActiveBlock('block-2');

			expect(manager.getActiveBlockId()).toBe('block-2');
		});

		it('should get active session', () => {
			const blockId = 'block-active-session';
			manager.getOrCreateSession(blockId);
			manager.setActiveBlock(blockId);

			const activeSession = manager.getActiveSession();
			expect(activeSession).toBeDefined();
			expect(activeSession?.blockId).toBe(blockId);
		});

		it('should return null for active session when none set', () => {
			const activeSession = manager.getActiveSession();
			expect(activeSession).toBeNull();
		});
	});

	describe('session listing', () => {
		it('should list all session blockIds', () => {
			manager.getOrCreateSession('block-x');
			manager.getOrCreateSession('block-y');
			manager.getOrCreateSession('block-z');

			const ids = manager.getAllSessionIds();

			expect(ids).toContain('block-x');
			expect(ids).toContain('block-y');
			expect(ids).toContain('block-z');
			expect(ids.length).toBe(3);
		});

		it('should return empty array when no sessions', () => {
			const ids = manager.getAllSessionIds();
			expect(ids).toEqual([]);
		});
	});
});
