/**
 * Entity Manager
 * Handles entity CRUD operations on Obsidian Vault
 */
import { TFile, TFolder } from 'obsidian';
const ENTITY_FOLDERS = {
    person: 'People',
    project: 'Projects',
    thing: 'Things',
    idea: 'Ideas',
    knowledge: 'Knowledge'
};
const ENTITY_TYPE_FIELD = 'type';
export class EntityManager {
    constructor(app) {
        this.entityCache = new Map();
        this.lastIndexTime = null;
        this.app = app;
        this.buildEntityCache();
    }
    /**
     * Build initial cache of all entities
     */
    async buildEntityCache() {
        const vault = this.app.vault;
        const dailyFolder = vault.getAbstractFileByPath('Daily');
        if (!dailyFolder || !(dailyFolder instanceof TFolder)) {
            return;
        }
        // Index all entity folders
        for (const [type, folderName] of Object.entries(ENTITY_FOLDERS)) {
            const folder = vault.getAbstractFileByPath(folderName);
            if (folder instanceof TFolder) {
                await this.indexFolder(folder, type);
            }
        }
        this.lastIndexTime = new Date();
        console.log(`LifeWiki: Indexed ${this.entityCache.size} entities`);
    }
    /**
     * Index a folder for entities
     */
    async indexFolder(folder, type) {
        for (const file of folder.children) {
            if (file instanceof TFile && file.extension === 'md') {
                await this.indexFile(file, type);
            }
        }
    }
    /**
     * Index a single entity file
     */
    async indexFile(file, type) {
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
            const entity = {
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
        }
        catch (error) {
            console.error(`LifeWiki: Failed to index ${file.path}:`, error);
            return null;
        }
    }
    /**
     * Infer entity type from frontmatter
     */
    inferEntityType(typeField) {
        if (!typeField)
            return null;
        const typeMap = {
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
    generateEntityId(path) {
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
    searchEntities(query, types) {
        const results = [];
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
    findEntity(name) {
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
    getEntity(id) {
        return this.entityCache.get(id) || null;
    }
    /**
     * Create a new entity
     */
    async createEntity(entity) {
        const folder = this.app.vault.getAbstractFileByPath(ENTITY_FOLDERS[entity.type]);
        if (!(folder instanceof TFolder)) {
            // Create folder if doesn't exist
            await this.app.vault.createFolder(ENTITY_FOLDERS[entity.type]);
        }
        const fileName = `${entity.title}.md`;
        const filePath = `${ENTITY_FOLDERS[entity.type]}/${fileName}`;
        // Generate ID
        const entityId = this.generateEntityId(filePath);
        const fullEntity = {
            ...entity,
            id: entityId,
            filePath
        };
        // Write file
        const content = this.entityToMarkdown(fullEntity);
        await this.app.vault.create(filePath, content);
        // Update cache
        this.entityCache.set(entityId, fullEntity);
        return fullEntity;
    }
    /**
     * Update an existing entity
     */
    async updateEntity(id, updates) {
        const existing = this.entityCache.get(id);
        if (!existing) {
            return null;
        }
        const updated = {
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
    async addInteraction(entityId, interaction) {
        const entity = this.entityCache.get(entityId);
        if (!entity)
            return;
        const updatedInteractions = [...entity.interactions, interaction];
        await this.updateEntity(entityId, {
            interactions: updatedInteractions,
            lastUpdated: new Date().toISOString()
        });
    }
    /**
     * Convert entity to markdown content
     */
    entityToMarkdown(entity) {
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
    entityToFrontmatter(entity) {
        const lines = [];
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
                }
                else if (typeof value === 'object' && Array.isArray(value)) {
                    lines.push(`  ${key}: [${value.map(v => `"${this.escapeYaml(String(v))}"`).join(', ')}]`);
                }
                else {
                    lines.push(`  ${key}: ${value}`);
                }
            }
        }
        return lines.join('\n');
    }
    escapeYaml(str) {
        return str.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    }
    /**
     * Generate body content from entity
     */
    entityToBody(entity) {
        const lines = [];
        lines.push(`# ${entity.title}`);
        lines.push('');
        // Summary section if exists
        if (entity.summary) {
            lines.push('## 摘要');
            lines.push(entity.summary);
            lines.push('');
        }
        // Type-specific sections could be added here
        // For now, keep it simple - Obsidian will render the rest
        return lines.join('\n');
    }
    /**
     * Get all entities of a specific type
     */
    getEntitiesByType(type) {
        const results = [];
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
    getArchivedEntities() {
        const results = [];
        for (const entity of this.entityCache.values()) {
            if (entity.metadata?.status === 'archived') {
                results.push(entity);
            }
        }
        return results;
    }
}
