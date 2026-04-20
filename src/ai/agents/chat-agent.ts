/**
 * Chat Agent
 * Uses LangGraph agent for complex multi-step conversations
 */

import type { Agent, AgentContext, AgentResult } from './interfaces';
import type { EntityManager } from '../../entities/manager';
import type { App } from 'obsidian';
import type { AgentRegistry } from './agent-registry';

export class ChatAgent implements Agent {
	readonly id = 'chat';
	readonly name = 'Chat Agent';

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

		// Create LangGraphAgent with agentId='chat' to load chat-specific config
		this.langGraphAgent = createLangGraphAgent(
			provider,
			this.entityManager,
			this.app,
			'',  // systemPrompt is loaded from config
			this.id  // Use chat-specific config from .lifewiki/agents/chat/
		);

		await this.langGraphAgent.initialize();
		this.initialized = true;
	}

	/**
	 * Start a new chat session
	 */
	async start(ctx: AgentContext): Promise<AgentResult> {
		return this.continue(ctx, '');
	}

	/**
	 * Continue an existing chat session
	 * Uses LangGraph agent with tool support
	 */
	async continue(ctx: AgentContext, message: string): Promise<AgentResult> {
		if (!this.langGraphAgent) {
			await this.initialize();
		}

		try {
			// Use continueAnalysis which properly uses BlockAnalysisMachine with tools
			const result = await this.langGraphAgent.continueAnalysis('chat:global', message);

			// Extract AI response
			const responseText = result.aiResponse || '';

			// Strip thinking tags from response
			const cleanContent = responseText
				.replace(/<think>[\s\S]*?<\/think>/gi, '')
				.replace(/<think>[\s\S]*?/gi, '')
				.trim();

			return {
				response: cleanContent,
				error: result.error
			};
		} catch (e) {
			return {
				response: '',
				error: (e as Error).message
			};
		}
	}
}
