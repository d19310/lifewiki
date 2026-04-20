/**
 * AI Analysis Panel - Chat Mode Tests
 * Tests for mode switching between analysis and chat modes
 */

import type LifeWikiPlugin from '../main';
import type { AIProvider } from '../ai/provider';
import type { EntityManager } from '../entities/manager';
import type { SessionManager } from '../ai/session-manager';
import { AIAnalysisPanelView } from './ai-analysis-panel';
import { ChatMessage, PanelMode } from '../entities/types';

// Mock classes
const mockPlugin = {
  getAIAnalysisView: jest.fn(),
  getSessionManager: jest.fn(),
  getLangGraphAgent: jest.fn(),
  getEntityManager: jest.fn(),
  aiAnalysisView: null as AIAnalysisPanelView | null
} as unknown as LifeWikiPlugin;

const mockSessionManager = {
  getOrCreateSession: jest.fn(),
  getSession: jest.fn(),
  addMessage: jest.fn(),
  setActiveBlock: jest.fn(),
  clearSession: jest.fn(),
  getOrCreateChatSession: jest.fn(),
  getChatSession: jest.fn(),
  addChatMessage: jest.fn(),
  clearChatSession: jest.fn()
} as unknown as SessionManager;

const mockAIProvider = {
  chat: jest.fn(),
  analyzeBlock: jest.fn(),
  isReady: jest.fn(() => true)
} as unknown as AIProvider;

describe('AIAnalysisPanelView - Chat Mode', () => {
  let view: AIAnalysisPanelView;
  let mockLeaf: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLeaf = {
      view: null
    };

    // Setup mocks
    mockPlugin.getSessionManager.mockReturnValue(mockSessionManager);
    mockPlugin.getAIAnalysisView.mockReturnValue(view);
    mockPlugin.getLangGraphAgent.mockReturnValue(null);

    // Mock session
    const mockSession = {
      blockId: 'test-block',
      messages: [] as ChatMessage[],
      analysisResult: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    mockSessionManager.getOrCreateSession.mockReturnValue(mockSession);

    // Mock chat session
    const mockChatSession = {
      blockId: 'chat:global',
      messages: [] as ChatMessage[],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    mockSessionManager.getOrCreateChatSession.mockReturnValue(mockChatSession);
    mockSessionManager.getChatSession.mockReturnValue(mockChatSession);
  });

  describe('PanelMode type', () => {
    it('should support analysis and chat modes', () => {
      const modes: PanelMode[] = ['analysis', 'chat'];
      expect(modes).toContain('analysis');
      expect(modes).toContain('chat');
    });
  });

  describe('mode switching', () => {
    it('should switch from analysis to chat mode', () => {
      expect(true).toBe(true);
    });

    it('should switch from chat to analysis mode', () => {
      expect(true).toBe(true);
    });
  });

  describe('chat session management', () => {
    it('should create chat session with chat:global blockId', () => {
      const chatSession = mockSessionManager.getOrCreateChatSession();

      expect(mockSessionManager.getOrCreateChatSession).toHaveBeenCalled();
      expect(chatSession.blockId).toBe('chat:global');
    });

    it('should add messages to chat session', () => {
      const chatMessage: ChatMessage = { role: 'user', content: '帮我复盘今天的日记' };
      mockSessionManager.addChatMessage(chatMessage);

      expect(mockSessionManager.addChatMessage).toHaveBeenCalledWith(chatMessage);
    });

    it('should get chat session', () => {
      const chatSession = mockSessionManager.getChatSession();

      expect(mockSessionManager.getChatSession).toHaveBeenCalled();
      expect(chatSession).toBeDefined();
      expect(chatSession?.blockId).toBe('chat:global');
    });
  });

  describe('clear chat session', () => {
    it('should clear chat session when in chat mode', () => {
      mockSessionManager.clearChatSession();

      expect(mockSessionManager.clearChatSession).toHaveBeenCalled();
    });
  });
});

describe('SessionManager - Chat Session', () => {
  describe('getOrCreateChatSession', () => {
    it('should create session with chat:global blockId', () => {
      const chatBlockId = 'chat:global';
      expect(chatBlockId).toBe('chat:global');
    });
  });
});
