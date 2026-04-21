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

export const ReadLocalDocumentInputSchema = z.object({
	path: z.string().describe('Local file path to the Markdown document (absolute path or path starting with / or ~)')
});

export const SummarizeDocumentInputSchema = z.object({
	content: z.string().describe('Document content to summarize'),
	entityType: z.enum(['person', 'project', 'thing', 'idea', 'knowledge']).describe('Entity type for context'),
	title: z.string().optional().describe('Document title for context')
});

export const DetectEntitiesInputSchema = z.object({
	diaryContent: z.string().describe('Diary content to analyze for entity detection'),
	options: z.object({
		enableFuzzyMatch: z.boolean().optional().describe('Enable fuzzy matching with edit distance'),
		similarityThreshold: z.number().optional().describe('Similarity threshold for fuzzy matching (0-1)'),
		includeLocalFiles: z.boolean().optional().describe('Extract local file paths from content'),
		includeWebLinks: z.boolean().optional().describe('Extract web URLs from content'),
		addInteractionsToArchived: z.array(z.object({
			entityId: z.string().describe('Entity ID to add interaction to'),
			content: z.string().describe('Interaction content')
		})).optional().describe('Batch add interactions to archived entities')
	}).optional()
});

export const ProcessEntitiesInputSchema = z.object({
	entities: z.array(z.object({
		name: z.string().optional().describe('Entity name for create action'),
		action: z.enum(['create', 'add_interaction', 'link']).describe('Operation type'),
		entityId: z.string().optional().describe('Entity ID for add_interaction action'),
		entityType: z.enum(['person', 'project', 'thing', 'idea', 'knowledge']).optional().describe('Entity type for create action'),
		summary: z.string().optional().describe('Summary for create action'),
		content: z.string().optional().describe('Interaction content for add_interaction action'),
		entityIdA: z.string().optional().describe('First entity ID for link action'),
		entityIdB: z.string().optional().describe('Second entity ID for link action'),
		relation: z.string().optional().describe('Relation type for link action'),
		context: z.string().optional().describe('Context for link action'),
		metadata: z.record(z.any()).optional().describe('Metadata for create action')
	})).describe('Array of entity operations to process'),
	options: z.object({
		skipOnConflict: z.boolean().optional().describe('Skip on conflict')
	}).optional()
});

export type DetectEntitiesInput = z.infer<typeof DetectEntitiesInputSchema>;
export type ProcessEntitiesInput = z.infer<typeof ProcessEntitiesInputSchema>;

export type SearchVaultInput = z.infer<typeof SearchVaultInputSchema>;
export type ReadDocumentInput = z.infer<typeof ReadDocumentInputSchema>;
export type GetRelatedEntitiesInput = z.infer<typeof GetRelatedEntitiesInputSchema>;
export type ReadLocalDocumentInput = z.infer<typeof ReadLocalDocumentInputSchema>;
export type SummarizeDocumentInput = z.infer<typeof SummarizeDocumentInputSchema>;

// Tool input schemas (matching SKILL.md)
export const SearchEntityInputSchema = z.object({
	name: z.string().describe('Entity name to search for')
});

export const CreateEntityInputSchema = z.object({
	entityType: z.enum(['person', 'project', 'thing', 'idea', 'knowledge']).describe('Type of entity'),
	name: z.string().describe('Entity name'),
	summary: z.string().optional().describe('One-line summary'),
	metadata: z.record(z.any()).optional().describe('Additional metadata'),
	sourceDocument: z.string().optional().describe('Local document path to archive from'),
	sourceContent: z.string().optional().describe('Document content when archiving from local file')
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
	links: z.array(z.object({
		entityIdA: z.string().describe('First entity ID'),
		entityIdB: z.string().describe('Second entity ID'),
		relation: z.string().describe('Relationship type'),
		context: z.string().optional().describe('Relationship context')
	})).describe('Array of entity links to create')
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
			// Build metadata with source info if provided
			const metadata = { ...(input.metadata || {}) };
			if (input.sourceDocument) {
				metadata.source_path = input.sourceDocument;
			}
			if (input.sourceContent) {
				metadata.description = input.sourceContent.substring(0, 500); // First 500 chars as description
			}
			metadata.status = metadata.status || 'active';
			metadata.source = metadata.source || 'document_archive';

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
					content: input.summary || '从本地文档归档',
					sourceBlockId: this.blockId
				}],
				metadata
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
	 * Link entities (batch)
	 */
	async linkEntities(input: LinkEntitiesInput): Promise<ToolExecutionResult> {
		try {
			// Import and delegate to skill executor
			const { linkEntitiesExecutor } = await import('../skills-registry');
			const context = {
				entityManager: this.entityManager,
				blockId: this.blockId
			};
			return linkEntitiesExecutor(context as any, input);
		} catch (error) {
			return { success: false, error: `Link entities failed: ${(error as Error).message}` };
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

	/**
	 * Read a local file from the filesystem
	 * Used when user provides an absolute path to a .md file
	 */
	async readLocalDocument(input: ReadLocalDocumentInput): Promise<ToolExecutionResult> {
		try {
			// Path validation for security - no path traversal
			if (!this.isValidLocalPath(input.path)) {
				return { success: false, error: 'Invalid path: must be an absolute path and cannot contain ".."' };
			}

			// Normalize path: expand ~ to home directory
			let normalizedPath = input.path;
			if (normalizedPath.startsWith('~/')) {
				const os = require('os');
				normalizedPath = normalizedPath.replace('~', os.homedir());
			}

			// Try to use Obsidian's vault API if app is available
			if (this.app) {
				const vaultAdapter = this.app.vault.adapter;
				let vaultBasePath: string;

				// Get vault base path
				if (typeof vaultAdapter.getBasePath === 'function') {
					vaultBasePath = vaultAdapter.getBasePath();
				} else if (typeof vaultAdapter.basePath === 'string') {
					vaultBasePath = vaultAdapter.basePath;
				} else {
					vaultBasePath = this.app.vault.path;
				}

				// Check if the file is inside the vault
				if (normalizedPath.startsWith(vaultBasePath)) {
					const relativePath = normalizedPath.substring(vaultBasePath.length + 1);
					const file = this.app.vault.getAbstractFileByPath(relativePath);

					if (file && file instanceof TFile) {
						const fileContent = await this.app.vault.read(file);
						return this.parseDocumentContent(fileContent, input.path);
					}
				}
			}

			return { success: false, error: 'File is not inside the Obsidian vault or vault API is not available' };
		} catch (error) {
			return { success: false, error: `Read local document failed: ${error instanceof Error ? error.message : String(error)}` };
		}
	}

	/**
	 * Parse document content and extract frontmatter
	 */
	private parseDocumentContent(content: string, filePath: string): ToolExecutionResult {
		// Check file size (limit to 100KB)
		const contentLength = Buffer.byteLength(content, 'utf-8');
		if (contentLength > 100 * 1024) {
			return { success: false, error: 'File too large: maximum size is 100KB' };
		}

		// Extract frontmatter if present
		const frontmatter: Record<string, any> = {};
		let bodyContent = content;

		const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
		if (frontmatterMatch) {
			const frontmatterStr = frontmatterMatch[1];
			bodyContent = frontmatterMatch[2];

			// Parse frontmatter lines
			const lines = frontmatterStr.split('\n');
			for (const line of lines) {
				const colonIndex = line.indexOf(':');
				if (colonIndex > 0) {
					const key = line.substring(0, colonIndex).trim();
					let value: any = line.substring(colonIndex + 1).trim();
					// Handle arrays like [tag1, tag2]
					if (value.startsWith('[') && value.endsWith(']')) {
						value = value.slice(1, -1).split(',').map((s: string) => s.trim().replace(/['"]/g, ''));
					}
					frontmatter[key] = value;
				}
			}
		}

		// Extract title from first H1 heading if present
		let title = frontmatter.title || '';
		if (!title) {
			const h1Match = bodyContent.match(/^#\s+(.+)$/m);
			if (h1Match) {
				title = h1Match[1];
			}
		}

		// Extract filename as fallback title
		if (!title) {
			const filenameMatch = filePath.match(/\/([^/]+)\.md$/);
			if (filenameMatch) {
				title = filenameMatch[1];
			}
		}

		// Limit content to 20KB to prevent LLM overload
			const MAX_CONTENT_SIZE = 20 * 1024;
			let truncatedContent = bodyContent.trim();
			if (truncatedContent.length > MAX_CONTENT_SIZE) {
				truncatedContent = truncatedContent.substring(0, MAX_CONTENT_SIZE);
				truncatedContent += '\n\n[内容已截断，原文档过长]';
			}

			return {
			success: true,
			data: {
				content: truncatedContent,
				metadata: {
					title: title,
					tags: frontmatter.tags || [],
					uid: frontmatter.uid,
					frontmatter: frontmatter,
					originalLength: bodyContent.trim().length,
					wasTruncated: truncatedContent !== bodyContent.trim()
				}
			}
		};
	}

	/**
	 * Validate local file path for security
	 * Prevents path traversal attacks
	 */
	private isValidLocalPath(path: string): boolean {
		// Must be absolute path
		if (!path.startsWith('/') && !path.startsWith('~/')) {
			return false;
		}
		// Prevent directory traversal
		if (path.includes('..')) {
			return false;
		}
		// Prevent ~ expansion in middle of path
		if (path.includes('~') && !path.startsWith('~/')) {
			return false;
		}
		return true;
	}

	/**
	 * Summarize document content based on entity type
	 * Extracts key information and generates a structured summary
	 */
	async summarizeDocument(input: SummarizeDocumentInput): Promise<ToolExecutionResult> {
		try {
			const { content, entityType, title } = input;

			// For now, return a structured extraction based on entity type
			// The actual AI summarization happens in the agent's LLM call
			// This method provides structure for the agent to populate

			const summary: Record<string, any> = {
				extractedAt: new Date().toISOString(),
				originalLength: content.length,
				suggestedSummary: '',
				keyPoints: [],
				entityType
			};

			// Extract key information based on entity type
			if (entityType === 'person') {
				// Try to extract name, role, company
				const nameMatch = content.match(/(?:name|姓名|名称)[:：]\s*(.+)/i);
				const roleMatch = content.match(/(?:role|职位|职务)[:：]\s*(.+)/i);
				const companyMatch = content.match(/(?:company|公司|企业)[:：]\s*(.+)/i);

				summary.extractedFields = {
					name: nameMatch?.[1] || title || 'Unknown',
					role: roleMatch?.[1] || '',
					company: companyMatch?.[1] || ''
				};
			} else if (entityType === 'project') {
				// Try to extract goals, status, stakeholders
				const goalMatch = content.match(/(?:goal|目标|目的)[:：]\s*(.+)/i);
				const statusMatch = content.match(/(?:status|状态|进度)[:：]\s*(.+)/i);

				summary.extractedFields = {
					goal: goalMatch?.[1] || '',
					status: statusMatch?.[1] || '进行中'
				};
			}

			return {
				success: true,
				data: summary
			};
		} catch (error) {
			return { success: false, error: `Summarize document failed: ${(error as Error).message}` };
		}
	}

	/**
	 * Detect entities in diary content with efficient layered matching
	 * Uses HashMap for O(1) exact lookup, Trie for prefix matching,
	 * and edit distance for fuzzy matching
	 */
	async detectEntities(input: DetectEntitiesInput): Promise<ToolExecutionResult> {
		try {
			// Import the executor dynamically to avoid circular dependency
			const { detectEntitiesExecutor } = await import('../skills-registry');

			const context = {
				entityManager: this.entityManager,
				app: this.app,
				blockId: this.blockId
			};

			return await detectEntitiesExecutor(context as any, input);
		} catch (error) {
			return { success: false, error: `Detect entities failed: ${(error as Error).message}` };
		}
	}

	/**
	 * Batch process entity operations - create, add_interaction, link
	 */
	async processEntities(input: ProcessEntitiesInput): Promise<ToolExecutionResult> {
		try {
			// Import the executor dynamically to avoid circular dependency
			const { processEntitiesExecutor } = await import('../skills-registry');

			const context = {
				entityManager: this.entityManager,
				app: this.app,
				blockId: this.blockId
			};

			return await processEntitiesExecutor(context as any, input);
		} catch (error) {
			return { success: false, error: `Process entities failed: ${(error as Error).message}` };
		}
	}

	/**
	 * Update block metadata (category, areas)
	 */
	async updateBlockMetadata(input: { blockId: string; updates: { category?: string; areas?: string[] } }): Promise<ToolExecutionResult> {
		try {
			// Import the executor dynamically to avoid circular dependency
			const { updateBlockMetadataExecutor } = await import('../skills-registry');

			const context = {
				app: this.app,
				blockId: this.blockId
			};

			return await updateBlockMetadataExecutor(context as any, input);
		} catch (error) {
			return { success: false, error: `Update block metadata failed: ${(error as Error).message}` };
		}
	}
}
