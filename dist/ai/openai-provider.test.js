/**
 * OpenAI Provider Tests
 * Tests for OpenAI API provider
 */
import { OpenAIProvider } from './openai-provider';
// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;
describe('OpenAIProvider', () => {
    const mockApiKey = 'sk-test-key';
    const mockBaseUrl = 'https://api.openai.com/v1';
    const mockModel = 'gpt-4';
    beforeEach(() => {
        jest.clearAllMocks();
    });
    describe('constructor', () => {
        it('should create provider with api key', () => {
            const provider = new OpenAIProvider({ apiKey: mockApiKey });
            expect(provider).toBeDefined();
        });
        it('should throw error when API key is missing', () => {
            expect(() => new OpenAIProvider({ apiKey: '' })).toThrow('API key is required');
        });
        it('should accept custom base URL', () => {
            const provider = new OpenAIProvider({ apiKey: mockApiKey, baseUrl: mockBaseUrl });
            expect(provider).toBeDefined();
        });
        it('should accept custom model', () => {
            const provider = new OpenAIProvider({ apiKey: mockApiKey, model: mockModel });
            expect(provider).toBeDefined();
        });
    });
    describe('chat', () => {
        it('should send messages to OpenAI API', async () => {
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
            const provider = new OpenAIProvider({ apiKey: mockApiKey });
            const response = await provider.chat([{ role: 'user', content: '你好' }]);
            expect(response).toHaveProperty('content');
            expect(response.content).toBe('你好！有什么可以帮助你的吗？');
            expect(response.usage.totalTokens).toBe(30);
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
            const provider = new OpenAIProvider({ apiKey: mockApiKey });
            const response = await provider.chat([
                { role: 'system', content: '你是助手' },
                { role: 'user', content: '你好' }
            ]);
            expect(response.content).toBe('好的，我明白了。');
        });
        it('should include Authorization header', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: jest.fn().mockResolvedValue({
                    id: 'chatcmpl-test',
                    choices: [{
                            message: { role: 'assistant', content: 'Hi' },
                            finish_reason: 'stop'
                        }],
                    usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 }
                })
            });
            const provider = new OpenAIProvider({ apiKey: mockApiKey });
            await provider.chat([{ role: 'user', content: 'Hi' }]);
            expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
                headers: expect.objectContaining({
                    'Authorization': `Bearer ${mockApiKey}`
                })
            }));
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
            const provider = new OpenAIProvider({ apiKey: mockApiKey });
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
            const provider = new OpenAIProvider({ apiKey: mockApiKey });
            const content = '今天和顾伟乐聊了青岛移动B300项目的情况';
            const result = await provider.analyzeBlock(content);
            expect(result.entities.people.length).toBe(1);
            expect(result.entities.people[0].name).toBe('顾伟乐');
        });
    });
    describe('error handling', () => {
        it('should handle API errors', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                json: jest.fn().mockResolvedValue({
                    error: {
                        message: 'Incorrect API key provided',
                        type: 'invalid_request_error',
                        code: 401
                    }
                })
            });
            const provider = new OpenAIProvider({ apiKey: 'invalid-key' });
            await expect(provider.chat([{ role: 'user', content: 'test' }]))
                .rejects.toThrow();
        });
        it('should handle network errors', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));
            const provider = new OpenAIProvider({ apiKey: mockApiKey });
            await expect(provider.chat([{ role: 'user', content: 'test' }]))
                .rejects.toThrow();
        });
        it('should handle timeout', async () => {
            mockFetch.mockImplementation(() => new Promise((_, reject) => {
                const error = new Error('timeout');
                error.name = 'AbortError';
                reject(error);
            }));
            const provider = new OpenAIProvider({ apiKey: mockApiKey, timeout: 1 });
            await expect(provider.chat([{ role: 'user', content: 'test' }]))
                .rejects.toThrow('Request timeout');
        });
    });
    describe('isReady', () => {
        it('should return true when API key is set', () => {
            const provider = new OpenAIProvider({ apiKey: mockApiKey });
            expect(provider.isReady()).toBe(true);
        });
    });
});
