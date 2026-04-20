/**
 * Agent Registry
 * Manages agents and provides agent resolution based on context
 */

import type { Agent } from './interfaces';
import type { ProviderManager } from '../providers/provider-manager';
import type { AIProvider } from '../providers/interfaces';

export class AgentRegistry {
	private agents: Map<string, Agent> = new Map();
	private providerManager: ProviderManager;

	constructor(providerManager: ProviderManager) {
		this.providerManager = providerManager;
	}

	/**
	 * Register an agent
	 */
	registerAgent(agent: Agent): void {
		this.agents.set(agent.id, agent);
	}

	/**
	 * Get an agent by ID
	 */
	getAgent(id: string): Agent | undefined {
		return this.agents.get(id);
	}

	/**
	 * Resolve the appropriate agent based on blockId
	 * - chat:global → Chat Agent
	 * - block:* → Diary Agent
	 */
	resolveAgent(blockId: string): Agent | undefined {
		if (blockId === 'chat:global') {
			return this.getAgent('chat') || this.getAgent('diary');
		}
		return this.getAgent('diary');
	}

	/**
	 * Get the provider for a specific agent
	 */
	getAgentProvider(agentId: string): AIProvider | undefined {
		return this.providerManager.resolveAgent(agentId);
	}

	/**
	 * Get all registered agent IDs
	 */
	getAllAgentIds(): string[] {
		return Array.from(this.agents.keys());
	}

	/**
	 * Check if an agent is registered
	 */
	hasAgent(id: string): boolean {
		return this.agents.has(id);
	}
}
