/**
 * Entity Manager
 * Handles entity CRUD operations on Obsidian Vault
 */

import { App, TFile, TFolder, Vault, CachedMetadata } from 'obsidian';
import { Entity, EntityType, EntityCreateInput } from './types';
import { loadTemplateLines } from '../utils/template-loader';

const ENTITY_FOLDERS: Record<EntityType, string> = {
	person: 'People',
	project: 'Projects',
	thing: 'Things',
	idea: 'Ideas',
	knowledge: 'Knowledge'
};

const ENTITY_TYPE_FIELD = 'type';

export class EntityManager {
	private app: App;
	private entityCache: Map<string, Entity> = new Map();
	private lastIndexTime: Date | null = null;
	private initPromise: Promise<void> | null = null;

	constructor(app: App) {
		this.app = app;
		this.initPromise = this.buildEntityCache();
	}

	/**
	 * Wait for initialization to complete
	 */
	async ensureInitialized(): Promise<void> {
		if (this.initPromise) {
			await this.initPromise;
		}
	}

	/**
	 * Build initial cache of all entities
	 */
	private async buildEntityCache(): Promise<void> {
		const vault = this.app.vault;

		// Index all entity folders regardless of Daily folder existence
		for (const [type, folderName] of Object.entries(ENTITY_FOLDERS)) {
			const folder = vault.getAbstractFileByPath(folderName);
			if (folder instanceof TFolder) {
				await this.indexFolder(folder, type as EntityType);
			}
		}

		this.lastIndexTime = new Date();
		console.log(`LifeWiki: Indexed ${this.entityCache.size} entities`);
	}

	/**
	 * Index a folder for entities
	 */
	private async indexFolder(folder: TFolder, type: EntityType): Promise<void> {
		for (const file of folder.children) {
			if (file instanceof TFile && file.extension === 'md') {
				await this.indexFile(file, type);
			}
		}
	}

	/**
	 * Index a single entity file
	 */
	async indexFile(file: TFile, type?: EntityType): Promise<Entity | null> {
		try {
			const content = await this.app.vault.read(file);
			const cache = this.app.metadataCache.getFileCache(file);

			// Parse frontmatter
			const frontmatter = cache?.frontmatter || {};
			const entityType = type || this.inferEntityType(frontmatter[ENTITY_TYPE_FIELD]);

			if (!entityType) {
				return null;
			}

			// Generate entity ID from file path (stable)
			const entityId = this.generateEntityId(file.path);

			const entity: Entity = {
				id: entityId,
				type: entityType,
				title: frontmatter.title || file.basename,
				titleRaw: frontmatter.title_raw || frontmatter.title || file.basename,
				aliases: frontmatter.aliases || [],
				tags: frontmatter.tags || [],
				summary: frontmatter.summary || '',
				confidence: frontmatter.confidence || 0.5,
				verificationStatus: frontmatter.verification_status || 'pending',
				createdAt: frontmatter.created_at || file.stat.ctime,
				createdBy: frontmatter.created_by || 'human',
				lastUpdated: frontmatter.last_updated || file.stat.mtime,
				relatedEntities: frontmatter.related_entities || [],
				interactions: frontmatter.interactions || [],
				metadata: frontmatter.metadata || {},
				filePath: file.path
			};

			this.entityCache.set(entityId, entity);
			return entity;
		} catch (error) {
			console.error(`LifeWiki: Failed to index ${file.path}:`, error);
			return null;
		}
	}

	/**
	 * Infer entity type from frontmatter
	 */
	private inferEntityType(typeField: string | undefined): EntityType | null {
		if (!typeField) return null;

		const typeMap: Record<string, EntityType> = {
			'人脉': 'person',
			'person': 'person',
			'project': 'project',
			'projects': 'project',
			'物': 'thing',
			'thing': 'thing',
			'想法': 'idea',
			'idea': 'idea',
			'知识': 'knowledge',
			'knowledge': 'knowledge'
		};

		return typeMap[typeField.toLowerCase()] || null;
	}

	/**
	 * Generate stable entity ID from file path
	 */
	private generateEntityId(path: string): string {
		// Simple hash-based ID for now
		let hash = 0;
		for (let i = 0; i < path.length; i++) {
			const char = path.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash;
		}
		return `entity_${Math.abs(hash).toString(16)}`;
	}

	/**
	 * Search for entities by name or alias
	 */
	searchEntities(query: string, types?: EntityType[]): Entity[] {
		const results: Entity[] = [];
		const lowerQuery = query.toLowerCase();

		for (const entity of this.entityCache.values()) {
			if (types && !types.includes(entity.type)) {
				continue;
			}

			// Match title
			if (entity.title.toLowerCase().includes(lowerQuery)) {
				results.push(entity);
				continue;
			}

			// Match aliases
			if (entity.aliases.some(a => a.toLowerCase().includes(lowerQuery))) {
				results.push(entity);
			}
		}

		return results;
	}

	/**
	 * Check if an entity exists (by name or alias)
	 */
	findEntity(name: string): Entity | null {
		const lowerName = name.toLowerCase();

		for (const entity of this.entityCache.values()) {
			if (entity.title.toLowerCase() === lowerName) {
				return entity;
			}
			if (entity.aliases.some(a => a.toLowerCase() === lowerName)) {
				return entity;
			}
		}

		return null;
	}

	/**
	 * Get entity by ID
	 */
	getEntity(id: string): Entity | null {
		return this.entityCache.get(id) || null;
	}

	/**
	 * Create a new entity
	 */
	async createEntity(entity: EntityCreateInput): Promise<Entity> {
		console.log('[EntityManager] createEntity called:', JSON.stringify(entity));

		// Tasks go to Projects folder, others use their respective folders
		const folderPath = entity.type === 'task' ? 'Projects' : ENTITY_FOLDERS[entity.type];
		console.log('[EntityManager] Folder path:', folderPath);

		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		console.log('[EntityManager] Folder exists:', folder ? 'yes' : 'no', folder?.constructor.name);

		if (!(folder instanceof TFolder)) {
			// Create folder if doesn't exist
			console.log('[EntityManager] Creating folder:', folderPath);
			try {
				await this.app.vault.createFolder(folderPath);
				console.log('[EntityManager] Folder created successfully');
			} catch (e) {
				console.error('[EntityManager] Failed to create folder:', e);
			}
		}

		// Task files end with "任务", others use entity title
		const fileName = entity.type === 'task' ? `${entity.title}任务.md` : `${entity.title}.md`;
		const filePath = `${folderPath}/${fileName}`;
		console.log('[EntityManager] File path:', filePath);

		// Generate ID
		const entityId = this.generateEntityId(filePath);

		const fullEntity: Entity = {
			...entity,
			id: entityId,
			filePath
		};

		// Write file
		const content = await this.entityToMarkdown(fullEntity);
		console.log('[EntityManager] Creating file with content length:', content.length);

		try {
			await this.app.vault.create(filePath, content);
			console.log('[EntityManager] File created successfully');
		} catch (e) {
			console.error('[EntityManager] Failed to create file:', e);
			throw e;
		}

		// Update cache
		this.entityCache.set(entityId, fullEntity);

		return fullEntity;
	}

	/**
	 * Update an existing entity
	 */
	async updateEntity(id: string, updates: Partial<Entity>): Promise<Entity | null> {
		const existing = this.entityCache.get(id);
		if (!existing) {
			return null;
		}

		const updated: Entity = {
			...existing,
			...updates,
			id // Preserve ID
		};

		// Write file
		const content = await this.entityToMarkdown(updated);
		await this.app.vault.adapter.write(existing.filePath, content);

		// Update cache
		this.entityCache.set(id, updated);

		return updated;
	}

	/**
	 * Add interaction to entity
	 */
	async addInteraction(entityId: string, interaction: Entity['interactions'][0]): Promise<void> {
		let entity = this.entityCache.get(entityId);

		// If entity not in cache, try to reload it from disk
		if (!entity) {
			entity = await this.reloadEntity(entityId);
			if (!entity) {
				console.warn(`[EntityManager] addInteraction: Entity ${entityId} not found in cache or on disk`);
				return;
			}
		}

		const updatedInteractions = [...entity.interactions, interaction];
		await this.updateEntity(entityId, {
			interactions: updatedInteractions,
			lastUpdated: new Date().toISOString()
		});
	}

	/**
	 * Reload entity from disk by ID
	 */
	private async reloadEntity(entityId: string): Promise<Entity | null> {
		// Find all entity files and try to find the one with matching ID
		const folders = ['People', 'Projects', 'Things', 'Ideas', 'Knowledge'];

		for (const folder of folders) {
			const folderPath = folder;
			const folderObj = this.app.vault.getAbstractFileByPath(folderPath);
			if (!folderObj || !(folderObj instanceof TFolder)) {
				continue;
			}

			try {
				const files = this.app.vault.getMarkdownFiles()
					.filter(f => f.path.startsWith(folderPath + '/'));

				for (const file of files) {
					const cache = this.app.metadataCache.getFileCache(file);
					const frontmatter = cache?.frontmatter || {};
					const fileEntityId = this.generateEntityId(file.path);

					if (fileEntityId === entityId) {
						// Found the file, re-index it
						return await this.indexFile(file);
					}
				}
			} catch {
				// Skip files that can't be read
			}
		}

		return null;
	}

	/**
	 * Convert entity to markdown content
	 */
	private async entityToMarkdown(entity: Entity): Promise<string> {
		const frontmatter = this.entityToFrontmatter(entity);
		const body = await this.entityToBody(entity);

		return `---
${frontmatter}
---

${body}`;
	}

	/**
	 * Generate frontmatter from entity
	 */
	private entityToFrontmatter(entity: Entity): string {
		const lines: string[] = [];

		// Core fields
		lines.push(`entity_id: "${entity.id}"`);
		lines.push(`entity_type: "${entity.type}"`);
		lines.push(`created_at: "${entity.createdAt}"`);
		lines.push(`created_by: "${entity.createdBy}"`);
		lines.push(`confidence: ${entity.confidence}`);
		lines.push(`verification_status: "${entity.verificationStatus}"`);
		lines.push(`last_verified_at: ${entity.lastVerifiedAt ? `"${entity.lastVerifiedAt}"` : 'null'}`);

		// Title
		lines.push(`title: "${this.escapeYaml(entity.title)}"`);
		lines.push(`title_raw: "${this.escapeYaml(entity.titleRaw)}"`);

		// Arrays
		lines.push(`aliases: [${entity.aliases.map(a => `"${this.escapeYaml(a)}"`).join(', ')}]`);
		lines.push(`tags: [${entity.tags.map(t => `"${this.escapeYaml(t)}"`).join(', ')}]`);

		// Summary
		if (entity.summary) {
			lines.push(`summary: "${this.escapeYaml(entity.summary)}"`);
		}

		// Related entities (simplified for now)
		if (entity.relatedEntities.length > 0) {
			lines.push('related_entities:');
			for (const rel of entity.relatedEntities) {
				lines.push(`  - entity_id: "${rel.entityId || ''}"`);
				lines.push(`    relation: "${rel.relation}"`);
				lines.push(`    context: "${this.escapeYaml(rel.context)}"`);
			}
		}

		// Interactions
		if (entity.interactions.length > 0) {
			lines.push('interactions:');
			for (const interaction of entity.interactions) {
				lines.push(`  - timestamp: "${interaction.timestamp}"`);
				lines.push(`    type: "${interaction.type}"`);
				lines.push(`    content: "${this.escapeYaml(interaction.content)}"`);
				if (interaction.sourceBlockId) {
					lines.push(`    source_block_id: "${interaction.sourceBlockId}"`);
				}
			}
		}

		// Metadata
		if (Object.keys(entity.metadata).length > 0) {
			lines.push('metadata:');
			for (const [key, value] of Object.entries(entity.metadata)) {
				if (typeof value === 'string') {
					lines.push(`  ${key}: "${this.escapeYaml(value)}"`);
				} else if (typeof value === 'object' && Array.isArray(value)) {
					lines.push(`  ${key}: [${value.map(v => `"${this.escapeYaml(String(v))}"`).join(', ')}]`);
				} else {
					lines.push(`  ${key}: ${value}`);
				}
			}
		}

		return lines.join('\n');
	}

	private escapeYaml(str: string): string {
		return str.replace(/"/g, '\\"').replace(/\n/g, '\\n');
	}

	/**
	 * Generate body content from entity using templates
	 */
	private async entityToBody(entity: Entity): Promise<string> {
		const lines: string[] = [];

		lines.push(`# ${entity.title}`);
		lines.push('');

		// Summary section
		if (entity.summary) {
			lines.push('## 摘要');
			lines.push(entity.summary);
			lines.push('');
		}

		// Load and render type-specific template
		const templatePath = `${entity.type}-template.md`;
		try {
			const templateLines = await loadTemplateLines(
				this.app.vault,
				templatePath,
				{ entity }
			);
			lines.push(...templateLines);
		} catch (error) {
			console.warn(`[EntityManager] Failed to load template ${templatePath}, using default:`, error);
			// Fallback to basic content if template fails
			lines.push(...this.getDefaultBody(entity));
		}

		return lines.join('\n');
	}

	/**
	 * Get default body content when template is not available
	 */
	private getDefaultBody(entity: Entity): string[] {
		const lines: string[] = [];
		switch (entity.type) {
			case 'person':
				lines.push('## 基本信息');
				lines.push('- **公司**: 待补充');
				lines.push('- **职位**: 待补充');
				break;
			case 'project':
				lines.push('## 项目信息');
				lines.push('待补充');
				break;
			case 'task':
				lines.push('## 任务信息');
				lines.push('待补充');
				break;
			case 'thing':
				lines.push('## 基本信息');
				lines.push('待补充');
				break;
			case 'idea':
				lines.push('## 想法描述');
				lines.push('待补充');
				break;
			case 'knowledge':
				lines.push('## 摘要');
				lines.push('待补充');
				break;
		}
		return lines;
	}

	/**
	 * Get all entities of a specific type
	 */
	async getEntitiesByType(type: EntityType): Promise<Entity[]> {
		await this.ensureInitialized();
		const results: Entity[] = [];
		for (const entity of this.entityCache.values()) {
			if (entity.type === type) {
				results.push(entity);
			}
		}
		return results;
	}

	/**
	 * Get all archived entities
	 */
	getArchivedEntities(): Entity[] {
		const results: Entity[] = [];
		for (const entity of this.entityCache.values()) {
			if (entity.metadata?.status === 'archived') {
				results.push(entity);
			}
		}
		return results;
	}
}
