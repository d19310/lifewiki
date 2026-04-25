/**
 * Workflow Core - 强制工具调用机制
 *
 * 保证AI在每个步骤必须调用工具而不是自己回答
 */

import type { AIProviderAdapter } from './adapter';
import type { EntityTools } from './tools/entity-tools';
import { BaseMessage, AIMessage, HumanMessage } from '@langchain/core/messages';

export interface ToolCallResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface StepContext {
  llm: AIProviderAdapter;
  tools: EntityTools;
  blockId: string;
  blockContent: string;
}

const MAX_TOOL_CALL_RETRIES = 3;

/**
 * 强制AI调用工具的循环
 * @returns 工具调用的结果
 */
export async function forceToolCall(
  context: StepContext,
  messages: BaseMessage[],
  availableTools: any[],
  toolName: string,
  systemPrompt: string
): Promise<{ result: ToolCallResult; messages: BaseMessage[] }> {
  let retries = 0;
  let lastError: string | null = null;

  while (retries < MAX_TOOL_CALL_RETRIES) {
    try {
      // 构建包含系统提示的消息
      const fullMessages = [
        new AIMessage({ content: systemPrompt }),
        ...messages
      ];

      // 尝试获取AI响应（带工具绑定）
      const response = await context.llm.bindTools(availableTools).invoke(fullMessages);

      // 检查是否调用了工具
      if (response.tool_calls && response.tool_calls.length > 0) {
        const toolCall = response.tool_calls[0];

        // 验证调用的是正确的工具
        if (toolCall.name !== toolName) {
          // 调用了错误的工具，给出提示
          messages = [...messages, response];
          messages.push(new AIMessage({
            content: `你必须调用 ${toolName} 工具，而不是 ${toolCall.name}。请重新调用。`
          }));
          retries++;
          continue;
        }

        // 执行工具
        const toolResult = await executeTool(context, toolCall.name, toolCall.args);

        // 将响应和工具结果都加入消息
        messages = [...messages, response];

        return {
          result: toolResult,
          messages
        };
      }

      // AI没有调用工具，注入强制提示
      messages = [...messages, response];
      messages.push(new AIMessage({
        content: `错误：你必须调用 ${toolName} 工具来完成任务。不要自己回答问题，直接调用工具。`
      }));
      retries++;

    } catch (error) {
      lastError = (error as Error).message;
      retries++;
    }
  }

  // 超过最大重试次数
  return {
    result: {
      success: false,
      error: lastError || `AI未能调用 ${toolName} 工具`
    },
    messages
  };
}

/**
 * 执行工具调用
 */
async function executeTool(
  context: StepContext,
  toolName: string,
  args: Record<string, any>
): Promise<ToolCallResult> {
  try {
    switch (toolName) {
      case 'detect_entities':
        return await context.tools.detectEntities({
          diaryContent: args.diaryContent || context.blockContent,
          options: args.options || {}
        });

      case 'confirm_entity_type':
        return {
          success: true,
          data: {
            entityName: args.entityName,
            confirmedType: args.confirmedType
          }
        };

      case 'discover_relation':
        return {
          success: true,
          data: {
            from: args.entity1,
            to: args.entity2,
            relation: args.relation
          }
        };

      case 'check_conflict':
        return {
          success: true,
          data: {
            hasConflict: args.hasConflict || false,
            conflicts: args.conflicts || []
          }
        };

      case 'generate_summary':
        return {
          success: true,
          data: {
            summary: args.summary || '',
            areas: args.areas || []
          }
        };

      default:
        return {
          success: false,
          error: `未知工具: ${toolName}`
        };
    }
  } catch (error) {
    return {
      success: false,
      error: `工具执行失败: ${(error as Error).message}`
    };
  }
}

/**
 * 从工具结果中提取数据
 */
export function extractToolData(result: ToolCallResult): any {
  if (!result.success) {
    throw new Error(result.error);
  }
  return result.data;
}
