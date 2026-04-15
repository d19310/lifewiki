/**
 * Ollama Provider Tests
 * Tests for Ollama local model provider
 */

import { requestUrl } from 'obsidian';

// Mock requestUrl
jest.mock('obsidian', () => ({
  requestUrl: jest.fn()
}));

import { OllamaProvider } from './ollama';

describe('OllamaProvider', () => {
  const mockBaseUrl = 'http://localhost:11434';
  const mockModel = 'llama3';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create provider with defaults', () => {
      const provider = new OllamaProvider();
      expect(provider).toBeDefined();
    });

    it('should accept custom base URL', () => {
      const provider = new OllamaProvider({ baseUrl: mockBaseUrl });
      expect(provider).toBeDefined();
    });

    it('should accept custom model', () => {
      const provider = new OllamaProvider({ model: mockModel });
      expect(provider).toBeDefined();
    });

    it('should accept custom timeout', () => {
      const provider = new OllamaProvider({ timeout: 5000 });
      expect(provider).toBeDefined();
    });
  });

  describe('chat', () => {
    it('should send messages to Ollama API', async () => {
      (requestUrl as jest.Mock).mockResolvedValueOnce({
        status: 200,
        json: {
          message: {
            role: 'assistant',
            content: '你好！有什么可以帮助你的吗？'
          },
          done: true
        }
      });

      const provider = new OllamaProvider({ baseUrl: mockBaseUrl, model: mockModel });
      const response = await provider.chat([{ role: 'user', content: '你好' }]);

      expect(response).toHaveProperty('content');
      expect(response.content).toBe('你好！有什么可以帮助你的吗？');
      expect(requestUrl).toHaveBeenCalledTimes(1);
    });

    it('should handle system message', async () => {
      (requestUrl as jest.Mock).mockResolvedValueOnce({
        status: 200,
        json: {
          message: {
            role: 'assistant',
            content: '好的，我明白了。'
          },
          done: true
        }
      });

      const provider = new OllamaProvider({ baseUrl: mockBaseUrl, model: mockModel });
      const response = await provider.chat([
        { role: 'system', content: '你是助手' },
        { role: 'user', content: '你好' }
      ]);

      expect(response.content).toBe('好的，我明白了。');
    });

    it('should handle empty messages', async () => {
      (requestUrl as jest.Mock).mockResolvedValueOnce({
        status: 200,
        json: {
          message: {
            role: 'assistant',
            content: ''
          },
          done: true
        }
      });

      const provider = new OllamaProvider({ baseUrl: mockBaseUrl, model: mockModel });
      const response = await provider.chat([]);

      expect(response.content).toBe('');
    });
  });

  describe('analyzeBlock', () => {
    it('should analyze block content and return structured result', async () => {
      (requestUrl as jest.Mock).mockResolvedValueOnce({
        status: 200,
        json: {
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
          done: true
        }
      });

      const provider = new OllamaProvider({ baseUrl: mockBaseUrl, model: mockModel });
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
      (requestUrl as jest.Mock).mockResolvedValueOnce({
        status: 200,
        json: {
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
          done: true
        }
      });

      const provider = new OllamaProvider({ baseUrl: mockBaseUrl, model: mockModel });
      const content = '今天和顾伟乐聊了青岛移动B300项目的情况';

      const result = await provider.analyzeBlock(content);

      expect(result.entities.people.length).toBe(1);
      expect(result.entities.people[0].name).toBe('顾伟乐');
    });

    it('should handle parse errors gracefully', async () => {
      (requestUrl as jest.Mock).mockResolvedValueOnce({
        status: 200,
        json: {
          message: {
            role: 'assistant',
            content: '这不是JSON格式的响应'
          },
          done: true
        }
      });

      const provider = new OllamaProvider({ baseUrl: mockBaseUrl, model: mockModel });
      const content = '测试内容';

      const result = await provider.analyzeBlock(content);

      // Should still return a valid result, just with defaults
      expect(result).toHaveProperty('blockId');
      expect(result).toHaveProperty('category');
      expect(result.category).toBe('待确认');
    });
  });

  describe('error handling', () => {
    it('should handle network errors', async () => {
      (requestUrl as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const provider = new OllamaProvider({ baseUrl: 'http://localhost:99999' });

      await expect(provider.chat([{ role: 'user', content: 'test' }]))
        .rejects.toThrow();
    });

    it('should handle HTTP errors', async () => {
      (requestUrl as jest.Mock).mockResolvedValueOnce({
        status: 500,
        json: {}
      });

      const provider = new OllamaProvider({ baseUrl: mockBaseUrl, model: mockModel });

      await expect(provider.chat([{ role: 'user', content: 'test' }]))
        .rejects.toThrow();
    });
  });

  describe('isReady', () => {
    it('should return true', () => {
      const provider = new OllamaProvider();
      expect(provider.isReady()).toBe(true);
    });
  });
});
