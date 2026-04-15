/**
 * DashScope Provider Tests
 * TDD tests for 百炼 (DashScope) API provider
 */

import { ChatMessage, AnalysisResult } from '../entities/types';

// Mock fetch globally for tests
const mockFetch = jest.fn();
global.fetch = mockFetch;

// These tests import the actual DashScopeProvider
import { DashScopeProvider } from './dashscope';

describe('DashScopeProvider', () => {
  const mockApiKey = 'test-api-key';
  const mockBaseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create provider with api key', () => {
      const provider = new DashScopeProvider({ apiKey: mockApiKey });
      expect(provider).toBeDefined();
    });

    it('should accept custom base URL', () => {
      const provider = new DashScopeProvider({
        apiKey: mockApiKey,
        baseUrl: mockBaseUrl
      });
      expect(provider).toBeDefined();
    });

    it('should accept custom model', () => {
      const provider = new DashScopeProvider({
        apiKey: mockApiKey,
        model: 'qwen2.5-14b'
      });
      expect(provider).toBeDefined();
    });

    it('should use default model if not specified', () => {
      const provider = new DashScopeProvider({ apiKey: mockApiKey });
      expect(provider).toBeDefined();
    });
  });

  describe('chat', () => {
    it('should send messages to DashScope API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          id: 'chatcmpl-test',
          choices: [{
            message: {
              role: 'assistant',
              content: '你好！有什么可以帮助你的吗？'
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30
          }
        })
      });

      const provider = new DashScopeProvider({ apiKey: mockApiKey });
      const messages: ChatMessage[] = [
        { role: 'user', content: '你好' }
      ];

      const response = await provider.chat(messages);

      expect(response).toHaveProperty('content');
      expect(response).toHaveProperty('usage');
      expect(response.content).toBe('你好！有什么可以帮助你的吗？');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle system message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          id: 'chatcmpl-test',
          choices: [{
            message: {
              role: 'assistant',
              content: '好的，我明白了。'
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 20,
            completion_tokens: 10,
            total_tokens: 30
          }
        })
      });

      const provider = new DashScopeProvider({ apiKey: mockApiKey });
      const messages: ChatMessage[] = [
        { role: 'system', content: '你是助手' },
        { role: 'user', content: '你好' }
      ];

      const response = await provider.chat(messages);

      expect(response.content).toBe('好的，我明白了。');
    });

    it('should handle empty messages', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          id: 'chatcmpl-test',
          choices: [{
            message: {
              role: 'assistant',
              content: ''
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0
          }
        })
      });

      const provider = new DashScopeProvider({ apiKey: mockApiKey });

      const response = await provider.chat([]);

      expect(response.content).toBe('');
    });
  });

  describe('analyzeBlock', () => {
    it('should analyze block content and return structured result', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          id: 'chatcmpl-test',
          choices: [{
            message: {
              role: 'assistant',
              content: JSON.stringify({
                category: '工作',
                entities: {
                  people: [{ name: '顾伟乐', confidence: 0.9, context: '项目对接人' }],
                  projects: [{ name: '青岛B300项目', confidence: 0.95, context: 'B300采购' }],
                  things: [],
                  ideas: [],
                  knowledge: []
                },
                needsConfirmation: ['顾伟乐'],
                response: '识别到1人脉1项目'
              })
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 50,
            completion_tokens: 80,
            total_tokens: 130
          }
        })
      });

      const provider = new DashScopeProvider({ apiKey: mockApiKey });
      const content = '今天和顾伟乐聊了青岛移动B300项目的情况';

      const result = await provider.analyzeBlock(content);

      expect(result).toHaveProperty('blockId');
      expect(result).toHaveProperty('category');
      expect(result.category).toBe('工作');
      expect(result).toHaveProperty('entities');
      expect(result).toHaveProperty('needsConfirmation');
      expect(result).toHaveProperty('aiResponse');
    });

    it('should identify people entities', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          id: 'chatcmpl-test',
          choices: [{
            message: {
              role: 'assistant',
              content: JSON.stringify({
                category: '工作',
                entities: {
                  people: [{ name: '顾伟乐', confidence: 0.9, context: '项目对接人' }],
                  projects: [],
                  things: [],
                  ideas: [],
                  knowledge: []
                },
                needsConfirmation: ['顾伟乐'],
                response: '识别到人脉'
              })
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 50,
            completion_tokens: 80,
            total_tokens: 130
          }
        })
      });

      const provider = new DashScopeProvider({ apiKey: mockApiKey });
      const content = '今天和顾伟乐聊了青岛移动B300项目的情况';

      const result = await provider.analyzeBlock(content);

      expect(result.entities.people.length).toBe(1);
      expect(result.entities.people[0].name).toBe('顾伟乐');
      expect(result.entities.people[0]).toHaveProperty('confidence');
      expect(result.entities.people[0]).toHaveProperty('context');
    });

    it('should identify project entities', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          id: 'chatcmpl-test',
          choices: [{
            message: {
              role: 'assistant',
              content: JSON.stringify({
                category: '工作',
                entities: {
                  people: [],
                  projects: [{ name: '青岛B300项目', confidence: 0.95, context: 'B300采购' }],
                  things: [],
                  ideas: [],
                  knowledge: []
                },
                needsConfirmation: [],
                response: '识别到项目'
              })
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 50,
            completion_tokens: 80,
            total_tokens: 130
          }
        })
      });

      const provider = new DashScopeProvider({ apiKey: mockApiKey });
      const content = '今天和顾伟乐聊了青岛移动B300项目的情况';

      const result = await provider.analyzeBlock(content);

      expect(result.entities.projects.length).toBe(1);
      expect(result.entities.projects[0].name).toBe('青岛B300项目');
      expect(result.entities.projects[0]).toHaveProperty('confidence');
    });

    it('should return confidence scores between 0 and 1', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          id: 'chatcmpl-test',
          choices: [{
            message: {
              role: 'assistant',
              content: JSON.stringify({
                category: '工作',
                entities: {
                  people: [{ name: '测试', confidence: 0.9, context: '测试' }],
                  projects: [],
                  things: [],
                  ideas: [],
                  knowledge: []
                },
                needsConfirmation: [],
                response: '完成'
              })
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 50,
            completion_tokens: 80,
            total_tokens: 130
          }
        })
      });

      const provider = new DashScopeProvider({ apiKey: mockApiKey });
      const content = '测试内容';

      const result = await provider.analyzeBlock(content);

      const allEntities = [
        ...result.entities.people,
        ...result.entities.projects,
        ...result.entities.things,
        ...result.entities.ideas,
        ...result.entities.knowledge
      ];

      for (const entity of allEntities) {
        expect(entity.confidence).toBeGreaterThanOrEqual(0);
        expect(entity.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('error handling', () => {
    it('should throw error when API key is missing', async () => {
      const provider = new DashScopeProvider({ apiKey: '' });

      await expect(provider.chat([{ role: 'user', content: 'test' }]))
        .rejects.toThrow();
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: jest.fn().mockResolvedValue({
          error: {
            message: 'Incorrect API key provided',
            type: 'apikey_error',
            code: 401
          }
        })
      });

      const provider = new DashScopeProvider({ apiKey: 'invalid-key' });

      await expect(provider.chat([{ role: 'user', content: 'test' }]))
        .rejects.toThrow();
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const provider = new DashScopeProvider({
        apiKey: mockApiKey,
        baseUrl: 'http://localhost:99999'
      });

      await expect(provider.chat([{ role: 'user', content: 'test' }]))
        .rejects.toThrow();
    });
  });

  describe('configuration', () => {
    it('should support custom timeout', () => {
      const provider = new DashScopeProvider({
        apiKey: mockApiKey,
        timeout: 5000
      });

      expect(provider).toBeDefined();
    });

    it('should support temperature setting', () => {
      const provider = new DashScopeProvider({
        apiKey: mockApiKey,
        temperature: 0.5
      });

      expect(provider).toBeDefined();
    });

    it('should support max tokens setting', () => {
      const provider = new DashScopeProvider({
        apiKey: mockApiKey,
        maxTokens: 2000
      });

      expect(provider).toBeDefined();
    });
  });
});
