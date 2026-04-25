/**
 * Analysis Workflow - 使用强制工具调用的5步分析流程
 *
 * 每个步骤由AI主动调用工具，强制工具执行保证稳定性
 */

import { BaseMessage, AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { AIProviderAdapter } from './adapter';
import type { EntityTools } from './tools/entity-tools';
import type { WorkflowState } from './workflow';
import { AnalysisPhase } from '../../entities/types';
import { getToolSystemPrompt, ANALYSIS_TOOLS } from './tools/analysis-tools';
import { skillsRegistry } from './skills-registry';

/**
 * 直接调用AI并解析JSON响应的简化方法
 */
async function callAIAndParseJSON(
  llm: AIProviderAdapter,
  systemPrompt: string,
  userMessage: string
): Promise<any> {
  const messages = [
    new SystemMessage({ content: systemPrompt }),
    new HumanMessage({ content: userMessage })
  ];

  let content = '';
  try {
    const response = await (llm as any).directChat(messages, []);
    content = response.generations?.[0]?.message?.content || '';
  } catch (e) {
    console.error('[callAIAndParseJSON] directChat error:', e);
    return null;
  }
  console.error('[callAIAndParseJSON] Raw content:', content?.substring(0, 300));

  // 尝试从content中提取JSON
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('[callAIAndParseJSON] JSON parse error:', e);
    }
  }
  console.error('[callAIAndParseJSON] No JSON found in response');
  return null;
}

/**
 * 执行强制工具调用
 */
async function forceToolCall(
  llm: AIProviderAdapter,
  messages: BaseMessage[],
  systemPrompt: string,
  toolName: string
): Promise<{ response: AIMessage; toolCall?: { name: string; args: any }; success: boolean }> {
  // 绑定工具
  const toolDef = ANALYSIS_TOOLS.find(t => t.name === toolName);
  console.log('[forceToolCall] Binding tool:', toolDef?.name);

  const toolPayload = [{
    name: toolDef!.name,
    description: toolDef!.description,
    schema: toolDef!.schema
  }];

  // 只用原始系统提示重试，不累积历史（避免超出MiniMax请求大小限制）
  for (let retries = 0; retries < MAX_TOOL_CALL_RETRIES; retries++) {
    try {
      // 每次重试都只使用原始系统提示，不累积历史
      const allMessages = [
        new SystemMessage({ content: systemPrompt })
      ];

      console.error('[forceToolCall] Retry', retries, '- Invoking LLM with', allMessages.length, 'messages');

      const response = await (llm as any).directChat(allMessages, toolPayload) as AIMessage;

      // ChatResult.generations[0].message 里有 tool_calls
      const aiMessage = response.generations?.[0]?.message;
      const toolCalls = (aiMessage as any)?.tool_calls;
      const hasToolCalls = !!(toolCalls?.length);
      console.error('[forceToolCall] Response received, generations:', response.generations?.length, 'has tool_calls:', hasToolCalls);
      console.error('[forceToolCall] tool_calls type:', typeof toolCalls, 'isArray:', Array.isArray(toolCalls), 'length:', toolCalls?.length);
      console.error('[forceToolCall] tool_calls[0]:', JSON.stringify(toolCalls?.[0]));

      // 检查是否调用了工具
      if (hasToolCalls) {
        const toolCall = toolCalls[0];
        if (!toolCall) {
          console.error('[forceToolCall] toolCalls[0] is undefined!');
          continue;
        }
        console.log('[forceToolCall] Tool called, keys:', Object.keys(toolCall));

        const toolNameCalled = toolCall.name;
        let toolArgs = toolCall.args;
        // args 可能是 string 类型的 JSON，需要解析
        if (typeof toolArgs === 'string') {
          toolArgs = JSON.parse(toolArgs);
        }
        console.log('[forceToolCall] Tool name:', toolNameCalled, 'args:', JSON.stringify(toolArgs));

        if (toolNameCalled === toolName) {
          return {
            response,
            toolCall: {
              name: toolNameCalled,
              args: toolArgs
            },
            success: true
          };
        } else {
          // 调用了错误的工具
          console.log('[forceToolCall] Wrong tool called:', toolNameCalled, '- retrying without history');
          continue;
        }
      }

      // AI没有调用工具
      console.log('[forceToolCall] No tool called, retrying without history...');
      // 不累积历史，直接重试原始消息
    } catch (error) {
      console.error('[forceToolCall] Error:', error);
      if (retries >= MAX_TOOL_CALL_RETRIES - 1) {
        return { response: null as any, success: false };
      }
    }
  }

  return { response: null as any, success: false };
}

/**
 * 执行5步分析流程（简化版：直接AI返回JSON，解析后处理）
 */
export async function runAnalysisWorkflow(
  blockId: string,
  blockContent: string,
  llm: AIProviderAdapter,
  tools: EntityTools
): Promise<{
  success: boolean;
  session: any;
  error?: string;
}> {
  console.log('[AnalysisWorkflow] Starting simplified analysis');

  // 初始化状态
  let state: WorkflowState = createInitialState(blockId, blockContent);
  let messages: BaseMessage[] = [];

  // 获取 entityManager
  const entityManager = (tools as any).entityManager;

  // Step 1: 实体检测 - AI 直接返回 JSON
  console.log('[AnalysisWorkflow] Step 1: Detection');

  // 获取已归档实体名称列表（用于比对）
  let archivedNames: string[] = [];
  try {
    const archivedEntities = await entityManager.getEntitiesByType('person');
    const projectEntities = await entityManager.getEntitiesByType('project');
    archivedNames = [...archivedEntities, ...projectEntities]
      .map((e: any) => e.name)
      .filter(Boolean)
      .slice(0, 50); // 最多50个，避免 prompt 太长
  } catch (e) {
    console.error('[AnalysisWorkflow] Failed to get archived entities:', e);
  }
  const archivedNamesStr = archivedNames.length > 0 ? archivedNames.join(', ') : '无';

  const detectionSystemPrompt = `你是一个实体识别助手。分析日记内容，返回JSON格式的检测结果。

返回格式：
{"archivedMatches": [{"name": "实体名", "entityId": "xxx", "type": "person|project"}], "newEntities": [{"name": "新实体名", "inferredType": "person|project|idea|knowledge"}]}

规则：
- 从diaryContent中识别人名、项目名等实体
- archivedMatches：已在归档实体中找到的（用精确匹配，name完全一致的）
- newEntities：未找到的新实体
- 最多返回5个实体

日记内容：${blockContent}

已有归档实体：${archivedNamesStr}

只返回JSON，不要其他内容。`;

  const detectionResult = await callAIAndParseJSON(llm, detectionSystemPrompt, '请分析日记中的实体。');
  console.log('[AnalysisWorkflow] Detection result:', JSON.stringify(detectionResult)?.substring(0, 300));

  const archivedMatches = detectionResult?.archivedMatches || [];
  const newEntities = detectionResult?.newEntities || [];

  state = updateState(state, AnalysisPhase.Detection, {
    archivedMatches,
    newEntities
  });

  // 如果有新实体，询问用户确认类型
  if (newEntities.length > 0) {
    console.log('[AnalysisWorkflow] Step 2: Confirm entity types');
    for (const entity of newEntities) {
      const confirmedEntities = [
        ...(state.confirmedEntities || []),
        { name: entity.name, type: entity.inferredType || 'person' }
      ];
      state = updateState(state, AnalysisPhase.Processing, { confirmedEntities });
    }
  }

  // Step 3: 关系发现（如果有多个实体）
  const confirmedEntities = state.confirmedEntities || [];
  if (confirmedEntities.length >= 2) {
    console.log('[AnalysisWorkflow] Step 3: Relation Discovery');
    // 简化：直接建立关系
    const relations = [];
    for (let i = 0; i < confirmedEntities.length - 1; i++) {
      relations.push({
        from: confirmedEntities[i].name,
        to: confirmedEntities[i + 1].name,
        relation: '相关'
      });
    }
    state = updateState(state, AnalysisPhase.Relations, { relations });
  }

  // Step 4: 生成总结
  console.log('[AnalysisWorkflow] Step 4: Summary');
  const summary = generateSummary(blockContent, state.confirmedEntities || []);
  const areas = extractAreas(summary);

  state = updateState(state, AnalysisPhase.Summary, { summary, areas });
  state.currentPhase = AnalysisPhase.Complete;

  return {
    success: true,
    session: buildSession(state, messages)
  };
}

/**
 * 等待用户确认（简化版，实际应该由UI处理）
 */
async function waitForUserConfirmation(
  state: WorkflowState,
  prompt: string,
  llm: AIProviderAdapter,
  messages: BaseMessage[]
): Promise<string> {
  // 实际实现中，这里应该暂停流程，等待用户输入
  // 目前简化处理：返回默认类型
  console.log('[AnalysisWorkflow] Waiting for user confirmation:', prompt);

  // 直接返回确认提示，让用户回复
  return 'person';  // 默认类型，等待用户实际回复时更新
}

/**
 * 处理用户确认回复
 */
export async function processUserConfirmation(
  state: WorkflowState,
  userMessage: string,
  llm: AIProviderAdapter,
  tools: EntityTools
): Promise<{
  success: boolean;
  session: any;
  needsMoreConfirmation: boolean;
  error?: string;
}> {
  console.log('[AnalysisWorkflow] Processing user confirmation:', userMessage);
  console.log('[AnalysisWorkflow] Current phase:', state.currentPhase);

  const messages: BaseMessage[] = [...(state.messages || [])];
  messages.push(new HumanMessage({ content: userMessage }));

  // 根据当前阶段处理
  switch (state.currentPhase) {
    case AnalysisPhase.Processing: {
      // 确认实体类型
      const newEntities = state.detectionResult?.newEntities || [];
      const currentIndex = state.confirmedEntities?.length || 0;

      if (currentIndex < newEntities.length) {
        const entity = newEntities[currentIndex];
        const confirmedType = parseTypeFromResponse(userMessage);

        const confirmedEntities = [
          ...(state.confirmedEntities || []),
          { name: entity.name, type: confirmedType }
        ];

        state = updateState(state, AnalysisPhase.Processing, { confirmedEntities });

        // 如果还有更多实体需要确认
        if (currentIndex + 1 < newEntities.length) {
          return {
            success: true,
            session: buildSession(state, messages),
            needsMoreConfirmation: true
          };
        }

        // 检查是否需要问关系
        if (confirmedEntities.length >= 2) {
          // 问关系
          const nextQuestion = `${confirmedEntities[0].name}和${confirmedEntities[1].name}什么关系？（客户/成员/负责人/相关/其他）`;
          messages.push(new AIMessage({ content: nextQuestion }));
          state.currentPhase = AnalysisPhase.Relations;

          return {
            success: true,
            session: buildSession(state, messages),
            needsMoreConfirmation: true
          };
        }

        // 只有1个实体，跳到总结
        state.currentPhase = AnalysisPhase.Summary;
      }
      break;
    }

    case AnalysisPhase.Relations: {
      const relation = parseRelationFromResponse(userMessage);
      const confirmedEntities = state.confirmedEntities || [];

      if (confirmedEntities.length >= 2) {
        const relations = [
          ...(state.relations || []),
          {
            from: confirmedEntities[0].name,
            to: confirmedEntities[1].name,
            relation
          }
        ];
        state = updateState(state, AnalysisPhase.Relations, { relations });
      }

      state.currentPhase = AnalysisPhase.Summary;
      break;
    }

    default:
      break;
  }

  // 生成总结
  if (state.currentPhase === AnalysisPhase.Summary) {
    const summary = generateSummary(state.blockContent, state.confirmedEntities || []);
    const areas = extractAreas(summary);

    state = updateState(state, AnalysisPhase.Summary, { summary, areas });

    messages.push(new AIMessage({ content: summary }));
    state.currentPhase = AnalysisPhase.Complete;

    return {
      success: true,
      session: buildSession(state, messages),
      needsMoreConfirmation: false
    };
  }

  return {
    success: true,
    session: buildSession(state, messages),
    needsMoreConfirmation: false
  };
}

/**
 * 解析用户回复的类型
 */
function parseTypeFromResponse(response: string): string {
  const typeMap: Record<string, string> = {
    '人脉': 'person',
    '项目': 'project',
    '想法': 'idea',
    '知识': 'knowledge',
    '任务': 'task',
    '地点': 'location'
  };

  for (const [key, value] of Object.entries(typeMap)) {
    if (response.includes(key)) {
      return value;
    }
  }

  return 'person';
}

/**
 * 解析用户回复的关系
 */
function parseRelationFromResponse(response: string): string {
  const relationMap: Record<string, string> = {
    '客户': '客户',
    '成员': '成员',
    '负责人': '负责人',
    '相关': '相关',
    '其他': '其他'
  };

  for (const [key, value] of Object.entries(relationMap)) {
    if (response.includes(key)) {
      return value;
    }
  }

  return '相关';
}

/**
 * 生成总结
 */
function generateSummary(content: string, entities: Array<{ name: string; type: string }>): string {
  const parts: string[] = [];

  if (entities.length > 0) {
    const names = entities.map(e => e.name).join('、');
    parts.push(`记录：${names}`);
  }

  const tagMatch = content.match(/#(\w+)/g);
  if (tagMatch) {
    parts.push(tagMatch.join(' '));
  } else {
    parts.push('#工作');
  }

  return parts.join('。') || '已记录。#工作';
}

/**
 * 提取标签
 */
function extractAreas(text: string): string[] {
  const tags = text.match(/#(\w+)/g) || [];
  return tags.map(t => t.substring(1)).slice(0, 2);
}

/**
 * 更新工作流状态
 */
function updateState(state: WorkflowState, phase: AnalysisPhase, data: any): WorkflowState {
  switch (phase) {
    case AnalysisPhase.Detection:
      return {
        ...state,
        currentPhase: phase,
        detectionResult: {
          archivedMatches: data.archivedMatches || [],
          newEntities: data.newEntities || [],
          localFiles: [],
          webLinks: []
        }
      };
    case AnalysisPhase.Processing:
      return {
        ...state,
        currentPhase: phase,
        confirmedEntities: data.confirmedEntities || []
      };
    case AnalysisPhase.Relations:
      return {
        ...state,
        currentPhase: phase,
        relations: data.relations || []
      };
    case AnalysisPhase.Summary:
      return {
        ...state,
        currentPhase: phase,
        aiResponse: data.summary || '',
        areas: data.areas || []
      };
    default:
      return { ...state, currentPhase: phase };
  }
}

/**
 * 构建会话
 */
function buildSession(state: WorkflowState, messages: BaseMessage[]): any {
  return {
    blockId: state.blockId,
    content: state.blockContent,
    messages: messages.map(m => ({
      role: m._getType?.() === 'ai' ? 'assistant' : m._getType?.() === 'human' ? 'user' : 'system',
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
    })),
    currentPhase: state.currentPhase,
    detectionResult: state.detectionResult,
    confirmedEntities: state.confirmedEntities,
    relations: state.relations,
    areas: state.areas,
    aiResponse: state.aiResponse
  };
}

/**
 * 创建初始状态
 */
function createInitialState(blockId: string, blockContent: string): WorkflowState {
  return {
    blockId,
    blockContent,
    messages: [],
    currentPhase: AnalysisPhase.Detection,
    detectionResult: null,
    pendingOperations: null,
    confirmedOperations: { created: [], linked: [], updated: [] },
    confirmedEntities: [],
    relations: [],
    areas: [],
    aiResponse: '',
    error: null,
    awaitingConfirmation: false
  };
}
