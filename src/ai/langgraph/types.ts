/**
 * LangGraph Types
 * State and tool type definitions for LangGraph-based entity analysis
 */

import { z } from 'zod';
import type { EntityType, ChatMessage, BlockSession, AnalysisPhase } from '../../entities/types';

// Re-export AnalysisPhase for use in graph
export { AnalysisPhase } from '../../entities/types';

/**
 * State schema for the analysis graph
 */
export interface AnalysisState {
	// Session info
	blockId: string;
	blockContent: string;

	// Conversation
	messages: ChatMessage[];

	// Current phase
	currentPhase: AnalysisPhase;

	// Analysis results
	entities: {
		people: DiscoveredEntity[];
		projects: DiscoveredEntity[];
		things: DiscoveredEntity[];
		ideas: DiscoveredEntity[];
		knowledge: DiscoveredEntity[];
	};

	// Entities that need user confirmation
	pendingConfirmations: DiscoveredEntity[];

	// Confirmed entities ready for archiving
	confirmedEntities: ConfirmedEntity[];

	// Entities to update (new info discovered)
	updateEntities: EntityUpdate[];

	// Relationships to establish
	relations: EntityRelation[];

	// UI feedback
	aiResponse: string;
	error: string | null;
}

export interface DiscoveredEntity {
	name: string;
	inferredType: EntityType;
	confidence: number;
	context: string;
	existingEntityId?: string; // Set if entity already exists
}

export interface ConfirmedEntity {
	name: string;
	type: EntityType;
	smallType: string; // e.g., "同事", "客户", "项目"
	context: string;
}

export interface EntityUpdate {
	entityId: string;
	name: string;
	updates: Array<{
		field: string;
		value: string;
	}>;
}

export interface EntityRelation {
	from: string;
	to: string;
	relation: string;
}

/**
 * Tool input schemas (Zod)
 */
export const SearchEntityInputSchema = z.object({
	name: z.string().describe('Entity name to search for')
});

export const CreateEntityInputSchema = z.object({
	entityType: z.enum(['person', 'project', 'thing', 'idea', 'knowledge']).describe('Type of entity'),
	name: z.string().describe('Entity name'),
	summary: z.string().optional().describe('One-line summary'),
	metadata: z.record(z.any()).optional().describe('Additional metadata')
});

export const UpdateEntityInputSchema = z.object({
	entityId: z.string().describe('Entity ID to update'),
	updates: z.record(z.union([z.string(), z.array(z.string())])).describe('Fields to update')
});

export const AddInteractionInputSchema = z.object({
	entityId: z.string().describe('Entity ID'),
	content: z.string().describe('Interaction content'),
	sourceBlockId: z.string().optional().describe('Source block ID')
});

export const LinkEntitiesInputSchema = z.object({
	entityIdA: z.string().describe('First entity ID'),
	entityIdB: z.string().describe('Second entity ID'),
	relation: z.string().describe('Relationship type'),
	context: z.string().optional().describe('Relationship context')
});

export const ListEntitiesInputSchema = z.object({
	entityType: z.enum(['person', 'project', 'thing', 'idea', 'knowledge']).describe('Entity type'),
	status: z.enum(['active', 'all']).optional().default('active').describe('Filter by status')
});

export const GetEntityHistoryInputSchema = z.object({
	entityId: z.string().describe('Entity ID')
});

/**
 * Tool execution result type
 */
export interface ToolExecutionResult {
	success: boolean;
	data?: unknown;
	error?: string;
}
