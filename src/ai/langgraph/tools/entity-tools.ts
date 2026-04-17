/**
 * Entity Tools for LangGraph
 * Zod schema definitions and tool implementations for entity operations
 */

import { z } from 'zod';
import type { EntityManager } from '../../../entities/manager';
import type { ToolExecutionResult } from '../types';

// Tool input schemas (matching SKILL.md)
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

export type SearchEntityInput = z.infer<typeof SearchEntityInputSchema>;
export type CreateEntityInput = z.infer<typeof CreateEntityInputSchema>;
export type UpdateEntityInput = z.infer<typeof UpdateEntityInputSchema>;
export type AddInteractionInput = z.infer<typeof AddInteractionInputSchema>;
export type LinkEntitiesInput = z.infer<typeof LinkEntitiesInputSchema>;
export type ListEntitiesInput = z.infer<typeof ListEntitiesInputSchema>;
export type GetEntityHistoryInput = z.infer<typeof GetEntityHistoryInputSchema>;

/**
 * Tool implementation functions
 */
export class EntityTools {
	constructor(
		private entityManager: EntityManager,
		private blockId: string
	) {}

	/**
	 * Search for an entity by name
	 * Returns comprehensive entity information for AI context
	 */
	async searchEntity(input: SearchEntityInput): Promise<ToolExecutionResult> {
		try {
			const entity = this.entityManager.findEntity(input.name);
			if (entity) {
				// Return comprehensive entity data for AI understanding
				return {
					success: true,
					data: {
						found: true,
						entity: {
							id: entity.id,
							type: entity.type,
							name: entity.title,
							titleRaw: entity.titleRaw,
							aliases: entity.aliases,
							summary: entity.summary,
							tags: entity.tags,
							confidence: entity.confidence,
							verificationStatus: entity.verificationStatus,
							createdAt: entity.createdAt,
							lastUpdated: entity.lastUpdated,
							// Metadata is critical - contains entity-specific facts
							metadata: entity.metadata,
							// Recent interactions for context
							recentInteractions: entity.interactions.slice(-3).map(i => ({
								timestamp: i.timestamp,
								type: i.type,
								content: i.content
							})),
							// Related entities
							relatedEntities: entity.relatedEntities.map(r => ({
								entityId: r.entityId,
								relation: r.relation,
								context: r.context
							}))
						}
					}
				};
			}
			return { success: true, data: { found: false } };
		} catch (error) {
			return { success: false, error: `Search failed: ${(error as Error).message}` };
		}
	}

	/**
	 * Create a new entity
	 */
	async createEntity(input: CreateEntityInput): Promise<ToolExecutionResult> {
		try {
			const entity = await this.entityManager.createEntity({
				type: input.entityType,
				title: input.name,
				titleRaw: input.name,
				aliases: [],
				tags: [],
				summary: input.summary || '',
				confidence: 0.8,
				verificationStatus: 'verified',
				createdAt: new Date().toISOString(),
				createdBy: 'ai',
				lastUpdated: new Date().toISOString(),
				relatedEntities: [],
				interactions: [{
					timestamp: new Date().toISOString(),
					type: 'ai_analysis',
					content: input.summary || '从日记中归档',
					sourceBlockId: this.blockId
				}],
				metadata: input.metadata || { status: 'active', source: 'diary' }
			});
			return {
				success: true,
				data: {
					success: true,
					entityId: entity.id,
					path: `${entity.type}s/${entity.title}.md`
				}
			};
		} catch (error) {
			return { success: false, error: `Create failed: ${(error as Error).message}` };
		}
	}

	/**
	 * Update an existing entity
	 * Handles metadata updates especially - these contain entity-specific facts
	 */
	async updateEntity(input: UpdateEntityInput): Promise<ToolExecutionResult> {
		try {
			const updates: Record<string, unknown> = {};
			const metadataUpdates: Record<string, any> = {};

			for (const [field, value] of Object.entries(input.updates)) {
				// Metadata fields should be merged, not replaced
				if (field === 'metadata' && typeof value === 'object') {
					metadataUpdates['metadata'] = value;
				} else if (field.startsWith('metadata.')) {
					// Nested metadata field like "metadata.phone"
					const metaKey = field.substring('metadata.'.length);
					metadataUpdates[`metadata.${metaKey}`] = value;
				} else {
					updates[field] = value;
				}
			}

			// If there are metadata updates, get current entity and merge
			if (Object.keys(metadataUpdates).length > 0) {
				const currentEntity = this.entityManager.getEntity(input.entityId);
				if (currentEntity) {
					const mergedMetadata = { ...currentEntity.metadata, ...metadataUpdates.metadata };
					updates.metadata = mergedMetadata;
				}
			}

			const entity = await this.entityManager.updateEntity(input.entityId, updates);
			if (entity) {
				return {
					success: true,
					data: {
						success: true,
						updatedFields: Object.keys(updates),
						newMetadata: updates.metadata as Record<string, any>
					}
				};
			}
			return { success: false, error: 'Entity not found' };
		} catch (error) {
			return { success: false, error: `Update failed: ${(error as Error).message}` };
		}
	}

	/**
	 * Add interaction to entity
	 */
	async addInteraction(input: AddInteractionInput): Promise<ToolExecutionResult> {
		try {
			await this.entityManager.addInteraction(input.entityId, {
				timestamp: new Date().toISOString(),
				type: 'diary_mention',
				content: input.content,
				sourceBlockId: input.sourceBlockId || this.blockId
			});
			return { success: true, data: { success: true } };
		} catch (error) {
			return { success: false, error: `Add interaction failed: ${(error as Error).message}` };
		}
	}

	/**
	 * Link two entities
	 */
	async linkEntities(input: LinkEntitiesInput): Promise<ToolExecutionResult> {
		try {
			const entityA = this.entityManager.getEntity(input.entityIdA);
			if (!entityA) {
				return { success: false, error: 'Entity A not found' };
			}
			const relations = [...(entityA.relatedEntities || [])];
			relations.push({
				entityId: input.entityIdB,
				relation: input.relation as any,
				context: input.context || ''
			});
			await this.entityManager.updateEntity(input.entityIdA, { relatedEntities: relations });
			return { success: true, data: { success: true } };
		} catch (error) {
			return { success: false, error: `Link failed: ${(error as Error).message}` };
		}
	}

	/**
	 * List entities by type
	 * Returns comprehensive info for AI to match against diary content
	 */
	async listEntities(input: ListEntitiesInput): Promise<ToolExecutionResult> {
		try {
			const entities = await this.entityManager.getEntitiesByType(input.entityType);
			return {
				success: true,
				data: {
					entities: entities.map(e => ({
						id: e.id,
						name: e.title,
						titleRaw: e.titleRaw,
						aliases: e.aliases,
						summary: e.summary,
						tags: e.tags,
						updatedAt: e.lastUpdated,
						// Include key metadata for matching
						metadata: e.metadata,
						// Recent interaction context
						lastInteraction: e.interactions.length > 0
							? e.interactions[e.interactions.length - 1].content
							: null
					}))
				}
			};
		} catch (error) {
			return { success: false, error: `List failed: ${(error as Error).message}` };
		}
	}

	/**
	 * Get entity history
	 */
	async getEntityHistory(input: GetEntityHistoryInput): Promise<ToolExecutionResult> {
		try {
			const entity = this.entityManager.getEntity(input.entityId);
			if (entity) {
				return {
					success: true,
					data: {
						interactions: entity.interactions
					}
				};
			}
			return { success: false, error: 'Entity not found' };
		} catch (error) {
			return { success: false, error: `Get history failed: ${(error as Error).message}` };
		}
	}
}
