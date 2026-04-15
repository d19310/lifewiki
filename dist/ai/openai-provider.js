/**
 * OpenAI Provider
 * LLM Provider implementation for OpenAI API
 */
const DEFAULT_MODEL = 'gpt-4';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_TIMEOUT = 30000;
export class OpenAIProvider {
    constructor(config) {
        if (!config.apiKey) {
            throw new Error('API key is required for OpenAI');
        }
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
        this.model = config.model || DEFAULT_MODEL;
        this.timeout = config.timeout || DEFAULT_TIMEOUT;
    }
    async chat(messages) {
        const url = `${this.baseUrl}/chat/completions`;
        const request = {
            model: this.model,
            messages: messages.map(m => ({
                role: m.role,
                content: m.content
            })),
            temperature: 0.7,
            max_tokens: 1000
        };
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify(request),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error?.message || `HTTP ${response.status}`);
            }
            const data = await response.json();
            if (data.error) {
                throw new Error(data.error.message);
            }
            return {
                content: data.choices[0]?.message?.content || '',
                usage: {
                    promptTokens: data.usage?.prompt_tokens || 0,
                    completionTokens: data.usage?.completion_tokens || 0,
                    totalTokens: data.usage?.total_tokens || 0
                }
            };
        }
        catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof Error) {
                if (error.name === 'AbortError') {
                    throw new Error('Request timeout');
                }
                throw error;
            }
            throw new Error('Unknown error occurred');
        }
    }
    async analyzeBlock(content) {
        const blockId = this.generateId();
        const timestamp = new Date().toISOString();
        const systemPrompt = `你是一个日记分析助手。请分析以下日记内容，识别人脉、项目、物品、想法和知识。

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
        const response = await this.chat([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `分析这条日记：${content}` }
        ]);
        return this.parseAnalysisResponse(response.content, blockId, timestamp);
    }
    parseAnalysisResponse(content, blockId, timestamp) {
        let category = '待确认';
        let entities = {
            people: [],
            projects: [],
            things: [],
            ideas: [],
            knowledge: []
        };
        let needsConfirmation = [];
        let response = content;
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const json = JSON.parse(jsonMatch[0]);
                category = ['工作', '个人'].includes(json.category) ? json.category : '待确认';
                entities = {
                    people: (json.entities?.people || []).map((e) => ({
                        name: e.name,
                        type: 'person',
                        confidence: e.confidence || 0.5,
                        context: e.context || '',
                        isArchived: false,
                        newEntity: true
                    })),
                    projects: (json.entities?.projects || []).map((e) => ({
                        name: e.name,
                        type: 'project',
                        confidence: e.confidence || 0.5,
                        context: e.context || '',
                        isArchived: false,
                        newEntity: true
                    })),
                    things: (json.entities?.things || []).map((e) => ({
                        name: e.name,
                        type: 'thing',
                        confidence: e.confidence || 0.5,
                        context: e.context || '',
                        isArchived: false,
                        newEntity: true
                    })),
                    ideas: (json.entities?.ideas || []).map((e) => ({
                        name: e.name,
                        type: 'idea',
                        confidence: e.confidence || 0.5,
                        context: e.context || '',
                        isArchived: false,
                        newEntity: true
                    })),
                    knowledge: (json.entities?.knowledge || []).map((e) => ({
                        name: e.name,
                        type: 'knowledge',
                        confidence: e.confidence || 0.5,
                        context: e.context || '',
                        isArchived: false,
                        newEntity: true
                    }))
                };
                needsConfirmation = json.needsConfirmation || [];
                response = json.response || content;
            }
        }
        catch (error) {
            console.error('Failed to parse AI response:', error);
        }
        return {
            blockId,
            timestamp,
            category,
            entities,
            needsConfirmation,
            aiResponse: response
        };
    }
    isReady() {
        return !!this.apiKey;
    }
    generateId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
}
