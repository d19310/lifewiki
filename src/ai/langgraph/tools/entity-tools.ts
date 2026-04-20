/**
 * Entity Tools for LangGraph
 * Zod schema definitions and tool implementations for entity operations
 */

import { z } from 'zod';
import type { App, TFile } from 'obsidian';
import type { EntityManager } from '../../../entities/manager';
import type { ToolExecutionResult } from '../types';

const DIARY_FOLDER = 'Daily';

// Vault tool input schemas
export const SearchVaultInputSchema = z.object({
	query: z.string().describe('Search query to find in vault documents')
});

export const ReadDocumentInputSchema = z.object({
	path: z.string().describe('Path to the document to read')
});

export const GetRelatedEntitiesInputSchema = z.object({
	entityId: z.string().describe('Entity ID to get related entities for')
});

export type SearchVaultInput = z.infer<typeof SearchVaultInputSchema>;
export type ReadDocumentInput = z.infer<typeof ReadDocumentInputSchema>;
export type GetRelatedEntitiesInput = z.infer<typeof GetRelatedEntitiesInputSchema>;

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

export const GetDiaryEntriesInputSchema = z.object({
	startDate: z.string().describe('Start date in YYYY-MM-DD format'),
	endDate: z.string().describe('End date in YYYY-MM-DD format'),
	query: z.string().optional().describe('Optional search query to filter diary entries')
});

export type SearchEntityInput = z.infer<typeof SearchEntityInputSchema>;
export type CreateEntityInput = z.infer<typeof CreateEntityInputSchema>;
export type UpdateEntityInput = z.infer<typeof UpdateEntityInputSchema>;
export type AddInteractionInput = z.infer<typeof AddInteractionInputSchema>;
export type LinkEntitiesInput = z.infer<typeof LinkEntitiesInputSchema>;
export type ListEntitiesInput = z.infer<typeof ListEntitiesInputSchema>;
export type GetEntityHistoryInput = z.infer<typeof GetEntityHistoryInputSchema>;
export type GetDiaryEntriesInput = z.infer<typeof GetDiaryEntriesInputSchema>;

/**
 * Tool implementation functions
 */
export class EntityTools {
	constructor(
		private entityManager: EntityManager,
		private blockId: string,
		private app?: App
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

	/**
	 * Get diary entries by date range
	 * Used in chat mode to allow AI to read diary entries for summarization/reflection
	 */
	async getDiaryEntries(input: GetDiaryEntriesInput): Promise<ToolExecutionResult> {
		try {
			if (!this.app) {
				return { success: false, error: 'Diary access not available' };
			}

			const diaryFiles = this.app.vault.getMarkdownFiles()
				.filter(f => f.path.startsWith(DIARY_FOLDER + '/'));

			// Filter by date range (fileName format: YYYY-MM-DD.md)
			const filteredFiles = diaryFiles.filter(f => {
				const fileName = f.name.replace('.md', '');
				return fileName >= input.startDate && fileName <= input.endDate;
			});

			const entries: Array<{ date: string; content: string }> = [];
			for (const file of filteredFiles) {
				try {
					const content = await this.app.vault.read(file);
					const date = file.name.replace('.md', '');

					// If query is provided, filter by content match
					if (input.query) {
						if (content.toLowerCase().includes(input.query.toLowerCase())) {
							entries.push({ date, content });
						}
					} else {
						entries.push({ date, content });
					}
				} catch (e) {
					// Skip files that can't be read
				}
			}

			// Sort by date descending (most recent first)
			entries.sort((a, b) => b.date.localeCompare(a.date));

			return {
				success: true,
				data: {
					entries,
					total: entries.length
				}
			};
		} catch (error) {
			return { success: false, error: `Get diary entries failed: ${(error as Error).message}` };
		}
	}

	/**
	 * Search vault documents by content query
	 * Used in chat mode for full-text search across all vault documents
	 */
	async searchVault(input: SearchVaultInput): Promise<ToolExecutionResult> {
		try {
			if (!this.app) {
				return { success: false, error: 'Vault access not available' };
			}

			const files = this.app.vault.getMarkdownFiles();
			const results: Array<{ path: string; snippet: string }> = [];
			const queryLower = input.query.toLowerCase();

			for (const file of files) {
				try {
					const content = await this.app.vault.read(file);
					const contentLower = content.toLowerCase();
					const index = contentLower.indexOf(queryLower);

					if (index !== -1) {
						// Extract snippet around the match
						const start = Math.max(0, index - 50);
						const end = Math.min(content.length, index + input.query.length + 100);
						let snippet = content.substring(start, end);
						if (start > 0) snippet = '...' + snippet;
						if (end < content.length) snippet = snippet + '...';

						results.push({
							path: file.path,
							snippet: snippet.replace(/\n/g, ' ')
						});
					}
				} catch {
					// Skip files that can't be read
				}
			}

			// Sort by relevance (match position)
			results.sort((a, b) => a.snippet.indexOf(input.query) - b.snippet.indexOf(input.query));

			return {
				success: true,
				data: {
					files: results.slice(0, 20), // Limit to top 20 results
					total: results.length
				}
			};
		} catch (error) {
			return { success: false, error: `Search vault failed: ${(error as Error).message}` };
		}
	}

	/**
	 * Read a document by path
	 * Used in chat mode to read full content of a specific document
	 */
	async readDocument(input: ReadDocumentInput): Promise<ToolExecutionResult> {
		try {
			if (!this.app) {
				return { success: false, error: 'Vault access not available' };
			}

			const file = this.app.vault.getAbstractFileByPath(input.path);

			if (!file || !(file instanceof Object)) {
				return { success: false, error: 'Document not found' };
			}

			const content = await this.app.vault.read(file as any);
			const cache = this.app.metadataCache.getFileCache(file as any);
			const frontmatter = cache?.frontmatter || {};

			return {
				success: true,
				data: {
					path: input.path,
					content,
					frontmatter
				}
			};
		} catch (error) {
			return { success: false, error: `Read document failed: ${(error as Error).message}` };
		}
	}

	/**
	 * Get related entities for an entity
	 * Used in chat mode to explore entity relationships
	 */
	async getRelatedEntitiesFromVault(input: GetRelatedEntitiesInput): Promise<ToolExecutionResult> {
		try {
			const entity = this.entityManager.getEntity(input.entityId);

			if (!entity) {
				return { success: false, error: 'Entity not found' };
			}

			const related = [];

			// Get related entities from entity's relatedEntities field
			if (entity.relatedEntities && entity.relatedEntities.length > 0) {
				for (const rel of entity.relatedEntities) {
					const relatedEntity = this.entityManager.getEntity(rel.entityId || rel.id);
					if (relatedEntity) {
						related.push({
							entity: {
								id: relatedEntity.id,
								name: relatedEntity.title,
								type: relatedEntity.type
							},
							relation: rel.relation,
							context: rel.context || ''
						});
					}
				}
			}

			return {
				success: true,
				data: {
					entity: {
						id: entity.id,
						name: entity.title,
						type: entity.type
					},
					related
				}
			};
		} catch (error) {
			return { success: false, error: `Get related entities failed: ${(error as Error).message}` };
		}
	}
}
