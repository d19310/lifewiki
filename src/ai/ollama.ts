/**
 * Ollama Provider
 * LLM Provider implementation for Ollama local models
 */

import { ChatMessage, ChatResponse, AnalysisResult, EntityPreview } from '../entities/types';

export interface OllamaConfig {
  baseUrl?: string;
  model?: string;
  timeout?: number;
}

interface OllamaRequest {
  model: string;
  messages: { role: string; content: string }[];
  stream?: boolean;
}

interface OllamaResponse {
  message: {
    role: string;
    content: string;
  };
  done: boolean;
}

const DEFAULT_MODEL = 'llama3';
const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_TIMEOUT = 60000;

export class OllamaProvider {
  private baseUrl: string;
  private model: string;
  private timeout: number;

  constructor(config: OllamaConfig = {}) {
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    this.model = config.model || DEFAULT_MODEL;
    this.timeout = config.timeout || DEFAULT_TIMEOUT;
  }

  async chat(messages: ChatMessage[]): Promise<ChatResponse> {
    const url = `${this.baseUrl}/api/chat`;

    const request: OllamaRequest = {
      model: this.model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      stream: false
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(request),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: OllamaResponse = await response.json();

      return {
        content: data.message.content || '',
        usage: {
          promptTokens: 0, // Ollama doesn't provide token counts
          completionTokens: 0,
          totalTokens: 0
        }
      };
    } catch (error) {
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

  async analyzeBlock(content: string): Promise<AnalysisResult> {
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
    "people": [{"Name": "姓名", "confidence": 0.9, "context": "上下文"}],
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

  private parseAnalysisResponse(content: string, blockId: string, timestamp: string): AnalysisResult {
    let category: '工作' | '个人' | '待确认' = '待确认';
    let entities = {
      people: [] as EntityPreview[],
      projects: [] as EntityPreview[],
      things: [] as EntityPreview[],
      ideas: [] as EntityPreview[],
      knowledge: [] as EntityPreview[]
    };
    let needsConfirmation: string[] = [];
    let response = content;

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const json = JSON.parse(jsonMatch[0]);
        category = ['工作', '个人'].includes(json.category) ? json.category : '待确认';
        entities = {
          people: (json.entities?.people || []).map((e: any) => ({
            name: e.Name || e.name,
            type: 'person' as const,
            confidence: e.confidence || 0.5,
            context: e.context || '',
            isArchived: false,
            newEntity: true
          })),
          projects: (json.entities?.projects || []).map((e: any) => ({
            name: e.Name || e.name,
            type: 'project' as const,
            confidence: e.confidence || 0.5,
            context: e.context || '',
            isArchived: false,
            newEntity: true
          })),
          things: (json.entities?.things || []).map((e: any) => ({
            name: e.Name || e.name,
            type: 'thing' as const,
            confidence: e.confidence || 0.5,
            context: e.context || '',
            isArchived: false,
            newEntity: true
          })),
          ideas: (json.entities?.ideas || []).map((e: any) => ({
            name: e.Name || e.name,
            type: 'idea' as const,
            confidence: e.confidence || 0.5,
            context: e.context || '',
            isArchived: false,
            newEntity: true
          })),
          knowledge: (json.entities?.knowledge || []).map((e: any) => ({
            name: e.Name || e.name,
            type: 'knowledge' as const,
            confidence: e.confidence || 0.5,
            context: e.context || '',
            isArchived: false,
            newEntity: true
          }))
        };
        needsConfirmation = json.needsConfirmation || [];
        response = json.response || content;
      }
    } catch (error) {
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

  isReady(): boolean {
    return true;
  }

  private generateId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}
