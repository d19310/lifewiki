/**
 * Provider Manager
 * Manages AI providers and agent-provider mapping
 */

import type { AIProvider } from './interfaces';

export class ProviderManager {
	private providers: Map<string, AIProvider> = new Map();
	private defaultProviderId: string = 'default';
	private agentProviderMapping: Map<string, string> = new Map();

	/**
	 * Register a provider
	 */
	registerProvider(provider: AIProvider): void {
		this.providers.set(provider.id, provider);
	}

	/**
	 * Get a provider by ID
	 */
	getProvider(id: string): AIProvider | undefined {
		return this.providers.get(id);
	}

	/**
	 * Get the default provider
	 */
	getDefaultProvider(): AIProvider | undefined {
		return this.providers.get(this.defaultProviderId);
	}

	/**
	 * Set the default provider
	 */
	setDefaultProvider(id: string): boolean {
		if (!this.providers.has(id)) {
			return false;
		}
		this.defaultProviderId = id;
		return true;
	}

	/**
	 * Set agent-provider mapping
	 */
	setAgentProvider(agentId: string, providerId: string): boolean {
		if (!this.providers.has(providerId)) {
			return false;
		}
		this.agentProviderMapping.set(agentId, providerId);
		return true;
	}

	/**
	 * Get provider for a specific agent
	 * Falls back to default provider if not mapped
	 */
	resolveAgent(agentId: string): AIProvider | undefined {
		const providerId = this.agentProviderMapping.get(agentId);
		if (providerId && this.providers.has(providerId)) {
			return this.providers.get(providerId);
		}
		return this.getDefaultProvider();
	}

	/**
	 * Get all registered provider IDs
	 */
	getAllProviderIds(): string[] {
		return Array.from(this.providers.keys());
	}

	/**
	 * Check if a provider is registered
	 */
	hasProvider(id: string): boolean {
		return this.providers.has(id);
	}
}
