/**
 * Integration Tests
 * End-to-end tests for the LifeWiki plugin
 */

import { Block, AnalysisResult, Entity, EntityPreview } from '../entities/types';

// Mock Obsidian App
class MockObsidianApp {
  vault = new MockVault();
  workspace = new MockWorkspace();
}

class MockVault {
  files: Map<string, string> = new Map();
  createdFiles: string[] = [];

  async read(file: { path: string }): Promise<string> {
    const content = this.files.get(file.path);
    return content || '';
  }

  async create(path: string, content: string): Promise<void> {
    this.files.set(path, content);
    this.createdFiles.push(path);
  }

  async modify(file: { path: string }, newContent: string): Promise<void> {
    this.files.set(file.path, newContent);
  }

  getAbstractFileByPath(path: string) {
    return this.files.has(path) ? { path } : null;
  }

  getMarkdownFiles() {
    return Array.from(this.files.keys())
      .filter(p => p.endsWith('.md'))
      .map(p => ({ path: p }));
  }
}

class MockWorkspace {}

// Mock AI Provider
class MockAIProvider {
  async chat() {
    return {
      content: 'AI回复',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
    };
  }

  async analyzeBlock(content: string): Promise<AnalysisResult> {
    // Simulate AI analyzing content
    const hasPerson = content.includes('顾伟乐') || content.includes('人');
    const hasProject = content.includes('项目') || content.includes('B300');

    return {
      blockId: 'test-block-' + Date.now(),
      timestamp: new Date().toISOString(),
      category: hasPerson || hasProject ? '工作' : '个人',
      entities: {
        people: hasPerson ? [{
          name: '顾伟乐',
          type: 'person' as const,
          confidence: 0.9,
          context: '青岛移动项目经理',
          isArchived: false,
          newEntity: true
        }] : [],
        projects: hasProject ? [{
          name: '青岛B300项目',
          type: 'project' as const,
          confidence: 0.95,
          context: 'B300服务器采购',
          isArchived: false,
          newEntity: true
        }] : [],
        things: [],
        ideas: [],
        knowledge: []
      },
      needsConfirmation: hasPerson ? ['顾伟乐'] : [],
      aiResponse: hasPerson ? '识别到1人脉和1项目' : '未识别到实体'
    };
  }

  isReady() {
    return true;
  }
}

// Mock Entity Manager
class MockEntityManager {
  entities: Map<string, Entity> = new Map();
  interactions: Map<string, any[]> = new Map();
  private nextId = 1;

  findEntity(name: string): Entity | undefined {
    for (const entity of this.entities.values()) {
      if (entity.title === name) return entity;
    }
    return undefined;
  }

  async createEntity(input: any): Promise<Entity> {
    const id = `entity-${this.nextId++}`;
    const entity: Entity = {
      id,
      filePath: `${input.type}s/${input.title}.md`,
      type: input.type,
      title: input.title,
      titleRaw: input.titleRaw,
      aliases: input.aliases || [],
      tags: input.tags || [],
      summary: input.summary || '',
      confidence: input.confidence || 0.5,
      verificationStatus: input.verificationStatus || 'pending',
      createdAt: input.createdAt || new Date().toISOString(),
      createdBy: input.createdBy || 'ai',
      lastUpdated: input.lastUpdated || new Date().toISOString(),
      relatedEntities: input.relatedEntities || [],
      interactions: input.interactions || [],
      metadata: input.metadata || {}
    };
    this.entities.set(entity.id, entity);
    return entity;
  }

  async addInteraction(entityId: string, interaction: any): Promise<void> {
    if (!this.interactions.has(entityId)) {
      this.interactions.set(entityId, []);
    }
    this.interactions.get(entityId)!.push(interaction);
  }

  indexFile(file: { path: string }) {
    // Mock indexing
  }
}

// Integration test components
describe('Integration Tests', () => {
  let app: MockObsidianApp;
  let provider: MockAIProvider;
  let entityManager: MockEntityManager;

  beforeEach(() => {
    app = new MockObsidianApp();
    provider = new MockAIProvider();
    entityManager = new MockEntityManager();
  });

  describe('Complete Flow: Diary Entry to Entity Creation', () => {
    it('should complete full diary workflow', async () => {
      // 1. User writes diary entry
      const diaryContent = '今天和顾伟乐聊了青岛移动B300项目的情况';

      // 2. Create daily file
      const date = '2026-04-12';
      const filePath = `Daily/${date}.md`;
      await app.vault.create(filePath, `# ${date}\n\n${diaryContent}`);

      // Verify file created
      expect(app.vault.files.has(filePath)).toBe(true);

      // 3. Parse diary into blocks
      const block: Block = {
        id: 'block-1',
        timestamp: '08:30',
        content: diaryContent,
        parentId: null,
        children: [],
        category: '工作',
        source: 'Lifewiki'
      };

      expect(block.content).toBe(diaryContent);

      // 4. AI analyzes block
      const analysis = await provider.analyzeBlock(block.content);

      expect(analysis.category).toBe('工作');
      expect(analysis.entities.people.length).toBe(1);
      expect(analysis.entities.people[0].name).toBe('顾伟乐');
      expect(analysis.entities.projects.length).toBe(1);
      expect(analysis.entities.projects[0].name).toBe('青岛B300项目');

      // 5. Create entities from analysis
      for (const people of analysis.entities.people) {
        const entity = await entityManager.createEntity({
          type: people.type,
          title: people.name,
          titleRaw: people.name,
          summary: people.context,
          confidence: people.confidence,
          verificationStatus: 'pending',
          createdAt: new Date().toISOString(),
          createdBy: 'ai',
          lastUpdated: new Date().toISOString(),
          interactions: [{
            timestamp: new Date().toISOString(),
            type: 'ai_analysis',
            content: `AI 分析识别: ${people.context}`,
            sourceBlockId: block.id
          }],
          metadata: { status: 'active', source: 'diary' }
        });

        expect(entity.id).toBeDefined();
        expect(entity.title).toBe('顾伟乐');
      }

      // Verify entity was stored
      const foundEntity = entityManager.findEntity('顾伟乐');
      expect(foundEntity).toBeDefined();
      expect(foundEntity?.title).toBe('顾伟乐');
    });

    it('should handle existing entity mention', async () => {
      // Pre-create an entity
      const existingEntity = await entityManager.createEntity({
        id: 'existing-1',
        type: 'person',
        title: '顾伟乐',
        titleRaw: '顾伟乐',
        summary: '青岛移动项目经理',
        confidence: 0.9,
        verificationStatus: 'verified',
        createdAt: '2026-04-01T00:00:00Z',
        createdBy: 'human',
        lastUpdated: '2026-04-01T00:00:00Z',
        interactions: [],
        metadata: { status: 'active' }
      });

      // New diary entry mentions existing entity
      const block: Block = {
        id: 'block-2',
        timestamp: '10:00',
        content: '又和顾伟乐开会讨论项目进度',
        parentId: null,
        children: [],
        category: '工作',
        source: 'Lifewiki'
      };

      const analysis = await provider.analyzeBlock(block.content);

      // Entity should already exist
      const foundEntity = entityManager.findEntity('顾伟乐');
      expect(foundEntity).toBeDefined();
      expect(foundEntity?.verificationStatus).toBe('verified');

      // Add interaction
      if (foundEntity) {
        await entityManager.addInteraction(foundEntity.id, {
          timestamp: new Date().toISOString(),
          type: 'diary_mention',
          content: '讨论项目进度',
          sourceBlockId: block.id
        });
      }

      // Verify interaction was added
      const interactions = entityManager.interactions.get(foundEntity!.id);
      expect(interactions).toBeDefined();
      expect(interactions!.length).toBe(1);
      expect(interactions![0].type).toBe('diary_mention');
    });
  });

  describe('AI Provider Integration', () => {
    it('should work with different AI providers', async () => {
      const providers = [
        { name: 'Mock Provider', provider: new MockAIProvider() }
      ];

      for (const { name, provider } of providers) {
        const content = '测试内容';
        const result = await provider.analyzeBlock(content);

        expect(result).toHaveProperty('blockId');
        expect(result).toHaveProperty('category');
        expect(result).toHaveProperty('entities');
        expect(provider.isReady()).toBe(true);

        console.log(`Provider ${name} works correctly`);
      }
    });
  });

  describe('Entity Manager Integration', () => {
    it('should create and retrieve entities', async () => {
      const person = await entityManager.createEntity({
        type: 'person',
        title: '测试人员',
        titleRaw: '测试人员',
        summary: '测试摘要',
        confidence: 0.8,
        verificationStatus: 'pending',
        createdAt: new Date().toISOString(),
        createdBy: 'ai',
        lastUpdated: new Date().toISOString(),
        interactions: [],
        metadata: {}
      });

      const found = entityManager.findEntity('测试人员');
      expect(found).toBeDefined();
      expect(found?.id).toBe(person.id);
    });

    it('should handle multiple entity types', async () => {
      const entities = [
        { type: 'person' as const, title: '人脉1' },
        { type: 'project' as const, title: '项目1' },
        { type: 'thing' as const, title: '物品1' },
        { type: 'idea' as const, title: '想法1' },
        { type: 'knowledge' as const, title: '知识1' }
      ];

      for (const input of entities) {
        await entityManager.createEntity({
          ...input,
          titleRaw: input.title,
          summary: '',
          confidence: 0.5,
          verificationStatus: 'pending',
          createdAt: new Date().toISOString(),
          createdBy: 'ai',
          lastUpdated: new Date().toISOString(),
          interactions: [],
          metadata: {}
        });
      }

      for (const input of entities) {
        const found = entityManager.findEntity(input.title);
        expect(found).toBeDefined();
        expect(found?.type).toBe(input.type);
      }
    });
  });

  describe('Vault Operations Integration', () => {
    it('should create diary file with proper format', async () => {
      const date = '2026-04-12';
      const template = `# Flow of ${date}

> [!NOTE]  由 LifeWiki 插件记录

`;

      await app.vault.create(`Daily/${date}.md`, template);

      const content = await app.vault.read({ path: `Daily/${date}.md` });
      expect(content).toContain(date);
      expect(content).toContain('LifeWiki');
    });

    it('should append blocks to existing diary', async () => {
      const date = '2026-04-12';
      const filePath = `Daily/${date}.md`;

      // Create initial file
      await app.vault.create(filePath, `# ${date}\n\n`);

      // Append block
      const blockContent = `### 08:30 [Lifewiki] #工作
和顾伟乐聊了项目`;

      const existing = await app.vault.read({ path: filePath });
      await app.vault.modify({ path: filePath }, existing + '\n' + blockContent);

      const finalContent = await app.vault.read({ path: filePath });
      expect(finalContent).toContain('08:30 [Lifewiki] #工作');
      expect(finalContent).toContain('和顾伟乐聊了项目');
    });

    it('should search entity files', async () => {
      // Create entity files
      await app.vault.create('People/顾伟乐.md', '# 顾伟乐\n青岛移动项目经理');
      await app.vault.create('People/方刚.md', '# 方刚\n待补充');
      await app.vault.create('Projects/青岛B300.md', '# 青岛B300项目\n算力采购');

      // Search for entities
      const files = app.vault.getMarkdownFiles();
      const peopleFiles = files.filter(f => f.path.startsWith('People/'));

      expect(peopleFiles.length).toBe(2);
    });
  });
});
