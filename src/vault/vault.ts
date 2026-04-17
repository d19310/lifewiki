import { App, TFile, Vault, normalizePath } from 'obsidian';
import { Entity, Block, EntityType, EntityCreateInput } from '../entities/types';
import { EntityManager } from '../entities/manager';

const DIARY_FOLDER = 'Daily';
const ENTITY_FOLDERS: Record<EntityType, string> = {
  person: 'People',
  project: 'Projects',
  thing: 'Things',
  idea: 'Ideas',
  knowledge: 'Knowledge',
};

// Check if file is a TFile by checking for path property (works with mocks)
function isTFile(file: unknown): file is TFile {
  return file !== null && typeof file === 'object' && 'path' in file;
}

interface AIProvider {
  analyzeBlock(content: string): Promise<any>;
}

interface SkillExecutor {
  createNewEntitiesWithSkills(analysis: any, entityManager: EntityManager, app: App): Promise<any[]>;
  analyzeBlock(block: { content: string; timestamp: string }): Promise<void>;
}

export const ENTITY_FOLDERS: Record<EntityType, string> = {
  person: 'People',
  project: 'Projects',
  thing: 'Things',
  idea: 'Ideas',
  knowledge: 'Knowledge',
};

export class VaultOperations {
  constructor(
    private app: App,
    private entityManager: EntityManager,
    private aiProvider: AIProvider | null,
    private skillExecutor: SkillExecutor
  ) {}

  async readDiary(date: string): Promise<string> {
    const filePath = `${DIARY_FOLDER}/${date}.md`;
    const file = this.app.vault.getAbstractFileByPath(filePath);

    if (!isTFile(file)) {
      return '';
    }

    return this.app.vault.read(file);
  }

  async appendBlock(date: string, block: Block): Promise<void> {
    const filePath = `${DIARY_FOLDER}/${date}.md`;
    const file = this.app.vault.getAbstractFileByPath(filePath);

    if (!isTFile(file)) {
      return;
    }

    const existingContent = await this.app.vault.read(file);
    const blockContent = this.formatBlock(block);
    const newContent = existingContent + '\n' + blockContent;

    await this.app.vault.modify(file, newContent);
  }

  private formatBlock(block: Block): string {
    const source = block.source ? ` [${block.source}]` : '';
    const category = block.category ? ` #${block.category}` : '';
    return `### ${block.timestamp}${source}${category}\n${block.content}`;
  }

  async createEntity(entity: EntityCreateInput): Promise<{ filePath: string }> {
    const folder = ENTITY_FOLDERS[entity.type];
    const fileName = `${entity.title}.md`;
    const filePath = `${folder}/${fileName}`;

    const content = this.formatEntityContent(entity);
    await this.app.vault.create(filePath, content);

    // Index the newly created entity
    await this.entityManager.indexFile(this.app.vault.getAbstractFileByPath(filePath) as TFile, entity.type);

    return { filePath };
  }

  async updateEntity(entity: Entity): Promise<{ filePath: string }> {
    const content = this.formatEntityContent(entity);
    await this.app.vault.adapter.write(entity.filePath, content);

    // Update the index
    await this.entityManager.indexFile(this.app.vault.getAbstractFileByPath(entity.filePath) as TFile, entity.type);

    return { filePath: entity.filePath };
  }

  private formatEntityContent(entity: Omit<Entity, 'id' | 'filePath'>): string {
    // Use YAML-like format for AI-friendly frontmatter
    const lines = [
      '---',
      `entity_type: "${entity.type}"`,
      `title: "${entity.title}"`,
      `title_raw: "${entity.titleRaw}"`,
      `aliases: [${entity.aliases.map(a => `"${a}"`).join(', ')}]`,
      `tags: [${entity.tags.map(t => `"${t}"`).join(', ')}]`,
      `summary: "${entity.summary}"`,
      `confidence: ${entity.confidence}`,
      `verification_status: "${entity.verificationStatus}"`,
      `created_at: "${entity.createdAt}"`,
      `created_by: "${entity.createdBy}"`,
      `last_updated: "${entity.lastUpdated}"`,
      `related_entities: [${entity.relatedEntities.map(r => `"${r.entityId}"`).join(', ')}]`,
      `metadata: ${JSON.stringify(entity.metadata)}`,
      '---',
      '',
      `# ${entity.title}`,
      '',
    ];
    return lines.join('\n');
  }

  async searchEntities(query: string, types?: EntityType[]): Promise<Entity[]> {
    return this.entityManager.searchEntities(query, types);
  }

  async findEntity(name: string): Promise<Entity | null> {
    return this.entityManager.findEntity(name);
  }

  async getEntityById(id: string): Promise<Entity | null> {
    return this.entityManager.getEntity(id);
  }

  async analyzeDiaryContent(content: string): Promise<any> {
    if (!this.aiProvider) {
      return {
        entities: { people: [], projects: [], things: [], ideas: [], knowledge: [] },
        needsConfirmation: [],
        aiResponse: 'AI provider not available',
      };
    }
    return this.aiProvider.analyzeBlock(content);
  }

  async processDiaryEntry(date: string, content: string): Promise<any> {
    const analysis = await this.analyzeDiaryContent(content);

    // Create new entities from analysis
    if (analysis.entities) {
      const createdEntities = await this.skillExecutor.createNewEntitiesWithSkills(
        analysis,
        this.entityManager,
        this.app
      );

      // Add interactions to existing entities
      if (analysis.entities.people.length > 0 ||
          analysis.entities.projects.length > 0 ||
          analysis.entities.things.length > 0) {
        await this.skillExecutor.analyzeBlock({
          content: content,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return analysis;
  }

  async searchDiary(query: string): Promise<any[]> {
    const vault = this.app.vault as Vault;
    const files = vault.getMarkdownFiles();
    const results: any[] = [];
    const lowerQuery = query.toLowerCase();

    for (const file of files) {
      if (file.path.startsWith(DIARY_FOLDER + '/')) {
        const content = await vault.read(file);
        if (content.toLowerCase().includes(lowerQuery)) {
          results.push({
            file: file.path,
            content: content.substring(0, 200),
          });
        }
      }
    }

    return results;
  }

  async exportEntities(type?: EntityType): Promise<string> {
    const entities = type ?
      await this.entityManager.getEntitiesByType(type) :
      Array.from(this.entityManager['entityCache'].values());

    return JSON.stringify(entities, null, 2);
  }

  async importEntities(data: Entity[]): Promise<Entity[]> {
    const imported: Entity[] = [];

    for (const entityData of data) {
      try {
        const entity = await this.entityManager.createEntity({
          type: entityData.type,
          title: entityData.title,
          titleRaw: entityData.titleRaw,
          aliases: entityData.aliases,
          tags: entityData.tags,
          summary: entityData.summary,
          confidence: entityData.confidence,
          verificationStatus: entityData.verificationStatus,
          createdAt: entityData.createdAt,
          createdBy: entityData.createdBy,
          lastUpdated: entityData.lastUpdated,
          relatedEntities: entityData.relatedEntities,
          interactions: entityData.interactions,
          metadata: entityData.metadata,
        });
        imported.push(entity);
      } catch (error) {
        console.error(`Failed to import entity ${entityData.title}:`, error);
      }
    }

    return imported;
  }

  // Advanced vault operations

  async getDiaryEntriesByDateRange(startDate: string, endDate: string): Promise<TFile[]> {
    const vault = this.app.vault as Vault;
    const diaryFiles = vault.getMarkdownFiles().filter(f => f.path.startsWith(DIARY_FOLDER + '/'));

    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();

    return diaryFiles.filter(file => {
      const dateStr = file.name.replace('.md', '');
      const fileDate = new Date(dateStr).getTime();
      return fileDate >= start && fileDate <= end;
    });
  }

  async getEntityDiaryConnections(entityId: string): Promise<{ diaryFile: string; date: string; snippets: string[] }[]> {
    const connections: { diaryFile: string; date: string; snippets: string[] }[] = [];
    const entity = this.entityManager.getEntity(entityId);

    if (!entity) return connections;

    const diaryFiles = this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(DIARY_FOLDER + '/'));

    for (const file of diaryFiles) {
      const content = await this.app.vault.read(file);
      const dateMatch = file.name.match(/^(\d{4}-\d{2}-\d{2})\.md$/);

      if (dateMatch && content.includes(entity.title)) {
        const lines = content.split('\n');
        const snippets: string[] = [];

        for (const line of lines) {
          if (line.includes(entity.title)) {
            snippets.push(line.substring(0, Math.min(line.length, 150)));
          }
        }

        connections.push({
          diaryFile: file.path,
          date: dateMatch[1],
          snippets,
        });
      }
    }

    return connections;
  }

  async updateEntityMetadata(entityId: string, metadata: Partial<Entity['metadata']>): Promise<void> {
    const entity = this.entityManager.getEntity(entityId);
    if (!entity) return;

    const updatedEntity: Entity = {
      ...entity,
      metadata: { ...entity.metadata, ...metadata },
      lastUpdated: new Date().toISOString(),
    };

    await this.updateEntity(updatedEntity);
  }

  async linkEntities(sourceEntityId: string, targetEntityId: string, relation: Entity['relatedEntities'][0]['relation'], context: string = ''): Promise<void> {
    const sourceEntity = this.entityManager.getEntity(sourceEntityId);
    const targetEntity = this.entityManager.getEntity(targetEntityId);

    if (!sourceEntity || !targetEntity) return;

    // Check if link already exists
    const existingLink = sourceEntity.relatedEntities.find(
      r => r.entityId === targetEntityId && r.relation === relation
    );

    if (!existingLink) {
      await this.updateEntity(sourceEntity, {
        relatedEntities: [
          ...sourceEntity.relatedEntities,
          { entityId: targetEntityId, relation, context },
        ],
      });
    }

    // Also add reverse link for bidirectional relations
    if (relation !== 'update_of') {
      const reverseRelation: Entity['relatedEntities'][0]['relation'] =
        relation === 'mentioned_in' ? 'mentioned_in' : 'related_to';

      const existingReverse = targetEntity.relatedEntities.find(
        r => r.entityId === sourceEntityId && r.relation === reverseRelation
      );

      if (!existingReverse) {
        await this.updateEntity(targetEntity, {
          relatedEntities: [
            ...targetEntity.relatedEntities,
            { entityId: sourceEntityId, relation: reverseRelation, context: `Reverse of ${relation}` },
          ],
        });
      }
    }
  }

  async getDiaryStats(date?: string): Promise<{
    totalEntries: number;
    wordCount: number;
    entityMentions: Record<string, number>;
  }> {
    const files = this.app.vault.getMarkdownFiles();
    const diaryFiles = files.filter(f => f.path.startsWith(DIARY_FOLDER + '/'));

    if (date) {
      const dateFile = diaryFiles.find(f => f.name === `${date}.md`);
      if (!dateFile) {
        return { totalEntries: 0, wordCount: 0, entityMentions: {} };
      }
      diaryFiles.length = 0;
      diaryFiles.push(dateFile);
    }

    let totalWordCount = 0;
    const entityMentions: Record<string, number> = {};

    for (const file of diaryFiles) {
      const content = await this.app.vault.read(file);
      const words = content.match(/\b\w+\b/g) || [];
      totalWordCount += words.length;

      // Count entity mentions
      for (const entity of this.entityManager['entityCache'].values()) {
        const count = (content.match(new RegExp(entity.title, 'gi')) || []).length;
        if (count > 0) {
          entityMentions[entity.title] = (entityMentions[entity.title] || 0) + count;
        }
      }
    }

    return {
      totalEntries: diaryFiles.length,
      wordCount: totalWordCount,
      entityMentions,
    };
  }

  async searchAll(query: string, types?: EntityType[]): Promise<{
    entities: Entity[];
    diary: any[];
  }> {
    const entities = await this.searchEntities(query, types);
    const diaryResults = await this.searchDiary(query);

    return {
      entities,
      diary: diaryResults,
    };
  }

  async createDiaryEntry(date: string, content: string, entityIds: string[] = []): Promise<{ filePath: string; analysis: any }> {
    await this.appendBlock(date, {
      id: crypto.randomUUID(),
      timestamp: new Date().toTimeString().substring(0, 5),
      content,
      parentId: null,
      children: [],
      category: '个人',
      source: 'LifeWiki',
    });

    const analysis = await this.processDiaryEntry(date, content);

    // Link entities if provided
    for (const entityId of entityIds) {
      await this.linkEntities(entityId, this.entityManager.getEntity(entityId)?.id || '', 'mentioned_in', `Mentioned in diary entry ${date}`);
    }

    return { filePath: `${DIARY_FOLDER}/${date}.md`, analysis };
  }
}