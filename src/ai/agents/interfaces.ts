/**
 * Agent Interfaces
 * Defines the contract for AI agents
 */

import type { BlockSession, ChatMessage } from '../../entities/types';

export interface AgentContext {
	blockId: string;
	content?: string;
	parentId?: string | null;
	siblingBlocks?: Array<{ id: string; content: string }>;
}

export interface DiscoveredEntity {
	name: string;
	inferredType: 'person' | 'project' | 'thing' | 'idea' | 'knowledge';
	confidence: number;
	context: string;
}

export interface AgentResult {
	response: string;
	session: BlockSession;
	entities?: DiscoveredEntity[];
	areas?: string[];
	error?: string;
}

export interface AgentConfig {
	identity: string;
	soul: string;
	skills: string;
	wiki?: string;
}

/**
 * Agent interface
 * All agents must implement this interface
 */
export interface Agent {
	readonly id: string;
	readonly name: string;

	/**
	 * Initialize the agent
	 */
	initialize(): Promise<void>;

	/**
	 * Start a new analysis session
	 */
	start(ctx: AgentContext): Promise<AgentResult>;

	/**
	 * Continue an existing session
	 */
	continue(ctx: AgentContext, message: string): Promise<AgentResult>;
}
