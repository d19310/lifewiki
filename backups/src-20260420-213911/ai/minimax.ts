/**
 * MiniMax Provider
 * LLM Provider implementation for MiniMax API
 */

import { requestUrl } from 'obsidian';
import { ChatMessage, ChatResponse, AnalysisResult, EntityPreview } from '../entities/types';

export interface MiniMaxConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeout?: number;
}

interface MiniMaxRequest {
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  max_tokens?: number;
}

interface MiniMaxResponse {
  id: string;
  choices: {
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: {
    message: string;
    type: string;
    code: string;
  };
}

const DEFAULT_MODEL = 'MiniMax-M2.7';
const DEFAULT_BASE_URL = 'https://api.minimaxi.com/v1';
const DEFAULT_TIMEOUT = 30000;

export class MiniMaxProvider {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private timeout: number;

  constructor(config: MiniMaxConfig) {
    if (!config.apiKey) {
      throw new Error('API key is required for MiniMax');
    }
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    this.model = config.model || DEFAULT_MODEL;
    this.timeout = config.timeout || DEFAULT_TIMEOUT;
  }

  async chat(messages: ChatMessage[]): Promise<ChatResponse> {
    const url = `${this.baseUrl}/chat/completions`;

    const request: MiniMaxRequest = {
      model: this.model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      temperature: 0.7,
      max_tokens: 2048
    };

    try {
      // Use Obsidian's requestUrl to bypass CORS
      const response = await requestUrl({
        url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
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

      const data: MiniMaxResponse = response.json;

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

    const systemPrompt = `你是一个日记分析助手，专门帮助用户从日常日记中识别和归档实体。

## 你的任务
分析用户输入的日记内容，识别人脉（人）、项目/任务（事）、物品（物）、想法（想法）、知识（知识）。

## 对话规则
1. 每次只分析和确认一个大类的实体，按顺序：人脉 → 项目/任务 → 物品 → 想法 → 知识
2. 用 **加粗** 格式标注实体名称
3. 回复简洁自然，不超过 100 字
4. **不要输出任何 [ENTITY_DATA:...] 标记**，这会由后续流程处理

## 识别未归档实体（不认识）
当发现未在已归档实体中找到的名称时，询问确认类型：
> 你提到的 **张三**、**李四** 我不认识，请问他们是你的同事还是客户？

## 识别已归档实体（认识）
当在已归档实体中找到匹配时，更新互动记录：
> **王五** 我认识，他是青岛移动B300项目的对接人。更新了和他的互动记录，关于他还有什么需要补充的吗？

## 确认归档
用户确认类型后：
> 好的，已完成 **张三**、**李四** 的人脉归档。还有信息需要补充吗？

## 开始分析
请分析以下日记内容，先识别人脉实体（只问人脉，不要问其他类别）：

日记内容：
${content}`;

    const response = await this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: content }
    ]);

    return this.parseAnalysisResponse(response.content, blockId, timestamp);
  }

  private parseAnalysisResponse(content: string, blockId: string, timestamp: string): AnalysisResult {
    // Simply remove ENTITY_DATA block and use the text for display
    // Entity extraction is handled by conversation flow via [ENTITY:], [ARCHIVE:] markers
    let response = content
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<THINKING>[\s\S]*?<\/THINKING>/gi, '')
      .replace(/<思考>[\s\S]*?<\/思考>/gi, '')
      .replace(/<note>[\s\S]*?<\/note>/gi, '')
      .replace(/<备注>[\s\S]*?<\/备注>/gi, '')
      // Remove ENTITY_DATA block using regex - everything from [ENTITY_DATA: to the closing ]
      .replace(/\[ENTITY_DATA:\[[\s\S]*?\]/gi, '')
      .replace(/\[ENTITY_DATA:\{[\s\S]*?\}/gi, '')
      .trim();

    return {
      blockId,
      timestamp,
      category: '待确认',
      areas: [],
      entities: {
        people: [],
        projects: [],
        things: [],
        ideas: [],
        knowledge: []
      },
      needsConfirmation: [],
      aiResponse: response
    };
  }

  private parseAreas(areas: unknown): string[] {
    const validAreas = ['工作', '个人', '学习', '其他'];
    if (!Array.isArray(areas)) return [];
    return areas
      .filter((a): a is string => typeof a === 'string' && validAreas.includes(a))
      .slice(0, 2);
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
