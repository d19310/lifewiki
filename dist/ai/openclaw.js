/**
 * OpenClaw WebSocket Client
 * Connects to OpenClaw Gateway for AI chat and analysis
 */
function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
export class OpenClawClient {
    constructor(config = {}) {
        this.ws = null;
        this.sessionKey = null;
        this.connected = false;
        this.messageQueue = [];
        this.pendingResponses = new Map();
        this.config = {
            gatewayUrl: config.gatewayUrl || 'ws://localhost:18789',
            timeout: config.timeout || 30000
        };
    }
    async connect() {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.config.gatewayUrl);
                const timeout = setTimeout(() => {
                    reject(new Error('Connection timeout'));
                }, this.config.timeout);
                this.ws.onopen = () => {
                    console.log('OpenClaw: Connected');
                    this.connected = true;
                    clearTimeout(timeout);
                    this.authenticate().then(resolve).catch(reject);
                };
                this.ws.onmessage = (event) => {
                    this.handleMessage(JSON.parse(event.data));
                };
                this.ws.onerror = (error) => {
                    console.error('OpenClaw: WebSocket error', error);
                    clearTimeout(timeout);
                    reject(error);
                };
                this.ws.onclose = () => {
                    console.log('OpenClaw: Disconnected');
                    this.connected = false;
                };
            }
            catch (error) {
                reject(error);
            }
        });
    }
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
    async authenticate() {
        // Note: In actual implementation, need to use device credentials
        // from ~/.openclaw/identity/ for Ed25519 signing
        // This is a simplified version for MVP
        return new Promise((resolve, reject) => {
            if (!this.ws) {
                reject(new Error('WebSocket not connected'));
                return;
            }
            // Wait for challenge
            const messageHandler = (event) => {
                const msg = JSON.parse(event.data);
                if (msg.event !== 'connect.challenge')
                    return;
                this.ws?.removeEventListener('message', messageHandler);
                // In MVP, use a simplified auth flow
                // Full implementation requires Ed25519 signing
                this.send({
                    type: 'req',
                    id: uuid(),
                    method: 'connect',
                    params: {
                        minProtocol: 3,
                        maxProtocol: 3,
                        client: {
                            id: 'lifewiki-plugin',
                            displayName: 'LifeWiki',
                            version: '0.1.0',
                            platform: 'obsidian',
                            mode: 'plugin',
                            instanceId: uuid()
                        },
                        role: 'operator',
                        scopes: ['operator.read', 'operator.write'],
                        locale: 'zh-CN'
                    }
                });
                // Wait for hello-ok
                const helloHandler = (event) => {
                    const msg = JSON.parse(event.data);
                    if (msg.type !== 'res' || msg.payload?.type !== 'hello-ok')
                        return;
                    this.ws?.removeEventListener('message', helloHandler);
                    resolve();
                };
                this.ws?.addEventListener('message', helloHandler);
                setTimeout(() => reject(new Error('Auth timeout')), this.config.timeout);
            };
            this.ws?.addEventListener('message', messageHandler);
        });
    }
    send(data) {
        if (this.ws && this.connected) {
            this.ws.send(JSON.stringify(data));
        }
        else {
            this.messageQueue.push(data);
        }
    }
    handleMessage(msg) {
        // Handle responses to pending requests
        if (msg.type === 'res' && msg.id) {
            const pending = this.pendingResponses.get(msg.id);
            if (pending) {
                this.pendingResponses.delete(msg.id);
                if (msg.ok) {
                    pending.resolve(msg);
                }
                else {
                    pending.reject(new Error(msg.error?.message || 'Request failed'));
                }
            }
        }
        // Handle session creation response
        if (msg.type === 'res' && msg.payload?.key && !this.sessionKey) {
            this.sessionKey = msg.payload.key;
        }
    }
    async request(method, params) {
        return new Promise((resolve, reject) => {
            if (!this.ws || !this.connected) {
                reject(new Error('Not connected'));
                return;
            }
            const id = uuid();
            this.pendingResponses.set(id, { resolve, reject });
            this.send({
                type: 'req',
                id,
                method,
                params
            });
            // Timeout
            setTimeout(() => {
                if (this.pendingResponses.has(id)) {
                    this.pendingResponses.delete(id);
                    reject(new Error(`Request timeout: ${method}`));
                }
            }, this.config.timeout);
        });
    }
    async createSession(agentId = 'diaryagent') {
        if (this.sessionKey)
            return this.sessionKey;
        const response = await this.request('sessions.create', { agentId });
        if (response.payload?.key) {
            this.sessionKey = response.payload.key;
            return this.sessionKey;
        }
        throw new Error('Failed to create session');
    }
    async sendMessage(content) {
        if (!this.sessionKey) {
            await this.createSession();
        }
        return new Promise((resolve, reject) => {
            if (!this.ws || !this.connected) {
                reject(new Error('Not connected'));
                return;
            }
            const id = uuid();
            // Collect all messages until session.done or timeout
            const messages = [];
            const messageHandler = (event) => {
                const msg = JSON.parse(event.data);
                if (msg.type === 'res' && msg.id === id) {
                    this.ws?.removeEventListener('message', messageHandler);
                    // Find the final response
                    const finalMsg = messages.find(m => m.event === 'chat' && m.payload?.state === 'final');
                    resolve(finalMsg?.payload?.message?.content || '');
                }
                messages.push(msg);
            };
            this.ws?.addEventListener('message', messageHandler);
            this.send({
                type: 'req',
                id,
                method: 'chat.send',
                params: {
                    sessionKey: this.sessionKey,
                    idempotencyKey: uuid(),
                    message: content,
                    deliver: false
                }
            });
            setTimeout(() => {
                this.ws?.removeEventListener('message', messageHandler);
                if (this.pendingResponses.has(id)) {
                    this.pendingResponses.delete(id);
                    resolve('');
                }
            }, 60000);
        });
    }
    async analyzeBlock(blockContent, blockId) {
        // Create analysis prompt for the AI
        const prompt = this.buildAnalysisPrompt(blockContent);
        // Get AI response
        const response = await this.sendMessage(prompt);
        // Parse AI response into structured analysis
        return this.parseAnalysisResponse(blockId, blockContent, response);
    }
    buildAnalysisPrompt(content) {
        return `你是一个日记分析助手。请分析以下日记内容，提取信息并按要求回复。

日记内容：
${content}

请分析并回复 JSON 格式（不带 markdown 代码块）：
{
  "category": "工作"|"个人"|"待确认",
  "entities": {
    "people": [{"name": "姓名", "confidence": 0-1, "context": "提及上下文", "isArchived": true/false}],
    "projects": [{"name": "项目名", "confidence": 0-1, "context": "提及上下文", "isArchived": true/false}],
    "things": [{"name": "物品名", "category": "产品/软件/商品", "confidence": 0-1, "context": "提及上下文"}],
    "ideas": [{"name": "想法", "confidence": 0-1, "context": "提及上下文"}],
    "knowledge": [{"name": "知识标题", "source_type": "article/paper/book/链接", "url": "如果有", "confidence": 0-1}]
  },
  "needsConfirmation": ["需要向用户确认的问题"],
  "aiResponse": "对用户的友好回复，不超过100字"
}`;
    }
    parseAnalysisResponse(blockId, content, response) {
        try {
            // Try to parse as JSON
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    blockId,
                    timestamp: new Date().toISOString(),
                    category: parsed.category || '待确认',
                    entities: {
                        people: (parsed.entities?.people || []).map((p) => ({
                            type: 'person',
                            name: p.name,
                            confidence: p.confidence || 0.5,
                            context: p.context || content,
                            isArchived: p.isArchived || false
                        })),
                        projects: (parsed.entities?.projects || []).map((p) => ({
                            type: 'project',
                            name: p.name,
                            confidence: p.confidence || 0.5,
                            context: p.context || content,
                            isArchived: p.isArchived || false
                        })),
                        things: (parsed.entities?.things || []).map((t) => ({
                            type: 'thing',
                            name: t.name,
                            confidence: t.confidence || 0.5,
                            context: t.context || content,
                            isArchived: false
                        })),
                        ideas: (parsed.entities?.ideas || []).map((i) => ({
                            type: 'idea',
                            name: i.name,
                            confidence: i.confidence || 0.5,
                            context: i.context || content,
                            isArchived: false
                        })),
                        knowledge: (parsed.entities?.knowledge || []).map((k) => ({
                            type: 'knowledge',
                            name: k.name,
                            confidence: k.confidence || 0.5,
                            context: k.context || content,
                            isArchived: false
                        }))
                    },
                    needsConfirmation: parsed.needsConfirmation || [],
                    aiResponse: parsed.aiResponse || ''
                };
            }
        }
        catch (e) {
            console.error('Failed to parse AI response:', e);
        }
        // Fallback: return empty analysis
        return {
            blockId,
            timestamp: new Date().toISOString(),
            category: '待确认',
            entities: { people: [], projects: [], things: [], ideas: [], knowledge: [] },
            needsConfirmation: [],
            aiResponse: response.substring(0, 100)
        };
    }
    isConnected() {
        return this.connected;
    }
}
