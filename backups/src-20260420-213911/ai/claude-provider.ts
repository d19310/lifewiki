/**
 * Claude Provider
 * LLM Provider implementation for Anthropic Claude API
 */

import { requestUrl } from 'obsidian';
import { ChatMessage, ChatResponse, AnalysisResult, EntityPreview } from '../entities/types';

export interface ClaudeConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  version?: string;
  timeout?: number;
}

interface ClaudeRequest {
  model: string;
  messages: { role: string; content: string }[];
  max_tokens: number;
}

interface ClaudeResponse {
  id: string;
  type: string;
  role: string;
  content: {
    type: string;
    text: string;
  }[];
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  error?: {
    type: string;
    message: string;
  };
}

const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';
const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const DEFAULT_VERSION = '2023-06-01';
const DEFAULT_TIMEOUT = 30000;

export class ClaudeProvider {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private version: string;
  private timeout: number;

  constructor(config: ClaudeConfig) {
    if (!config.apiKey) {
      throw new Error('API key is required for Claude');
    }
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    this.model = config.model || DEFAULT_MODEL;
    this.version = config.version || DEFAULT_VERSION;
    this.timeout = config.timeout || DEFAULT_TIMEOUT;
  }

  async chat(messages: ChatMessage[]): Promise<ChatResponse> {
    const url = `${this.baseUrl}/v1/messages`;

    // Convert messages to Anthropic format
    const claudeMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      }));

    // Add system prompt as a user message if present
    const systemMessage = messages.find(m => m.role === 'system');
    if (systemMessage) {
      claudeMessages.unshift({
        role: 'user',
        content: `[System Prompt] ${systemMessage.content}`
      });
    }

    const request: ClaudeRequest = {
      model: this.model,
      messages: claudeMessages as { role: string; content: string }[],
      max_tokens: 1024
    };

    try {
      // Use Obsidian's requestUrl to bypass CORS
      const response = await requestUrl({
        url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': this.version
        },
        body: JSON.stringify(request),
        timeout: this.timeout
      });

      if (response.status < 200 || response.status >= 300) {
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorData = response.json;
          errorMessage = errorData?.error?.message || errorMessage;
        } catch {}
        throw new Error(errorMessage);
      }

      const data: ClaudeResponse = response.json;

      if (data.error) {
        throw new Error(data.error.message);
      }

      const content = data.content?.[0]?.text || '';

      return {
        content,
        usage: {
          promptTokens: data.usage?.input_tokens || 0,
          completionTokens: data.usage?.output_tokens || 0,
          totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
        }
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Unknown error occurred');
    }
  }

  async analyzeBlock(content: string): Promise<AnalysisResult> {
    const blockId = this.generateId();
    const timestamp = new Date().toISOString();

    const systemPrompt = `你是一个日记分析助手。请分析以下日记内容，识别人脉、项目、物品、想法和知识，并判断日记所属领域。

日记内容：
${content}

可用领域（可多选，最多2个）：工作、个人、学习、其他

请以JSON格式返回分析结果，包含：
- category: 工作/个人
- areas: 领域数组，最多2个，如["工作"]或["工作","学习"]
- entities: 识别的实体（人脉/项目/物品/想法/知识）
- needsConfirmation: 需要用户确认的实体名称数组
- response: 对用户的简短回复（100字以内）

JSON格式：
{
  "category": "工作",
  "areas": ["工作"],
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

  private parseAreas(areas: unknown): string[] {
    const validAreas = ['工作', '个人', '学习', '其他'];
    if (!Array.isArray(areas)) return [];
    return areas
      .filter((a): a is string => typeof a === 'string' && validAreas.includes(a))
      .slice(0, 2);
  }

  private parseAnalysisResponse(content: string, blockId: string, timestamp: string): AnalysisResult {
    let category: '工作' | '个人' | '待确认' = '待确认';
    let areas: string[] = [];
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
        areas = this.parseAreas(json.areas);
        entities = {
          people: (json.entities?.people || []).map((e: any) => ({
            name: e.name,
            type: 'person' as const,
            confidence: e.confidence || 0.5,
            context: e.context || '',
            isArchived: false,
            newEntity: true
          })),
          projects: (json.entities?.projects || []).map((e: any) => ({
            name: e.name,
            type: 'project' as const,
            confidence: e.confidence || 0.5,
            context: e.context || '',
            isArchived: false,
            newEntity: true
          })),
          things: (json.entities?.things || []).map((e: any) => ({
            name: e.name,
            type: 'thing' as const,
            confidence: e.confidence || 0.5,
            context: e.context || '',
            isArchived: false,
            newEntity: true
          })),
          ideas: (json.entities?.ideas || []).map((e: any) => ({
            name: e.name,
            type: 'idea' as const,
            confidence: e.confidence || 0.5,
            context: e.context || '',
            isArchived: false,
            newEntity: true
          })),
          knowledge: (json.entities?.knowledge || []).map((e: any) => ({
            name: e.name,
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
      areas,
      entities,
      needsConfirmation,
      aiResponse: response
    };
  }

  isReady(): boolean {
    return !!this.apiKey;
  }

  private generateId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}
