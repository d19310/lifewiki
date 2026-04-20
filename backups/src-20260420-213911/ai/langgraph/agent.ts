/**
 * LangGraph Agent (Simplified)
 * High-level agent interface compatible with ConversationFlow
 *
 * Uses a lightweight state machine instead of full LangGraph
 * for better browser/Obsidian compatibility
 */

import type { App } from 'obsidian';
import type { AIProvider } from '../provider';
import type { EntityManager } from '../../entities/manager';
import { BlockSession, ChatMessage, AnalysisPhase } from '../../entities/types';
import { AIProviderAdapter } from './adapter';
import { EntityTools } from './tools/entity-tools';
import { BlockAnalysisMachine, createInitialState } from './graph';
import type { ConfirmedEntity } from './types';
import { loadAgentConfig, AgentConfig, DEFAULT_CHAT_PROMPT } from '../agent-config';

export interface LangGraphAgentConfig {
	provider: AIProvider;
	entityManager: EntityManager;
	app: App;
	agentId?: string;  // 'diary' or 'chat', defaults to 'diary'
}

interface MachineInstance {
	machine: BlockAnalysisMachine;
	blockId: string;
	content: string;
}

/**
 * LangGraph Agent for entity analysis
 * Provides an interface compatible with ConversationFlow
 */
export class LangGraphAgent {
	private provider: AIProvider;
	private entityManager: EntityManager;
	private app: App;
	private agentId: string;
	private machines: Map<string, MachineInstance> = new Map();
	private agentConfig: AgentConfig | null = null;

	constructor(config: LangGraphAgentConfig) {
		this.provider = config.provider;
		this.entityManager = config.entityManager;
		this.app = config.app;
		this.agentId = config.agentId || 'diary';
	}

	/**
	 * Initialize the agent
	 */
	async initialize(): Promise<void> {
		await this.entityManager.ensureInitialized();
		// Load agent config from vault based on agentId
		this.agentConfig = await loadAgentConfig(this.app, this.agentId);
	}

	/**
	 * Build system prompt from agent config
	 */
	private buildSystemPrompt(
		blockId: string,
		content: string,
		existingEntities: { name: string; type: string }[] = [],
		parentId: string | null = null,
		siblingBlocks: { id: string; content: string }[] = []
	): string {
		const date = new Date().toISOString().split('T')[0];

		// Format existing entities for the prompt
		const existingEntitiesStr = existingEntities.length > 0
			? existingEntities.map(e => `- ${e.name} (${e.type})`).join('\n')
			: '无';

		// Build child block context if applicable
		const childBlockContext = parentId
			? `\n## 子块上下文\n这是父block的子block。父block ID: ${parentId}\n其他子block内容：\n${siblingBlocks.map(b => `- ${b.content}`).join('\n')}\n`
			: '';

		// Special prompt for chat mode (chat:global)
		if (blockId === 'chat:global') {
			// Use loaded chat config with skills for tool calling
			const chatPrompt = this.agentConfig?.chatPrompt || DEFAULT_CHAT_PROMPT;
			const skills = this.agentConfig?.skills || '';
			return `${chatPrompt}

${skills}

---

## 已知实体
${existingEntitiesStr}

## 当前日期
${date}`;
		}

		// Use agent config or fallback to simple prompt (for analysis mode)
		if (this.agentConfig) {
			return `${this.agentConfig.identity}

${this.agentConfig.soul}

${this.agentConfig.skills}

${this.agentConfig.wiki}

---

## 当前会话上下文

日期: ${date}
${childBlockContext}
## 已知实体（在vault中已归档）
先用 list_entities 技能检查以下实体是否在日记中被提及：
${existingEntitiesStr}

## 日记内容
${content}

## 重要：函数调用格式

当需要执行技能时，必须使用以下XML格式，不要使用markdown代码块：

正确格式：
<function_calls><invoke name="list_entities"><parameter name="entityType">person</parameter></invoke></function_calls>

错误格式（不要使用）：
\`\`\`
list_entities: {"entityType": "person"}
\`\`\`

## 关键规则：发现已归档实体时必须立即更新

当调用 search_entity 返回 {"found": true} 时，意味着该实体已在vault中归档。
你必须**立即**调用 add_interaction 来更新该实体的互动记录，格式如下：

<function_calls><invoke name="search_entity"><parameter name="name">人名</parameter></invoke></function_calls>
<function_calls><invoke name="add_interaction"><parameter name="entityId">实体的id</parameter><parameter name="content">在日记中讨论了相关内容</parameter></invoke></function_calls>

不要等用户确认！发现已归档实体后立即更新互动记录。

## 关键提醒

**不要输出分析过程！** 只输出最终的自然对话回复，像朋友聊天一样。

**回复格式：**
直接用1-2句话自然地回应日记内容，在回复末尾加上 #工作 或 #个人 等标签。不要提及任何分析阶段、函数调用结果。

**示例：**

日记："今天和张三开会讨论项目"
✅ 正确：好的，项目进展已记录。#工作

❌ 错误：阶段1人脉：已调用xxx... 阶段2项目：...`;
		}

		// Fallback simple prompt
		return `你是一个日记分析助手。

## 日记内容
${content}

## 已知实体
${existingEntitiesStr}

请连续执行所有分析阶段，完成后在回复末尾包含 #工作 或 #个人 等标签格式。`;
	}

	/**
	 * Create a new machine for a block
	 */
	private async createMachine(
		blockId: string,
		content: string,
		parentId: string | null = null,
		siblingBlocks: { id: string; content: string }[] = []
	): Promise<BlockAnalysisMachine> {
		// Check if this is chat mode
		const isChatMode = blockId === 'chat:global';

		// Get existing entities for context
		let existingEntities: { name: string; type: string }[] = [];
		try {
			const [people, projects, things, ideas, knowledge] = await Promise.all([
				this.entityManager.getEntitiesByType('person'),
				this.entityManager.getEntitiesByType('project'),
				this.entityManager.getEntitiesByType('thing'),
				this.entityManager.getEntitiesByType('idea'),
				this.entityManager.getEntitiesByType('knowledge')
			]);
			existingEntities = [
				...people.map(e => ({ name: e.title, type: '人脉' })),
				...projects.map(e => ({ name: e.title, type: '项目' })),
				...things.map(e => ({ name: e.title, type: '物品' })),
				...ideas.map(e => ({ name: e.title, type: '想法' })),
				...knowledge.map(e => ({ name: e.title, type: '知识' }))
			];
		} catch (e) {
			console.log('[LangGraphAgent] Failed to get existing entities:', e);
		}

		const systemPrompt = this.buildSystemPrompt(blockId, content, existingEntities, parentId, siblingBlocks);
		const llm = new AIProviderAdapter(this.provider);
		const tools = new EntityTools(this.entityManager, blockId, this.app);
		return new BlockAnalysisMachine(
			createInitialState(blockId, content),
			llm,
			tools,
			systemPrompt,
			undefined,
			isChatMode
		);
	}

	/**
	 * Start analysis for a new block
	 */
	async startBlockAnalysis(
		blockId: string,
		content: string,
		parentId: string | null = null,
		siblingBlocks: { id: string; content: string }[] = []
	): Promise<{
		session: BlockSession;
		initialResponse?: string;
		areas?: string[];
		error?: string;
	}> {
		try {
			// Create machine for this block
			const machine = await this.createMachine(blockId, content, parentId, siblingBlocks);
			this.machines.set(blockId, { machine, blockId, content });

			// Run the machine until we get a response
			const state = await machine.runCycle();

			// Build session from state
			const session = this.buildSession(blockId, state);

			// Parse areas from AI response
			const areas = this.parseAreasFromResponse(state.aiResponse || '');

			return {
				session,
				initialResponse: state.aiResponse || undefined,
				areas
			};
		} catch (error) {
			return {
				session: {
					blockId,
					content,
					messages: [],
					analysisResult: null,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					currentPhase: AnalysisPhase.People
				},
				error: `Analysis failed: ${(error as Error).message}`
			};
		}
	}

	/**
	 * Parse areas from AI response
	 * Supports #tag format (e.g., "#工作 #个人")
	 */
	private parseAreasFromResponse(response: string): string[] {
		const tagMatches = response.match(/#([^\s,，,]+)/g);
		if (tagMatches) {
			const tags = tagMatches.map(t => t.substring(1));
			return this.parseAreas(tags);
		}
		return [];
	}

	/**
	 * Parse and validate areas
	 */
	private parseAreas(areas: unknown): string[] {
		const validAreas = ['工作', '个人', '学习', '其他'];
		if (!Array.isArray(areas)) return [];
		return areas
			.filter((a): a is string => typeof a === 'string' && validAreas.includes(a))
			.slice(0, 2);
	}

		/**
	 * Continue analysis with user input
	 */
	async continueAnalysis(blockId: string, userMessage: string): Promise<{
		session: BlockSession;
		userMessage: string;
		aiResponse?: string;
		areas?: string[];
		entityDiscovery?: Array<{
			name: string;
			inferredType: 'person' | 'project' | 'thing' | 'idea' | 'knowledge';
			reason: string;
		}>;
		archivedEntities?: ConfirmedEntity[];
		updateEntities?: Array<{
			entityId: string;
			name: string;
			updates: Array<{ field: string; value: string }>;
		}>;
		relations?: Array<{ from: string; to: string; relation: string }>;
		error?: string;
	}> {
		let instance = this.machines.get(blockId);

		if (!instance) {
			// Create new machine if doesn't exist
			const machine = await this.createMachine(blockId, '');
			instance = {
				machine,
				blockId,
				content: ''
			};
			this.machines.set(blockId, instance);
		}

		try {
			// Send user message and run cycle
			const state = await instance.machine.sendUserMessage(userMessage);

			// Build response
			const response: {
				session: BlockSession;
				userMessage: string;
				aiResponse?: string;
				entityDiscovery?: Array<{ name: string; inferredType: 'person' | 'project' | 'thing' | 'idea' | 'knowledge'; reason: string }>;
				archivedEntities?: ConfirmedEntity[];
				updateEntities?: Array<{ entityId: string; name: string; updates: Array<{ field: string; value: string }> }>;
				relations?: Array<{ from: string; to: string; relation: string }>;
			} = {
				session: this.buildSession(blockId, state),
				userMessage
			};

			if (state.aiResponse) {
				response.aiResponse = state.aiResponse;
				// Parse areas from AI response
				const areas = this.parseAreasFromResponse(state.aiResponse);
				if (areas.length > 0) {
					response.areas = areas;
				}
			}

			if (state.pendingConfirmations?.length > 0) {
				response.entityDiscovery = state.pendingConfirmations.map((e: any) => ({
					name: e.name,
					inferredType: e.inferredType,
					reason: e.context
				}));
			}

			if (state.confirmedEntities?.length > 0) {
				response.archivedEntities = state.confirmedEntities;
			}

			if (state.updateEntities?.length > 0) {
				response.updateEntities = state.updateEntities;
			}

			if (state.relations?.length > 0) {
				response.relations = state.relations;
			}

			return response;
		} catch (error) {
			return {
				session: {
					blockId,
					content: '',
					messages: [],
					analysisResult: null,
					createdAt: '',
					updatedAt: '',
					currentPhase: AnalysisPhase.People
				},
				userMessage,
				error: `Continue analysis failed: ${(error as Error).message}`
			};
		}
	}

	/**
	 * Build BlockSession from state
	 */
	private buildSession(blockId: string, state: any): BlockSession {
		return {
			blockId,
			content: state.blockContent,
			messages: state.messages.map((m: any) => ({
				role: m._getType?.() === 'ai' ? 'assistant' : m._getType?.() === 'human' ? 'user' : 'system',
				content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
			})) as ChatMessage[],
			analysisResult: null,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			currentPhase: state.currentPhase
		};
	}

	/**
	 * Get session for a block
	 */
	async getSession(blockId: string): Promise<BlockSession | undefined> {
		const instance = this.machines.get(blockId);
		if (!instance) return undefined;

		const state = instance.machine.getState();
		return this.buildSession(blockId, state);
	}

	/**
	 * Advance to next phase
	 */
	async advancePhase(blockId: string): Promise<boolean> {
		const instance = this.machines.get(blockId);
		if (!instance) return false;

		return instance.machine.advancePhase();
	}

	/**
	 * Check if agent is ready
	 */
	isReady(): boolean {
		return this.provider.isReady();
	}

	/**
	 * Delete session for a block
	 */
	deleteSession(blockId: string): void {
		this.machines.delete(blockId);
	}

	/**
	 * Simple chat without analysis machine
	 */
	async simpleChat(message: string, systemPrompt?: string): Promise<{ content: string; error?: string }> {
		const prompt = systemPrompt || '你是一个友好的AI助手。';
		try {
			const response = await this.provider.chat([
				{ role: 'system', content: prompt },
				{ role: 'user', content: message }
			]);
			return { content: response.content || '', error: response.error };
		} catch (e) {
			return { content: '', error: (e as Error).message };
		}
	}
}

/**
 * Create a LangGraph agent from existing components
 */
export function createLangGraphAgent(
	provider: AIProvider,
	entityManager: EntityManager,
	app: App,
	agentId?: string
): LangGraphAgent {
	return new LangGraphAgent({
		provider,
		entityManager,
		app,
		agentId
	});
}
