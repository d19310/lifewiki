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
import {
	runDetectionStep,
	runProcessingStep,
	executeConfirmedOperations,
	parseUserConfirmation,
	applyConfirmation,
	createInitialWorkflowState,
	workflowStateToSession,
	continueAnalysisWorkflow,
	type WorkflowState
} from './workflow-runner';
import { runAnalysisWorkflow } from './analysis-workflow';
import type { ConfirmedEntity } from './types';
import { loadAgentConfig, AgentConfig, DEFAULT_CHAT_PROMPT } from '../agent-config';
import { CaptureAnalyzer } from '../capture-analyzer';
import { MemoryIndexStore } from '../../memory';

// Feature flag to switch between old and new workflow
const USE_NEW_WORKFLOW = true;
const USE_CAPTURE_ANALYZER = true;

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
	workflowState?: WorkflowState;  // Stores state for new workflow
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
	private captureAnalyzer: CaptureAnalyzer;
	private memoryIndexStore: MemoryIndexStore;

	constructor(config: LangGraphAgentConfig) {
		this.provider = config.provider;
		this.entityManager = config.entityManager;
		this.app = config.app;
		this.agentId = config.agentId || 'diary';
		this.captureAnalyzer = new CaptureAnalyzer(config.provider, config.entityManager);
		this.memoryIndexStore = new MemoryIndexStore(config.app);
	}

	/**
	 * Initialize the agent
	 */
	async initialize(): Promise<void> {
		await this.entityManager.ensureInitialized();
		// Load agent config from vault based on agentId
		this.agentConfig = await loadAgentConfig(this.app, this.agentId);
	}

	isConfigLoaded(): boolean {
		return this.agentConfig !== null;
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

		// Special prompt for chat mode (chat:global) - use agent config for泛化能力
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

		// For analysis mode (diary blocks): use optimized fallback prompt
		// This is more stable and faster than loading full agent config
		return this.buildAnalysisPrompt(blockId, content, existingEntities, childBlockContext);
	}

	/**
	 * Build optimized analysis prompt (no function calling, direct output)
	 */
	private buildAnalysisPrompt(
		blockId: string,
		content: string,
		existingEntities: { name: string; type: string }[],
		childBlockContext: string
	): string {
		const existingEntitiesStr = existingEntities.length > 0
			? existingEntities.map(e => `- ${e.name} (${e.type})`).join('\n')
			: '无';

		return `# 日记分析助手

## 对话风格
像朋友聊天一样自然，简洁。

## 分析流程

**第一步**：问用户确认实体类型
- "曹晓东是？"

**第二步**：用户确认后，调用 create_entity 创建实体
- 用户说"客户" → 调用 create_entity(name="曹晓东", entityType="person", summary="客户")

**第三步**：问下一个实体
- "华为项目呢？"

**第四步**：用户确认后，调用 create_entity
- 用户说"新项目" → 调用 create_entity(name="华为项目", entityType="project")

**第五步**：问关系
- "张三和华为项目什么关系？"
- 用户确认后，调用 link_entities

**第六步**：总结
- "好的，都记下了。#工作"

## 已知实体
${existingEntitiesStr}

## 日记内容
${content}
${childBlockContext}

## 重要规则
1. 用户确认实体类型后，立即调用 create_entity，不要继续问问题
2. 用户确认关系后，立即调用 link_entities
3. 像朋友聊天一样简洁
4. 回复30字以内
5. 每次只调用一个工具

## 示例

日记："和张三，李四开会讨论华为项目"

AI：曹晓东是哪位？#工作

用户：客户

AI：（调用 create_entity 创建曹晓东、客户）好的，华为项目呢？

用户：也是新项目

AI：（调用 create_entity 创建华为项目）张三，李四也参与这个项目吗？

用户：是成员

AI：（调用 link_entities 建立关系）好的，都记下了。#工作`;
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
		console.log('[Agent] startBlockAnalysis called, USE_NEW_WORKFLOW:', USE_NEW_WORKFLOW);

		if (USE_CAPTURE_ANALYZER && blockId !== 'chat:global') {
			return this.startBlockAnalysisWithCaptureAnalyzer(blockId, content, parentId, siblingBlocks);
		}

		if (USE_NEW_WORKFLOW) {
			console.log('[Agent] Taking NEW workflow path');
			return this.startBlockAnalysisWithWorkflow(blockId, content);
		}

		console.log('[Agent] Taking LEGACY workflow path');
		// Fallback to old implementation
		return this.startBlockAnalysisLegacy(blockId, content, parentId, siblingBlocks);
	}

	/**
	 * LifeWiki 2.0 capture analysis.
	 *
	 * This path is intentionally lightweight: one structured LLM extraction,
	 * automatic low-risk memory writes, and no entity-confirmation loop.
	 */
	private async startBlockAnalysisWithCaptureAnalyzer(
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
			const result = await this.captureAnalyzer.analyzeBlock({
				blockId,
				content,
				parentId,
				siblingBlocks
			});

			await this.memoryIndexStore.appendBlockAnalysis(result.memoryAnalysis);

			const now = new Date().toISOString();
			const session: BlockSession = {
				blockId,
				content,
				messages: [
					{ role: 'user', content },
					{ role: 'assistant', content: result.memoryAnalysis.memoryEcho }
				],
				analysisResult: result.analysisResult,
				memoryAnalysis: result.memoryAnalysis,
				createdAt: now,
				updatedAt: now,
				currentPhase: AnalysisPhase.Complete
			};

			return {
				session,
				initialResponse: result.memoryAnalysis.memoryEcho,
				areas: result.analysisResult.areas
			};
		} catch (error) {
			const message = `Capture analysis failed: ${(error as Error).message}`;
			return {
				session: {
					blockId,
					content,
					messages: [
						{ role: 'user', content },
						{ role: 'assistant', content: `分析失败：${(error as Error).message}` }
					],
					analysisResult: null,
					memoryAnalysis: null,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					currentPhase: AnalysisPhase.Detection
				},
				initialResponse: message,
				error: message
			};
		}
	}

	/**
	 * New Agent-based analysis (uses force tool calling)
	 */
	private async startBlockAnalysisWithWorkflow(
		blockId: string,
		content: string
	): Promise<{
		session: BlockSession;
		initialResponse?: string;
		areas?: string[];
		error?: string;
	}> {
		console.log('[Agent] Using Agent-based workflow with forced tool calling');
		try {
			// Create LLM adapter and tools
			const llm = new AIProviderAdapter(this.provider);
			const tools = new EntityTools(this.entityManager, blockId, this.app, this.provider);

			// Run the 5-step analysis workflow
			const result = await runAnalysisWorkflow(
				blockId,
				content,
				llm,
				tools
			);

			if (!result.success) {
				return {
					session: result.session,
					error: result.error
				};
			}

			// Store state for potential continuation
			const machine = await this.createMachine(blockId, content);
			this.machines.set(blockId, {
				machine,
				blockId,
				content,
				workflowState: result.session as any
			});

			return {
				session: result.session,
				initialResponse: result.session.aiResponse || undefined,
				areas: result.session.areas || []
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
					currentPhase: AnalysisPhase.Detection
				},
				error: `Agent workflow failed: ${(error as Error).message}`
			};
		}
	}

	/**
	 * Legacy analysis (uses prompt-based state machine)
	 */
	private async startBlockAnalysisLegacy(
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
					currentPhase: AnalysisPhase.Detection
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
		if (blockId === 'chat:global') {
			return this.continueAnalysisLegacy(blockId, userMessage);
		}

		// Use new workflow if enabled
		if (USE_NEW_WORKFLOW) {
			return this.continueAnalysisWithWorkflow(blockId, userMessage);
		}

		// Fallback to legacy implementation
		return this.continueAnalysisLegacy(blockId, userMessage);
	}

	/**
	 * Continue analysis using new workflow
	 */
	private async continueAnalysisWithWorkflow(blockId: string, userMessage: string): Promise<{
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
		const instance = this.machines.get(blockId);

		if (!instance) {
			return {
				session: {
					blockId,
					content: '',
					messages: [],
					analysisResult: null,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					currentPhase: AnalysisPhase.Detection
				},
				userMessage,
				error: 'No analysis session found for this block'
			};
		}

		try {
			// Get machine state - use workflowState if available (new workflow)
			const state = instance.workflowState;

			if (!state) {
				return {
					session: {
						blockId,
						content: '',
						messages: [],
						analysisResult: null,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						currentPhase: AnalysisPhase.Detection
					},
					userMessage,
					error: 'No workflow state found for this block'
				};
			}

			// Create LLM adapter and tools
			const llm = new AIProviderAdapter(this.provider);
			const tools = new EntityTools(this.entityManager, blockId, this.app, this.provider);

			// Import the new processUserConfirmation dynamically to avoid circular deps
			const { processUserConfirmation } = await import('./analysis-workflow');

			// Process user confirmation
			const result = await processUserConfirmation(
				state as any,
				userMessage,
				llm,
				tools
			);

			// Update stored workflow state
			instance.workflowState = result.session;

			// Check if we need more confirmation
			if (result.needsMoreConfirmation) {
				return {
					session: result.session,
					userMessage,
					aiResponse: result.session.messages?.[result.session.messages.length - 1]?.content
				};
			}

			// Build entity discovery info from detection result
			const entityDiscovery = state.detectionResult?.newEntities?.map((e: any) => ({
				name: e.name,
				inferredType: e.inferredType || 'person',
				reason: e.reason || ''
			})) || [];

			return {
				session: result.session,
				userMessage,
				aiResponse: result.session.aiResponse,
				areas: result.session.areas,
				entityDiscovery,
				relations: result.session.relations
			};
		} catch (error) {
			return {
				session: {
					blockId,
					content: '',
					messages: [],
					analysisResult: null,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					currentPhase: AnalysisPhase.Detection
				},
				userMessage,
				error: `Continue analysis failed: ${(error as Error).message}`
			};
		}
	}

	/**
	 * Legacy continue analysis (prompt-based)
	 */
	private async continueAnalysisLegacy(blockId: string, userMessage: string): Promise<{
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
					currentPhase: AnalysisPhase.Detection
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
