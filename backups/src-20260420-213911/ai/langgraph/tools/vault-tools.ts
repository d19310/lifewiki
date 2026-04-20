/**
 * Vault Tools for LangGraph
 * Tools for searching and reading vault documents
 */

import type { App } from 'obsidian';
import type { ToolExecutionResult } from '../types';

/**
 * Search vault documents by content query
 */
export async function searchVault(
	app: App,
	query: string
): Promise<ToolExecutionResult> {
	try {
		const files = app.vault.getMarkdownFiles();
		const results: Array<{ path: string; snippet: string }> = [];
		const queryLower = query.toLowerCase();

		for (const file of files) {
			try {
				const content = await app.vault.read(file);
				const contentLower = content.toLowerCase();
				const index = contentLower.indexOf(queryLower);

				if (index !== -1) {
					// Extract snippet around the match
					const start = Math.max(0, index - 50);
					const end = Math.min(content.length, index + query.length + 100);
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
		results.sort((a, b) => a.snippet.indexOf(query) - b.snippet.indexOf(query));

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
 */
export async function readDocument(
	app: App,
	path: string
): Promise<ToolExecutionResult> {
	try {
		const file = app.vault.getAbstractFileByPath(path);

		if (!file || !(file instanceof Object)) {
			return { success: false, error: 'Document not found' };
		}

		const content = await app.vault.read(file as any);
		const cache = app.metadataCache.getFileCache(file as any);
		const frontmatter = cache?.frontmatter || {};

		return {
			success: true,
			data: {
				path,
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
 */
export async function getRelatedEntities(
	entityManager: any,
	entityId: string
): Promise<ToolExecutionResult> {
	try {
		const entity = entityManager.getEntity(entityId);

		if (!entity) {
			return { success: false, error: 'Entity not found' };
		}

		const related = [];

		// Get related entities from entity's relatedEntities field
		if (entity.relatedEntities && entity.relatedEntities.length > 0) {
			for (const rel of entity.relatedEntities) {
				const relatedEntity = entityManager.getEntity(rel.entityId || rel.id);
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
