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
			const entityType = type || this.inferEntityType(frontmatter[ENTITY_TYPE_FIELD] || frontmatter.entity_type);

			if (!entityType) {
				return null;
			}

			// Generate entity ID from file path (stable)
			const entityId = this.generateEntityId(file.path);

			const interactions = this.normalizeInteractions(frontmatter.interactions || this.parseBodyInteractions(content));
			const metadata = this.normalizeMetadata(frontmatter, entityType);
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
				interactions,
				metadata,
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

		const fullEntity: Entity = this.prepareEntityForWrite({
			...entity,
			id: entityId,
			filePath
		});

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

		const updated: Entity = this.prepareEntityForWrite({
			...existing,
			...updates,
			id // Preserve ID
		});

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

	private prepareEntityForWrite(entity: Entity): Entity {
		const metadata = this.enrichMetadata(entity);
		const aliases = entity.type === 'person'
			? this.enrichPersonAliases(entity)
			: this.normalizeArray(entity.aliases);
		return {
			...entity,
			metadata,
			tags: this.normalizeArray(entity.tags),
			aliases
		};
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
		const metadata = entity.metadata || {};

		lines.push(`entity_id: "${entity.id}"`);
		lines.push(`type: "${entity.type}"`);
		lines.push(`title: "${this.escapeYaml(entity.title)}"`);
		lines.push(`aliases: [${entity.aliases.map(a => `"${this.escapeYaml(a)}"`).join(', ')}]`);
		lines.push(`tags: [${entity.tags.map(t => `"${this.escapeYaml(t)}"`).join(', ')}]`);
		if (entity.summary) {
			lines.push(`summary: "${this.escapeYaml(entity.summary)}"`);
		}
		lines.push(`status: "${this.escapeYaml(String(metadata.status || 'active'))}"`);
		lines.push(`area: "${this.escapeYaml(String(metadata.area || this.defaultArea(entity.type)))}"`);
		lines.push(`source: "${this.escapeYaml(String(metadata.source || 'diary'))}"`);
		lines.push(`confidence: ${entity.confidence}`);
		lines.push(`created_at: "${entity.createdAt}"`);
		lines.push(`last_updated: "${entity.lastUpdated}"`);

		this.appendSelectedMetadataFields(lines, metadata, this.metadataKeysForType(entity.type));

		const relatedEntityIds = entity.relatedEntities.map(r => r.entityId).filter(Boolean);
		if (relatedEntityIds.length > 0) {
			lines.push(`related_entity_ids: [${relatedEntityIds.map(id => `"${this.escapeYaml(String(id))}"`).join(', ')}]`);
		}
		const relatedLinks = this.getRelatedEntityLinks(entity);
		if (relatedLinks.length > 0) {
			lines.push(`related: [${relatedLinks.map(link => `"${this.escapeYaml(link)}"`).join(', ')}]`);
		}

		return lines.join('\n');
	}

	private escapeYaml(str: string): string {
		return str.replace(/"/g, '\\"').replace(/\n/g, '\\n');
	}

	private normalizeMetadata(frontmatter: CachedMetadata['frontmatter'] | Record<string, any>, type: EntityType): Record<string, any> {
		const metadata = { ...(frontmatter?.metadata || {}) };
		const keys = [
			'status',
			'source',
			'area',
			'areas',
			'person_type',
			'person_kind',
			'relationship_to_user',
			'company',
			'department',
			'position',
			'role',
			'contact_channel',
			'project_type',
			'project_kind',
			'client',
			'amount',
			'due_date',
			'priority',
			'stage',
			'owner',
			'start_date',
			'thing_type',
			'thing_kind',
			'vendor',
			'spec',
			'price',
			'brand',
			'model',
			'idea_type',
			'idea_kind',
			'impact',
			'applies_to',
			'source_type',
			'source_path',
			'author',
			'published_at',
			'topic',
			'url',
			'accessed_date'
		];

		for (const key of keys) {
			if (frontmatter?.[key] !== undefined && frontmatter?.[key] !== null) {
				metadata[key] = frontmatter[key];
			}
		}
		if (!metadata.status) metadata.status = 'active';
		if (!metadata.source) metadata.source = 'diary';
		if (!metadata.area) metadata.area = this.defaultArea(type);
		if (!metadata.areas) metadata.areas = [metadata.area];
		if (type === 'person') {
			if (!metadata.relationship_to_user && metadata.person_type && !['个人', '组织', '人脉'].includes(String(metadata.person_type))) {
				metadata.relationship_to_user = metadata.person_type;
			}
			if (!metadata.person_kind) metadata.person_kind = this.inferPersonKind(String(frontmatter?.title || ''));
		}
		if (metadata.project_type && !metadata.project_kind) metadata.project_kind = metadata.project_type;
		if (metadata.thing_type && !metadata.thing_kind) metadata.thing_kind = metadata.thing_type;
		if (metadata.idea_type && !metadata.idea_kind) metadata.idea_kind = metadata.idea_type;
		if (metadata.potential_impact && !metadata.impact) metadata.impact = metadata.potential_impact;
		return metadata;
	}

	private defaultArea(type: EntityType): string {
		if (type === 'person' || type === 'project') return '工作';
		if (type === 'knowledge') return '学习';
		return '工作';
	}

	private appendMetadataFields(lines: string[], entity: Entity): void {
		const metadata = entity.metadata || {};
		const orderedKeys = [
			'area',
			'areas',
			'source',
			'person_type',
			'person_kind',
			'relationship_to_user',
			'company',
			'department',
			'position',
			'role',
			'contact_channel',
			'project_type',
			'priority',
			'stage',
			'owner',
			'start_date',
			'thing_type',
			'brand',
			'model',
			'idea_type',
			'source_type',
			'url',
			'accessed_date'
		];

		const written = new Set(['status', 'area', 'source']);
		for (const key of orderedKeys) {
			if (metadata[key] !== undefined && metadata[key] !== null && metadata[key] !== '') {
				lines.push(`${key}: ${this.yamlValue(metadata[key])}`);
				written.add(key);
			}
		}

		for (const [key, value] of Object.entries(metadata)) {
			if (written.has(key) || value === undefined || value === null || value === '') continue;
			lines.push(`${key}: ${this.yamlValue(value)}`);
		}
	}

	private appendSelectedMetadataFields(lines: string[], metadata: Record<string, any>, keys: string[]): void {
		for (const key of keys) {
			const value = metadata[key];
			if (value !== undefined && value !== null && value !== '') {
				lines.push(`${key}: ${this.yamlValue(value)}`);
			}
		}
	}

	private metadataKeysForType(type: EntityType): string[] {
		const keys: Record<EntityType, string[]> = {
			person: ['person_kind', 'company', 'department', 'position', 'relationship_to_user', 'contact_channel'],
			project: ['project_kind', 'client', 'owner', 'stage', 'priority', 'amount', 'start_date', 'due_date'],
			thing: ['thing_kind', 'brand', 'model', 'vendor', 'spec', 'price'],
			idea: ['idea_kind', 'stage', 'impact', 'applies_to'],
			knowledge: ['source_type', 'url', 'source_path', 'author', 'published_at', 'accessed_date', 'topic']
		};
		return keys[type] || [];
	}

	private enrichMetadata(entity: Entity): Record<string, any> {
		if (entity.type === 'person') return this.enrichPersonMetadata(entity);
		if (entity.type === 'project') return this.enrichProjectMetadata(entity);
		if (entity.type === 'thing') return this.enrichThingMetadata(entity);
		if (entity.type === 'idea') return this.enrichIdeaMetadata(entity);
		if (entity.type === 'knowledge') return this.enrichKnowledgeMetadata(entity);
		return entity.metadata || {};
	}

	private baseMetadata(entity: Entity): Record<string, any> {
		const metadata = {
			status: 'active',
			source: 'diary',
			area: this.defaultArea(entity.type),
			...(entity.metadata || {})
		};
		delete metadata.areas;
		delete metadata.project_type;
		delete metadata.thing_type;
		delete metadata.idea_type;
		delete metadata.potential_impact;
		delete metadata.role;
		delete metadata.why_interesting;
		delete metadata.first_contact;
		return metadata;
	}

	private entityText(entity: Entity): string {
		return [
			entity.title,
			entity.summary,
			...entity.interactions.map((interaction) => interaction.content)
		].filter(Boolean).join('\n');
	}

	private enrichPersonMetadata(entity: Entity): Record<string, any> {
		const metadata = {
			...this.baseMetadata(entity)
		};
		const text = [
			entity.title,
			entity.summary,
			...entity.interactions.map((interaction) => interaction.content),
			metadata.company,
			metadata.position,
			metadata.relationship_to_user,
			metadata.person_type
		].filter(Boolean).join('\n');

		const companyAndRelation = this.extractCompanyAndRelationship(text);
		if (companyAndRelation.company && !metadata.company) metadata.company = companyAndRelation.company;
		if (companyAndRelation.relationship && !metadata.relationship_to_user) metadata.relationship_to_user = companyAndRelation.relationship;

		const position = this.extractPosition(text, entity.title);
		if (position && !metadata.position) metadata.position = position;

		if (!metadata.person_kind) metadata.person_kind = this.inferPersonKind(entity.title);
		if (!metadata.relationship_to_user && metadata.person_type && !['个人', '组织', '人脉'].includes(String(metadata.person_type))) {
			metadata.relationship_to_user = metadata.person_type;
		}
		delete metadata.person_type;
		return metadata;
	}

	private enrichPersonAliases(entity: Entity): string[] {
		const aliases = new Set(this.normalizeArray(entity.aliases));
		const text = this.entityText(entity);
		const patterns = [
			/别名(?:是|为|叫)?\s*([\u4e00-\u9fa5A-Za-z0-9._·（）()\-]{1,20})/g,
			/(?:也叫|又叫|简称|昵称)(?:是|为|叫)?\s*([\u4e00-\u9fa5A-Za-z0-9._·（）()\-]{1,20})/g
		];
		for (const pattern of patterns) {
			let match: RegExpExecArray | null;
			while ((match = pattern.exec(text)) !== null) {
				const alias = this.cleanAlias(match[1]);
				if (alias && alias !== entity.title) aliases.add(alias);
			}
		}
		return Array.from(aliases);
	}

	private enrichProjectMetadata(entity: Entity): Record<string, any> {
		const metadata = this.baseMetadata(entity);
		const text = this.entityText(entity);
		if (metadata.project_type && !metadata.project_kind) metadata.project_kind = metadata.project_type;
		if (!metadata.project_kind) metadata.project_kind = this.inferProjectKind(entity.title, text);
		if (!metadata.client) {
			const client = text.match(/(?:客户|甲方|需求方)\s*(?:是|为|：|:)?\s*([\u4e00-\u9fa5A-Za-z0-9._·（）()\-]{2,24})/);
			if (client) metadata.client = this.cleanExtractedName(client[1]);
		}
		if (!metadata.owner) {
			const owner = text.match(/([\u4e00-\u9fa5]{2,4}[A-Za-z0-9]*)是(?:项目|销售|技术)?负责人/);
			if (owner) metadata.owner = owner[1];
		}
		if (!metadata.amount) {
			const amount = text.match(/(\d+(?:\.\d+)?\s*(?:万|万元|亿|亿元|k|K|w|W))/);
			if (amount) metadata.amount = amount[1].replace(/\s+/g, '');
		}
		if (!metadata.stage) metadata.stage = this.inferProjectStage(text);
		return metadata;
	}

	private enrichThingMetadata(entity: Entity): Record<string, any> {
		const metadata = this.baseMetadata(entity);
		const text = this.entityText(entity);
		if (metadata.thing_type && !metadata.thing_kind) metadata.thing_kind = metadata.thing_type;
		if (!metadata.thing_kind) metadata.thing_kind = this.inferThingKind(entity.title, text);
		if (!metadata.brand) {
			const brand = entity.title.match(/^(英伟达|华为|超威|AMD|NVIDIA|Intel|戴尔|浪潮|联想|HPE)/i);
			if (brand) metadata.brand = brand[1];
		}
		if (!metadata.model) {
			const model = text.match(/\b(H100|H200|A100|A800|H800|B200|B300|MI300|MI325)\b/i);
			if (model) metadata.model = model[1].toUpperCase();
		}
		if (!metadata.price) {
			const price = text.match(/(?:价格|报价|当前价格|单价)?\s*(\d+(?:\.\d+)?\s*(?:万|万元|元|亿|亿元))/);
			if (price) metadata.price = price[1].replace(/\s+/g, '');
		}
		return metadata;
	}

	private enrichIdeaMetadata(entity: Entity): Record<string, any> {
		const metadata = this.baseMetadata(entity);
		const text = this.entityText(entity);
		if (metadata.idea_type && !metadata.idea_kind) metadata.idea_kind = metadata.idea_type;
		if (!metadata.idea_kind) metadata.idea_kind = this.inferIdeaKind(entity.title, text);
		if (!metadata.stage) metadata.stage = /已实现|完成|落地|上线/.test(text) ? '已落地' : '候选';
		if (!metadata.impact) metadata.impact = /重要|关键|核心|高价值|高影响/.test(text) ? '高' : '中';
		return metadata;
	}

	private enrichKnowledgeMetadata(entity: Entity): Record<string, any> {
		const metadata = this.baseMetadata(entity);
		const text = this.entityText(entity);
		if (!metadata.source_type) metadata.source_type = this.inferKnowledgeSourceType(entity.title, text, metadata.url || metadata.source_path);
		if (!metadata.url) {
			const url = text.match(/https?:\/\/[^\s)）]+/);
			if (url) metadata.url = url[0];
		}
		if (!metadata.topic) metadata.topic = this.inferKnowledgeTopic(entity.title, text);
		if (!metadata.accessed_date && (metadata.url || metadata.source_path)) metadata.accessed_date = new Date().toISOString().slice(0, 10);
		return metadata;
	}

	private inferProjectKind(title: string, text: string): string {
		if (/任务|调研/.test(title)) return '任务';
		if (/商机|客户需求|机会/.test(text)) return '商机';
		if (/供货/.test(title)) return '供货';
		if (/租赁/.test(title)) return '租赁';
		if (/平台/.test(title)) return '平台';
		return '项目';
	}

	private inferProjectStage(text: string): string {
		if (/验收|完成|交付完成|上线/.test(text)) return '已完成';
		if (/投标|报价|方案|评审|需求|调研|讨论|沟通/.test(text)) return '推进中';
		return '推进中';
	}

	private inferThingKind(title: string, text: string): string {
		if (/H100|H200|A100|B200|B300|GPU|显卡|服务器|芯片/i.test(`${title} ${text}`)) return '算力设备';
		if (/API|模型|软件|工具|平台|系统/i.test(`${title} ${text}`)) return '工具服务';
		return '物品';
	}

	private inferIdeaKind(title: string, text: string): string {
		if (/方案|解决方案/.test(`${title} ${text}`)) return '方案';
		if (/改造|设计|UI|产品/.test(`${title} ${text}`)) return '产品想法';
		if (/流程|机制|方法/.test(`${title} ${text}`)) return '方法流程';
		return '想法';
	}

	private inferKnowledgeSourceType(title: string, text: string, source?: string): string {
		const all = `${title} ${text} ${source || ''}`;
		if (/mp.weixin|微信|公众号/.test(all)) return '微信文章';
		if (/新闻|新浪|资讯/.test(all)) return '新闻';
		if (/论文|paper|arxiv/i.test(all)) return '论文';
		if (/报告|白皮书/.test(all)) return '报告';
		if (/https?:\/\//.test(all)) return '网页';
		return '文档';
	}

	private inferKnowledgeTopic(title: string, text: string): string {
		const all = `${title} ${text}`;
		if (/Kimi|Attention|模型|AI|OpenClaw|记忆系统/i.test(all)) return 'AI';
		if (/股票|财经|同花顺|新浪/.test(all)) return '财经';
		if (/柳树|文学|象征/.test(all)) return '文学';
		return '知识';
	}

	private extractCompanyAndRelationship(text: string): { company?: string; relationship?: string } {
		const relationWords = '同事|朋友|客户|供应商|合作伙伴|合作方|同学|老师|联系人';
		const possessive = text.match(new RegExp(`([\\u4e00-\\u9fa5A-Za-z0-9._·（）()\\-]{2,24})的(?:，|,|、|\\s)*(?:是)?(${relationWords})`));
		if (possessive) {
			return {
				company: this.cleanExtractedName(possessive[1]),
				relationship: this.normalizeRelationship(possessive[2])
			};
		}

		const company = text.match(/(?:所属公司|所在公司|公司|单位|来自|就职于|任职于|在)\s*(?:是|为|：|:)?\s*([\u4e00-\u9fa5A-Za-z0-9._·（）()\-]{2,24})/);
		const relation = this.extractRelationshipToUser(text);
		const companyAndPosition = text.match(/([\u4e00-\u9fa5A-Za-z0-9._·（）()\-]{2,24})(?:的)?(?:CEO|CTO|CFO|COO|总经理|副总经理|销售负责人|采购负责人|项目负责人|技术负责人|负责人|经理|总监|主任|顾问|架构师|工程师)/i);
		return {
			company: company ? this.cleanExtractedName(company[1]) : (companyAndPosition ? this.cleanExtractedName(companyAndPosition[1]) : undefined),
			relationship: relation
		};
	}

	private extractRelationshipToUser(text: string): string | undefined {
		const relationWords = ['同事', '领导', '朋友', '客户', '供应商', '合作伙伴', '合作方', '同学', '老师', '联系人'];
		const matched = relationWords.filter((word) => new RegExp(`(?:我的|与我关系|用户关系|关系|是)[^\\n。；;]{0,18}${word}|${word}[^\\n。；;，,、]{0,8}(?:关系|同事|领导)`).test(text));
		if (matched.length > 0) {
			return Array.from(new Set(matched.map((word) => this.normalizeRelationship(word)))).join('、');
		}
		const simple = text.match(new RegExp(`(?:关系|与我关系|用户关系|是我的|我的)\\s*(?:是|为|：|:)?\\s*(${relationWords.join('|')})`));
		return simple ? this.normalizeRelationship(simple[1]) : undefined;
	}

	private cleanExtractedName(value: string): string {
		return value
			.replace(/^(和|与|在|从|来自|他和|她和|其和|我和)/, '')
			.replace(/^补充：/, '')
			.replace(/[，,。；;、].*$/, '')
			.replace(/(公司|单位|团队|部门)$/, '$1')
			.trim();
	}

	private cleanAlias(value: string): string {
		return String(value || '')
			.replace(/[，,。；;、].*$/, '')
			.replace(/^[:：]/, '')
			.trim();
	}

	private normalizeRelationship(value: string): string {
		if (value.includes('客户')) return '客户';
		if (value.includes('供应商')) return '供应商';
		if (value.includes('合作')) return '合作伙伴';
		if (value.includes('同事')) return '同事';
		if (value.includes('朋友')) return '朋友';
		if (value.includes('同学')) return '同学';
		if (value.includes('老师')) return '老师';
		if (value.includes('负责人')) return '业务联系人';
		return value;
	}

	private extractPosition(text: string, title: string): string | undefined {
		const positions = 'CEO|CTO|CFO|COO|总经理|副总经理|销售负责人|采购负责人|项目负责人|技术负责人|负责人|经理|总监|主任|顾问|架构师|工程师';
		const escapedTitle = this.escapeRegExp(title);
		const explicit = text.match(new RegExp(`${escapedTitle}[^\\n，。；;]{0,24}(?:是|担任|作为|负责)[^\\n，。；;]{0,24}(${positions})`, 'i'));
		if (explicit) return explicit[1];
		const prefix = text.match(new RegExp(`(${positions})\\s*${escapedTitle}`, 'i'));
		if (prefix) return prefix[1];
		const companyPosition = text.match(new RegExp(`[\\u4e00-\\u9fa5A-Za-z0-9._·（）()\\-]{2,24}(?:的)?(${positions})`, 'i'));
		if (companyPosition) return companyPosition[1];
		const match = text.match(new RegExp(`(?:职位|职务|角色)\\s*(?:是|为|：|:)?\\s*(${positions})`, 'i'));
		return match?.[1];
	}

	private inferPersonKind(title: string): string {
		return /公司|智能|科技|集团|有限|实验室|研究院|研究所|管委会|委员会|部门|团队|机构|中心|银行|移动|电信|联通|大学|学院|医院|政府|协会|基金|资本|投资|园区|deepseek/i.test(title)
			? '组织'
			: '个人';
	}

	private normalizeArray(value: unknown): string[] {
		if (!Array.isArray(value)) return [];
		return value.map((item) => String(item).trim()).filter(Boolean);
	}

	private getRelatedEntityLinks(entity: Entity): string[] {
		const links: string[] = [];
		for (const relation of entity.relatedEntities || []) {
			if (!relation.entityId) continue;
			const related = this.entityCache.get(relation.entityId);
			if (!related) continue;
			const context = relation.context ? ` - ${relation.context}` : '';
			links.push(`[[${related.title}]] (${relation.relation})${context}`);
		}
		return links;
	}

	private linkKnownEntities(content: string, currentEntity?: Entity): string {
		if (!content) return content;
		const entities = Array.from(this.entityCache.values())
			.filter((entity) => entity.id !== currentEntity?.id)
			.filter((entity) => entity.title && entity.title.length >= 2)
			.sort((a, b) => b.title.length - a.title.length);
		if (entities.length === 0) return content;

		return content.split(/(\[\[[^\]]+\]\])/g).map((part) => {
			if (part.startsWith('[[') && part.endsWith(']]')) return part;
			let linked = part;
			for (const entity of entities) {
				const escaped = this.escapeRegExp(entity.title);
				linked = linked.replace(new RegExp(escaped, 'g'), `[[${entity.title}]]`);
			}
			return linked;
		}).join('');
	}

	private escapeRegExp(value: string): string {
		return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	private yamlValue(value: any): string {
		if (Array.isArray(value)) {
			return `[${value.map(v => `"${this.escapeYaml(String(v))}"`).join(', ')}]`;
		}
		if (typeof value === 'number' || typeof value === 'boolean') {
			return String(value);
		}
		return `"${this.escapeYaml(String(value))}"`;
	}

	private normalizeInteractions(input: any): Entity['interactions'] {
		if (!Array.isArray(input)) return [];
		return input
			.map((item) => ({
				timestamp: String(item.timestamp || new Date().toISOString()),
				type: item.type || 'diary_mention',
				content: String(item.content || '').trim(),
				sourceBlockId: item.sourceBlockId || item.source_block_id || undefined
			}))
			.filter((item) => item.content);
	}

	private parseBodyInteractions(content: string): Entity['interactions'] {
		const match = content.match(/## 互动(?:记录|历史)\n([\s\S]*?)(?=\n## |\n# |$)/);
		if (!match) return [];
		return match[1]
			.split('\n')
			.map((line) => line.trim())
			.filter(line => line.startsWith('- '))
			.map((line) => {
				const text = line.replace(/^-\s*/, '');
				const parsed = text.match(/^(\d{4}-\d{2}-\d{2})(?:\s*\|\s*([^|]+)\s*\|\s*(.*)|:\s*(.*))$/);
				if (!parsed) {
					return {
						timestamp: new Date().toISOString(),
						type: 'diary_mention' as const,
						content: text
					};
				}
				return {
					timestamp: parsed[1],
					type: (parsed[2]?.trim() || 'diary_mention') as Entity['interactions'][number]['type'],
					content: (parsed[3] || parsed[4] || '').trim()
				};
			})
			.filter((item) => item.content);
	}

	private toTemplateEntity(entity: Entity): Entity {
		return {
			...entity,
			metadata: entity.metadata || {},
			relatedEntityLinks: this.getRelatedEntityLinks(entity).join('\n'),
			interactions: entity.interactions.map((interaction) => ({
				...interaction,
				timestamp: this.formatInteractionDate(interaction.timestamp),
				content: this.formatInteractionContent(interaction, entity)
			}))
		} as Entity & { relatedEntityLinks: string };
	}

	private renderInteractionSection(entity: Entity): string[] {
		const lines = ['## 互动记录'];
		if (entity.interactions.length === 0) {
			lines.push('暂无互动记录');
			return lines;
		}
		for (const interaction of entity.interactions) {
			lines.push(`- ${this.formatInteractionDate(interaction.timestamp)} | ${interaction.type} | ${this.formatInteractionContent(interaction, entity)}`);
		}
		return lines;
	}

	private formatInteractionDate(timestamp: string): string {
		const date = new Date(timestamp);
		if (Number.isNaN(date.getTime())) {
			return timestamp.slice(0, 10) || new Date().toISOString().slice(0, 10);
		}
		return date.toISOString().slice(0, 10);
	}

	private formatInteractionContent(interaction: Entity['interactions'][number], currentEntity?: Entity): string {
		const suffix = interaction.sourceBlockId ? ` (block: ${interaction.sourceBlockId})` : '';
		return `${this.linkKnownEntities(interaction.content, currentEntity)}${suffix}`;
	}

	/**
	 * Generate body content from entity using templates
	 */
	private async entityToBody(entity: Entity): Promise<string> {
		const lines: string[] = [];
		const templateEntity = this.toTemplateEntity(entity);

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
				{ ...templateEntity, entity: templateEntity }
			);
			lines.push(...templateLines);
		} catch (error) {
			console.warn(`[EntityManager] Failed to load template ${templatePath}, using default:`, error);
			// Fallback to basic content if template fails
			lines.push(...this.getDefaultBody(entity));
		}

		if (!lines.some(line => /^## 互动(记录|历史)/.test(line))) {
			lines.push('');
			lines.push(...this.renderInteractionSection(entity));
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

	/**
	 * Build entity index for efficient lookup
	 * Uses HashMap for O(1) exact match and Trie for O(m) prefix match
	 */
	buildEntityIndex(): import('../ai/langgraph/entity-index').EntityIndex {
		// Import here to avoid circular dependency
		const { EntityIndex } = require('../ai/langgraph/entity-index');
		return new EntityIndex(Array.from(this.entityCache.values()));
	}

	/**
	 * Batch lookup entities by names - O(k) where k = number of names
	 */
	findExactBatch(names: string[]): Map<string, Entity | null> {
		const index = this.buildEntityIndex();
		return index.findExactBatch(names);
	}

	/**
	 * Find entity by name with layered matching
	 * 1. Exact match (HashMap) - O(1)
	 * 2. Alias match - O(k)
	 * 3. Trie prefix match - O(m)
	 * 4. Edit distance match - O(k*n) for candidates only
	 */
	findBestMatch(name: string): import('../ai/langgraph/entity-index').MatchResult {
		const index = this.buildEntityIndex();
		return index.findBestMatch(name);
	}

	/**
	 * Get all entities as array
	 */
	getAllEntities(): Entity[] {
		return Array.from(this.entityCache.values());
	}
}
