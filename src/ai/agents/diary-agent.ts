/**
 * Diary Agent
 * Wraps existing LangGraphAgent to implement the new Agent interface
 */

import type { Agent, AgentContext, AgentResult } from './interfaces';
import type { EntityManager } from '../../entities/manager';
import type { App } from 'obsidian';
import type { AgentRegistry } from './agent-registry';

export class DiaryAgent implements Agent {
	readonly id = 'diary';
	readonly name = 'Diary Analysis Agent';

	private langGraphAgent: any = null;
	private agentRegistry: AgentRegistry;
	private entityManager: EntityManager;
	private app: App;
	private initialized: boolean = false;

	constructor(agentRegistry: AgentRegistry, entityManager: EntityManager, app: App) {
		this.agentRegistry = agentRegistry;
		this.entityManager = entityManager;
		this.app = app;
	}

	/**
	 * Initialize the agent - creates the underlying LangGraphAgent
	 */
	async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}

		// Get provider from AgentRegistry based on agent-provider mapping
		const provider = this.agentRegistry.getAgentProvider(this.id);
		if (!provider) {
			throw new Error(`No provider found for agent ${this.id}`);
		}

		// Import dynamically to avoid circular dependencies
		const { createLangGraphAgent } = await import('../langgraph/agent');

		this.langGraphAgent = createLangGraphAgent(
			provider,
			this.entityManager,
			this.app,
			this.id  // agentId for loading agent-specific config
		);

		await this.langGraphAgent.initialize();
		this.initialized = true;
	}

	/**
	 * Start a new analysis session
	 */
	async start(ctx: AgentContext): Promise<AgentResult> {
		if (!this.langGraphAgent) {
			await this.initialize();
		}

		const result = await this.langGraphAgent.startBlockAnalysis(
			ctx.blockId,
			ctx.content || '',
			ctx.parentId || null,
			ctx.siblingBlocks || []
		);

		return {
			response: result.initialResponse || '',
			session: result.session,
			error: result.error
		};
	}

	/**
	 * Continue an existing session
	 */
	async continue(ctx: AgentContext, message: string): Promise<AgentResult> {
		if (!this.langGraphAgent) {
			await this.initialize();
		}

		const result = await this.langGraphAgent.continueAnalysis(ctx.blockId, message);

		return {
			response: result.aiResponse || '',
			session: result.session,
			error: result.error
		};
	}
}
