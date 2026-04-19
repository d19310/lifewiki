/**
 * Entity Manager
 * Handles entity CRUD operations on Obsidian Vault
 */

import { App, TFile, TFolder, Vault, CachedMetadata } from 'obsidian';
import { Entity, EntityType, EntityCreateInput } from './types';

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
		const content = this.entityToMarkdown(fullEntity);
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
		const content = this.entityToMarkdown(updated);
		await this.app.vault.adapter.write(existing.filePath, content);

		// Update cache
		this.entityCache.set(id, updated);

		return updated;
	}

	/**
	 * Add interaction to entity
	 */
	async addInteraction(entityId: string, interaction: Entity['interactions'][0]): Promise<void> {
		const entity = this.entityCache.get(entityId);
		if (!entity) return;

		const updatedInteractions = [...entity.interactions, interaction];
		await this.updateEntity(entityId, {
			interactions: updatedInteractions,
			lastUpdated: new Date().toISOString()
		});
	}

	/**
	 * Convert entity to markdown content
	 */
	private entityToMarkdown(entity: Entity): string {
		const frontmatter = this.entityToFrontmatter(entity);
		const body = this.entityToBody(entity);

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
	 * Generate body content from entity (follows PRD 3.3.x templates)
	 */
	private entityToBody(entity: Entity): string {
		const lines: string[] = [];

		lines.push(`# ${entity.title}`);
		lines.push('');

		// Summary section
		if (entity.summary) {
			lines.push('## 摘要');
			lines.push(entity.summary);
			lines.push('');
		}

		// Type-specific sections following PRD templates
		switch (entity.type) {
			case 'person':
				lines.push(...this.generatePersonBody(entity));
				break;
			case 'project':
				lines.push(...this.generateProjectBody(entity));
				break;
			case 'task':
				lines.push(...this.generateTaskBody(entity));
				break;
			case 'thing':
				lines.push(...this.generateThingBody(entity));
				break;
			case 'idea':
				lines.push(...this.generateIdeaBody(entity));
				break;
			case 'knowledge':
				lines.push(...this.generateKnowledgeBody(entity));
				break;
		}

		return lines.join('\n');
	}

	/**
	 * Person body template (PRD 3.3.2)
	 */
	private generatePersonBody(entity: Entity): string[] {
		const lines: string[] = [];
		const m = entity.metadata || {};

		lines.push('## 基本信息');
		if (m.company) lines.push(`- **公司**: ${m.company}`);
		if (m.position) lines.push(`- **职位**: ${m.position}`);
		if (m.first_contact) lines.push(`- **首次接触**: ${m.first_contact}`);
		if (m.contact_channel) lines.push(`- **渠道**: ${m.contact_channel}`);
		lines.push('');

		lines.push('## 背景');
		lines.push('待补充');
		lines.push('');

		lines.push('## 互动记录');
		if (entity.interactions.length === 0) {
			lines.push('暂无互动记录');
		} else {
			for (const interaction of entity.interactions.slice(-5)) {
				const date = interaction.timestamp.split('T')[0];
				const blockRef = interaction.sourceBlockId ? ` → [[${date}]]` : '';
				lines.push(`- ${date}: ${interaction.content}${blockRef}`);
			}
		}
		lines.push('');

		lines.push('## 跟进事项');
		lines.push('- [ ] 补充公司背景');
		lines.push('- [ ] 补充职位详情');

		return lines;
	}

	/**
	 * Project body template (PRD 3.3.3)
	 */
	private generateProjectBody(entity: Entity): string[] {
		const lines: string[] = [];
		const m = entity.metadata || {};

		lines.push('## 项目信息');
		lines.push(entity.summary || '待补充');
		lines.push('');

		lines.push('## 背景');
		lines.push('待补充');
		lines.push('');

		lines.push('## 关键里程碑');
		if (m.milestones && Array.isArray(m.milestones)) {
			for (const milestone of m.milestones) {
				const status = milestone.status === 'completed' ? '[x]' : '[ ]';
				lines.push(`- ${status} ${milestone.title}`);
			}
		} else {
			lines.push('- [ ] 需求确认');
			lines.push('- [ ] 方案交付');
			lines.push('- [ ] 项目验收');
		}
		lines.push('');

		lines.push('## 跟进事项');
		lines.push('- [ ] 补充客户详细信息');
		lines.push('- [ ] 补充预算信息');

		return lines;
	}

	/**
	 * Task body template
	 * Tasks are categorized under Projects folder
	 */
	private generateTaskBody(entity: Entity): string[] {
		const lines: string[] = [];
		const m = entity.metadata || {};

		lines.push('## 任务信息');
		lines.push(entity.summary || '待补充');
		lines.push('');

		lines.push('## 基本属性');
		lines.push(`- **状态**: ${m.status || '待处理'}`);
		lines.push(`- **优先级**: ${m.priority || '中'}`);
		if (m.deadline) lines.push(`- **截止日期**: ${m.deadline}`);
		if (m.assignee) lines.push(`- **负责人**: ${m.assignee}`);
		lines.push('');

		lines.push('## 所属项目');
		if (m.project_name) lines.push(`- **项目名称**: ${m.project_name}`);
		if (m.project_id) lines.push(`- **项目ID**: ${m.project_id}`);
		lines.push('');

		lines.push('## 任务描述');
		lines.push(m.description || '待补充');
		lines.push('');

		lines.push('## 子任务');
		if (m.subtasks && Array.isArray(m.subtasks)) {
			for (const subtask of m.subtasks) {
				const status = subtask.completed ? '[x]' : '[ ]';
				lines.push(`- ${status} ${subtask.title}`);
			}
		} else {
			lines.push('- [ ] 子任务1');
			lines.push('- [ ] 子任务2');
		}
		lines.push('');

		lines.push('## 进度记录');
		if (entity.interactions.length === 0) {
			lines.push('暂无相关记录');
		} else {
			for (const interaction of entity.interactions.slice(-5)) {
				const date = interaction.timestamp.split('T')[0];
				lines.push(`- ${date}: ${interaction.content}`);
			}
		}
		lines.push('');

		lines.push('## 备注');
		lines.push(m.notes || '暂无备注');

		return lines;
	}

	/**
	 * Thing body template (PRD 3.3.4)
	 */
	private generateThingBody(entity: Entity): string[] {
		const lines: string[] = [];
		const m = entity.metadata || {};

		lines.push('## 基本信息');
		if (m.thing_type) lines.push(`- **类型**: ${m.thing_type}`);
		if (m.url) lines.push(`- **链接**: ${m.url}`);
		if (m.price_range) lines.push(`- **价格**: ${m.price_range}`);
		lines.push('');

		if (m.why_interesting) {
			lines.push('## 为什么关注');
			lines.push(m.why_interesting);
			lines.push('');
		}

		lines.push('## 跟进记录');
		if (entity.interactions.length === 0) {
			lines.push('暂无相关记录');
		} else {
			for (const interaction of entity.interactions.slice(-5)) {
				const date = interaction.timestamp.split('T')[0];
				lines.push(`- ${date}: ${interaction.content}`);
			}
		}

		return lines;
	}

	/**
	 * Idea body template (PRD 3.3.5)
	 */
	private generateIdeaBody(entity: Entity): string[] {
		const lines: string[] = [];

		lines.push('## 想法描述');
		lines.push(entity.summary || '待补充');
		lines.push('');

		lines.push('## 相关链接');
		// Link to related entities via Obsidian links
		if (entity.relatedEntities.length > 0) {
			for (const rel of entity.relatedEntities) {
				if (rel.entityId) {
					// Find the related entity title
					const related = this.entityCache.get(rel.entityId);
					if (related) {
						lines.push(`- [[${related.title}]]`);
					}
				}
			}
		}
		lines.push('');

		lines.push('## 进展记录');
		if (entity.interactions.length === 0) {
			lines.push('暂无相关记录');
		} else {
			for (const interaction of entity.interactions.slice(-5)) {
				const date = interaction.timestamp.split('T')[0];
				lines.push(`- ${date}: ${interaction.content}`);
			}
		}

		return lines;
	}

	/**
	 * Knowledge body template (PRD 3.3.6)
	 */
	private generateKnowledgeBody(entity: Entity): string[] {
		const lines: string[] = [];
		const m = entity.metadata || {};

		lines.push('## 摘要');
		lines.push(entity.summary || '待补充');
		lines.push('');

		if (m.url) {
			lines.push('## 链接');
			lines.push(m.url);
			lines.push('');
		}

		lines.push('## 核心内容');
		lines.push(m.content || '...');
		lines.push('');

		if (entity.relatedEntities.length > 0) {
			lines.push('## 相关引用');
			for (const rel of entity.relatedEntities) {
				if (rel.entityId) {
					const related = this.entityCache.get(rel.entityId);
					if (related) {
						lines.push(`- [[${related.title}]]`);
					}
				}
			}
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
