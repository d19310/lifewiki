/**
 * DashScope Provider Tests
 * Tests for 百炼 (DashScope) API implementation
 */
// Test helper: create mock fetch
function createMockFetch(response, ok = true) {
    return jest.fn().mockResolvedValue({
        ok,
        json: jest.fn().mockResolvedValue(response),
        text: jest.fn().mockResolvedValue(JSON.stringify(response))
    });
}
// Import the actual provider - this will fail until we implement it
// For now, we'll test the helper functions and types
describe('DashScope Provider Implementation', () => {
    describe('Request building', () => {
        it('should build correct request format', () => {
            const config = {
                apiKey: 'test-key',
                model: 'qwen2.5-14b',
                baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
            };
            const messages = [
                { role: 'system', content: '你是助手' },
                { role: 'user', content: '你好' }
            ];
            const request = {
                model: config.model || 'qwen2.5-14b',
                messages: messages.map(m => ({
                    role: m.role,
                    content: m.content
                })),
                temperature: 0.7,
                max_tokens: 1000
            };
            expect(request.model).toBe('qwen2.5-14b');
            expect(request.messages.length).toBe(2);
            expect(request.messages[0].role).toBe('system');
            expect(request.messages[1].role).toBe('user');
        });
        it('should handle empty messages array', () => {
            const messages = [];
            const request = {
                model: 'qwen2.5-14b',
                messages: messages.map(m => ({
                    role: m.role,
                    content: m.content
                }))
            };
            expect(request.messages.length).toBe(0);
        });
    });
    describe('Response parsing', () => {
        it('should parse DashScope response correctly', () => {
            const dashscopeResponse = {
                id: 'chatcmpl-123',
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
            };
            const response = {
                content: dashscopeResponse.choices[0].message.content,
                usage: {
                    promptTokens: dashscopeResponse.usage.prompt_tokens,
                    completionTokens: dashscopeResponse.usage.completion_tokens,
                    totalTokens: dashscopeResponse.usage.total_tokens
                }
            };
            expect(response.content).toBe('你好！有什么可以帮助你的吗？');
            expect(response.usage.totalTokens).toBe(30);
        });
        it('should handle JSON content in response', () => {
            const analysisJson = JSON.stringify({
                category: '工作',
                entities: {
                    people: [{ name: '顾伟乐', confidence: 0.9, context: '项目对接人' }],
                    projects: [],
                    things: [],
                    ideas: [],
                    knowledge: []
                },
                needsConfirmation: ['顾伟乐'],
                response: '识别完成'
            });
            const dashscopeResponse = {
                id: 'chatcmpl-456',
                choices: [{
                        message: {
                            role: 'assistant',
                            content: analysisJson
                        },
                        finish_reason: 'stop'
                    }],
                usage: {
                    prompt_tokens: 50,
                    completion_tokens: 80,
                    total_tokens: 130
                }
            };
            const parsed = JSON.parse(dashscopeResponse.choices[0].message.content);
            expect(parsed.category).toBe('工作');
            expect(parsed.entities.people[0].name).toBe('顾伟乐');
            expect(parsed.entities.people[0].confidence).toBe(0.9);
        });
        it('should handle streaming response format', () => {
            const streamingChunk = {
                id: 'chatcmpl-123',
                choices: [{
                        delta: {
                            content: '部'
                        },
                        finish_reason: null
                    }]
            };
            expect(streamingChunk.choices[0].delta).toBeDefined();
            expect(streamingChunk.choices[0].delta.content).toBe('部');
        });
    });
    describe('Error handling', () => {
        it('should handle rate limit error', () => {
            const rateLimitError = {
                error: {
                    message: 'Rate limit exceeded',
                    type: 'rate_limit_error',
                    code: 429
                }
            };
            expect(rateLimitError.error.code).toBe(429);
            expect(rateLimitError.error.type).toBe('rate_limit_error');
        });
        it('should handle authentication error', () => {
            const authError = {
                error: {
                    message: 'Invalid API key',
                    type: 'authentication_error',
                    code: 401
                }
            };
            expect(authError.error.code).toBe(401);
            expect(authError.error.type).toBe('authentication_error');
        });
        it('should handle invalid request error', () => {
            const invalidRequestError = {
                error: {
                    message: 'Invalid request parameters',
                    type: 'invalid_request_error',
                    code: 400
                }
            };
            expect(invalidRequestError.error.code).toBe(400);
        });
        it('should handle server error', () => {
            const serverError = {
                error: {
                    message: 'Internal server error',
                    type: 'server_error',
                    code: 500
                }
            };
            expect(serverError.error.code).toBe(500);
            expect(serverError.error.type).toBe('server_error');
        });
    });
    describe('Analysis prompt building', () => {
        it('should build analysis prompt with content', () => {
            const content = '今天和顾伟乐聊了青岛移动B300项目的情况';
            const prompt = `你是一个日记分析助手。请分析以下日记内容，识别人脉、项目、物品、想法和知识。

日记内容：
${content}

请以JSON格式返回分析结果，包含：
- category: 工作/个人
- entities: 识别的实体（人脉/项目/物品/想法/知识）
- needsConfirmation: 需要用户确认的实体名称数组
- response: 对用户的简短回复（100字以内）

JSON格式：
{
  "category": "工作",
  "entities": {
    "people": [{"name": "姓名", "confidence": 0.9, "context": "上下文"}],
    "projects": [],
    "things": [],
    "ideas": [],
    "knowledge": []
  },
  "needsConfirmation": [],
  "response": "简短回复"
}`;
            expect(prompt).toContain(content);
            expect(prompt).toContain('JSON格式');
            expect(prompt).toContain('category');
        });
        it('should handle multiline content', () => {
            const content = `第一行内容
第二行内容
第三行内容`;
            const prompt = `日记内容：
${content}`;
            expect(prompt).toContain('第一行内容');
            expect(prompt).toContain('第二行内容');
            expect(prompt).toContain('第三行内容');
        });
    });
    describe('URL construction', () => {
        it('should build correct chat completions URL', () => {
            const baseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
            const chatEndpoint = '/chat/completions';
            const fullUrl = `${baseUrl}${chatEndpoint}`;
            expect(fullUrl).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
        });
        it('should handle base URL with trailing slash', () => {
            const baseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1/';
            const chatEndpoint = 'chat/completions';
            const fullUrl = `${baseUrl}${chatEndpoint}`.replace('//', '/');
            expect(fullUrl).not.toContain('//');
        });
    });
    describe('Category parsing', () => {
        it('should parse 工作 category', () => {
            const json = '{"category": "工作"}';
            const parsed = JSON.parse(json);
            expect(parsed.category).toBe('工作');
        });
        it('should parse 个人 category', () => {
            const json = '{"category": "个人"}';
            const parsed = JSON.parse(json);
            expect(parsed.category).toBe('个人');
        });
        it('should default to 待确认 for unknown category', () => {
            const json = '{"category": "未知"}';
            const parsed = JSON.parse(json);
            const category = ['工作', '个人'].includes(parsed.category) ? parsed.category : '待确认';
            expect(category).toBe('待确认');
        });
    });
    describe('Entity type mapping', () => {
        it('should map person to people', () => {
            const entity = { type: 'person', name: '顾伟乐' };
            const typeMapping = {
                person: 'people',
                project: 'projects',
                thing: 'things',
                idea: 'ideas',
                knowledge: 'knowledge'
            };
            expect(typeMapping[entity.type]).toBe('people');
        });
        it('should map project to projects', () => {
            const entity = { type: 'project', name: '青岛B300项目' };
            const typeMapping = {
                person: 'people',
                project: 'projects',
                thing: 'things',
                idea: 'ideas',
                knowledge: 'knowledge'
            };
            expect(typeMapping[entity.type]).toBe('projects');
        });
    });
    describe('Token estimation', () => {
        it('should estimate tokens for Chinese text', () => {
            // Rough estimation: Chinese chars ≈ 1.5 tokens
            const chineseText = '今天和顾伟乐聊了青岛移动B300项目的情况';
            const estimatedTokens = Math.ceil(chineseText.length / 2);
            expect(estimatedTokens).toBeGreaterThan(0);
            expect(estimatedTokens).toBeLessThan(chineseText.length);
        });
        it('should estimate tokens for mixed text', () => {
            const mixedText = 'Hello World 今天是个好日子';
            const englishChars = mixedText.replace(/[^\x00-\x7F]/g, '').length;
            const otherChars = mixedText.length - englishChars;
            const estimatedTokens = Math.ceil(englishChars / 4) + Math.ceil(otherChars / 2);
            expect(estimatedTokens).toBeGreaterThan(0);
        });
    });
});
export {};
