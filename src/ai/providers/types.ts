/**
 * Provider Types
 * Type definitions for provider configuration
 */

export interface CustomProviderConfig {
	id: string;
	name: string;
	type: 'custom';
	endpoint: string;
	apiKey?: string;
	model: string;
	enableThinking?: boolean;
	reasoningEffort?: '' | 'high' | 'max';
	extraParams?: Record<string, unknown>;
}

export interface PresetProviderConfig {
	id: string;
	name: string;
	type: 'openai' | 'anthropic';
	apiKey: string;
	model: string;
}

export type ProviderConfig = CustomProviderConfig | PresetProviderConfig;

export interface ProviderSettings {
	defaultProvider: string;
	providers: ProviderConfig[];
}
