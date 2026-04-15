/**
 * Vault Operations Tests
 */

import { Entity, EntityType } from '../entities/types';

// Mock app.vault
const mockVault = {
  read: jest.fn(),
  create: jest.fn(),
  modify: jest.fn(),
  delete: jest.fn(),
  getAbstractFileByPath: jest.fn(),
  getMarkdownFiles: jest.fn(() => []),
  adapter: {
    write: jest.fn()
  },
  on: jest.fn(),
};

// Mock entity manager
const mockEntityManager = {
  indexFile: jest.fn(),
  searchEntities: jest.fn(),
  findEntity: jest.fn(),
  getEntity: jest.fn(),
  getEntitiesByType: jest.fn(),
} as any;

// Mock AI provider
const mockAIProvider = {
  analyzeBlock: jest.fn(),
  isReady: jest.fn(() => true),
};

// Mock skill executor
const mockSkillExecutor = {
  createNewEntitiesWithSkills: jest.fn(),
  analyzeBlock: jest.fn(),
};

// Import after mocking
import { VaultOperations } from './vault';

describe('VaultOperations', () => {
  let vaultOps: VaultOperations;

  beforeEach(() => {
    jest.clearAllMocks();
    vaultOps = new VaultOperations(mockApp, mockEntityManager, mockAIProvider, mockSkillExecutor);
  });

  describe('readDiary', () => {
    it('should read diary file for given date', async () => {
      const mockContent = `### 08:30 [Lifewiki] #工作
和顾伟乐聊了青岛移动B300项目的情况`;

      mockVault.getAbstractFileByPath.mockReturnValue({
        path: 'Daily/2026-04-12.md',
      });
      mockVault.read.mockResolvedValue(mockContent);

      const content = await vaultOps.readDiary('2026-04-12');

      expect(mockVault.getAbstractFileByPath).toHaveBeenCalledWith('Daily/2026-04-12.md');
      expect(content).toBe(mockContent);
    });

    it('should return empty string if diary file not found', async () => {
      mockVault.getAbstractFileByPath.mockReturnValue(null);

      const content = await vaultOps.readDiary('2026-04-13');

      expect(content).toBe('');
    });
  });

  describe('appendBlock', () => {
    it('should append block to existing diary file', async () => {
      const existingContent = `### 08:30 [Lifewiki] #工作
和顾伟乐聊了项目`;

      const mockFile = { path: 'Daily/2026-04-12.md' };
      mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
      mockVault.read.mockResolvedValue(existingContent);

      const block = {
        id: 'block-123',
        timestamp: '09:00',
        content: '新的一条日记',
        parentId: null,
        children: [],
        category: '工作' as const,
        source: 'Lifewiki',
      };

      await vaultOps.appendBlock('2026-04-12', block);

      expect(mockVault.modify).toHaveBeenCalled();
      const modifiedContent = mockVault.modify.mock.calls[0][1];
      expect(modifiedContent).toContain('09:00 [Lifewiki] #工作');
      expect(modifiedContent).toContain('新的一条日记');
    });
  });

  describe('createEntity', () => {
    it('should create entity file with frontmatter and index it', async () => {
      mockVault.getAbstractFileByPath.mockReturnValue(null); // Folder doesn't exist yet
      mockVault.create.mockResolvedValue(undefined);

      const entity: Omit<Entity, 'id' | 'filePath'> = {
        type: 'person',
        title: '顾伟乐',
        titleRaw: '顾伟乐',
        aliases: [],
        tags: ['同事'],
        summary: '青岛移动B300项目对接人',
        confidence: 0.85,
        verificationStatus: 'pending',
        createdAt: '2026-04-12T08:00:00Z',
        createdBy: 'ai',
        lastUpdated: '2026-04-12T08:00:00Z',
        relatedEntities: [],
        interactions: [],
        metadata: { status: 'active', company: '青岛移动' },
      };

      const result = await vaultOps.createEntity(entity);

      expect(mockVault.create).toHaveBeenCalled();
      expect(mockEntityManager.indexFile).toHaveBeenCalled();
      const [filePath, content] = mockVault.create.mock.calls[0];

      expect(filePath).toBe('People/顾伟乐.md');
      expect(content).toContain('entity_type: "person"');
      expect(content).toContain('title: "顾伟乐"');
      expect(content).toContain('confidence: 0.85');
      expect(result.filePath).toBe('People/顾伟乐.md');
    });
  });

  describe('updateEntity', () => {
    it('should update entity file and re-index', async () => {
      const mockEntity: Entity = {
        id: 'entity_123',
        type: 'person',
        filePath: 'People/顾伟乐.md',
        title: '顾伟乐',
        titleRaw: '顾伟乐',
        aliases: [],
        tags: ['同事'],
        summary: '项目对接人',
        confidence: 0.9,
        verificationStatus: 'verified',
        createdAt: '2026-04-12T08:00:00Z',
        createdBy: 'ai',
        lastUpdated: '2026-04-12T08:00:00Z',
        relatedEntities: [],
        interactions: [],
        metadata: {},
      };

      mockEntityManager.indexFile.mockResolvedValue(undefined);
      mockVault.adapter.write.mockResolvedValue(undefined);

      const result = await vaultOps.updateEntity(mockEntity);

      expect(mockVault.adapter.write).toHaveBeenCalledWith(mockEntity.filePath, expect.any(String));
      expect(mockEntityManager.indexFile).toHaveBeenCalledWith(mockEntity.filePath, mockEntity.type);
      expect(result.filePath).toBe(mockEntity.filePath);
    });
  });

  describe('searchEntities', () => {
    it('should search entities by query', async () => {
      const mockEntities: Entity[] = [
        {
          id: 'entity_1',
          type: 'person',
          filePath: 'People/顾伟乐.md',
          title: '顾伟乐',
          titleRaw: '顾伟乐',
          aliases: [],
          tags: ['同事'],
          summary: '青岛移动项目经理',
          confidence: 0.9,
          verificationStatus: 'verified',
          createdAt: '2026-04-12T08:00:00Z',
          createdBy: 'ai',
          lastUpdated: '2026-04-12T08:00:00Z',
          relatedEntities: [],
          interactions: [],
          metadata: {},
        },
      ];

      mockEntityManager.searchEntities.mockReturnValue(mockEntities);

      const results = await vaultOps.searchEntities('青岛');

      expect(mockEntityManager.searchEntities).toHaveBeenCalledWith('青岛', undefined);
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('顾伟乐');
    });
  });

  describe('findEntity', () => {
    it('should find entity by name', async () => {
      const mockEntity: Entity = {
        id: 'entity_1',
        type: 'person',
        filePath: 'People/顾伟乐.md',
        title: '顾伟乐',
        titleRaw: '顾伟乐',
        aliases: [],
        tags: ['同事'],
        summary: '项目对接人',
        confidence: 0.9,
        verificationStatus: 'verified',
        createdAt: '2026-04-12T08:00:00Z',
        createdBy: 'ai',
        lastUpdated: '2026-04-12T08:00:00Z',
        relatedEntities: [],
        interactions: [],
        metadata: {},
      };

      mockEntityManager.findEntity.mockReturnValue(mockEntity);

      const result = await vaultOps.findEntity('顾伟乐');

      expect(mockEntityManager.findEntity).toHaveBeenCalledWith('顾伟乐');
      expect(result).toBe(mockEntity);
    });
  });

  describe('analyzeDiaryContent', () => {
    it('should return analysis result from AI provider', async () => {
      const mockAnalysis = {
        blockId: 'block-123',
        timestamp: new Date().toISOString(),
        category: '工作',
        entities: {
          people: [{ name: '顾伟乐', confidence: 0.95 }],
          projects: [],
          things: [],
          ideas: [],
          knowledge: [],
        },
        needsConfirmation: [],
        aiResponse: '已识别一个人脉',
      };

      mockAIProvider.analyzeBlock.mockResolvedValue(mockAnalysis);

      const result = await vaultOps.analyzeDiaryContent('今天见了顾伟乐');

      expect(mockAIProvider.analyzeBlock).toHaveBeenCalledWith('今天见了顾伟乐');
      expect(mockSkillExecutor.analyzeBlock).toHaveBeenCalled();
      expect(result).toEqual(mockAnalysis);
    });

    it('should handle missing AI provider', async () => {
      const vaultOpsNoAI = new VaultOperations(mockApp, mockEntityManager, null, mockSkillExecutor);

      const result = await vaultOpsNoAI.analyzeDiaryContent('test');

      expect(result.aiResponse).toBe('AI provider not available');
    });
  });

  describe('processDiaryEntry', () => {
    it('should process diary entry and create entities', async () => {
      const mockAnalysis = {
        blockId: 'block-123',
        timestamp: new Date().toISOString(),
        category: '工作',
        entities: {
          people: [{ name: '顾伟乐', confidence: 0.95 }],
          projects: [],
          things: [],
          ideas: [],
          knowledge: [],
        },
        needsConfirmation: [],
        aiResponse: '已识别一个人脉',
      };

      mockAIProvider.analyzeBlock.mockResolvedValue(mockAnalysis);
      mockSkillExecutor.createNewEntitiesWithSkills.mockResolvedValue([]);

      const result = await vaultOps.processDiaryEntry('2026-04-12', '今天见了顾伟乐');

      expect(mockAIProvider.analyzeBlock).toHaveBeenCalledWith('今天见了顾伟乐');
      expect(mockSkillExecutor.createNewEntitiesWithSkills).toHaveBeenCalledWith(
        mockAnalysis,
        mockEntityManager,
        mockApp
      );
      expect(result).toEqual(mockAnalysis);
    });
  });

  describe('searchDiary', () => {
    it('should search diary entries', async () => {
      const mockFiles = [
        { path: 'Daily/2026-04-12.md', content: '今天见了顾伟乐' },
        { path: 'Daily/2026-04-13.md', content: '项目讨论' },
      ];

      mockVault.getMarkdownFiles.mockReturnValue(mockFiles);
      mockVault.read.mockImplementation(async (file) => {
        const mockFile = mockFiles.find(f => f.path === file.path);
        return mockFile?.content || '';
      });

      const results = await vaultOps.searchDiary('顾伟乐');

      expect(results.length).toBe(1);
      expect(results[0].file).toBe('Daily/2026-04-12.md');
    });
  });

  describe('exportEntities', () => {
    it('should export entities as JSON', async () => {
      const mockEntities: Entity[] = [
        {
          id: 'entity_1',
          type: 'person',
          filePath: 'People/顾伟乐.md',
          title: '顾伟乐',
          titleRaw: '顾伟乐',
          aliases: [],
          tags: ['同事'],
          summary: '项目对接人',
          confidence: 0.9,
          verificationStatus: 'verified',
          createdAt: '2026-04-12T08:00:00Z',
          createdBy: 'ai',
          lastUpdated: '2026-04-12T08:00:00Z',
          relatedEntities: [],
          interactions: [],
          metadata: {},
        },
      ];

      mockEntityManager.getEntitiesByType.mockReturnValue(mockEntities);

      const result = await vaultOps.exportEntities('person');
      const parsed = JSON.parse(result);

      expect(parsed).toEqual(mockEntities);
    });

    it('should export all entities when no type specified', async () => {
      const mockEntities: Entity[] = [
        {
          id: 'entity_1',
          type: 'person',
          filePath: 'People/顾伟乐.md',
          title: '顾伟乐',
          titleRaw: '顾伟乐',
          aliases: [],
          tags: ['同事'],
          summary: '项目对接人',
          confidence: 0.9,
          verificationStatus: 'verified',
          createdAt: '2026-04-12T08:00:00Z',
          createdBy: 'ai',
          lastUpdated: '2026-04-12T08:00:00Z',
          relatedEntities: [],
          interactions: [],
          metadata: {},
        },
      ];

      mockEntityManager.getEntitiesByType.mockReturnValue([]);
      mockEntityManager['entityCache'] = new Map([['entity_1', mockEntities[0]]]);

      const result = await vaultOps.exportEntities();
      const parsed = JSON.parse(result);

      expect(parsed).toEqual(mockEntities);
    });
  });

  describe('importEntities', () => {
    it('should import entities', async () => {
      const mockEntities: Entity[] = [
        {
          id: 'entity_1',
          type: 'person',
          filePath: 'People/顾伟乐.md',
          title: '顾伟乐',
          titleRaw: '顾伟乐',
          aliases: [],
          tags: ['同事'],
          summary: '项目对接人',
          confidence: 0.9,
          verificationStatus: 'verified',
          createdAt: '2026-04-12T08:00:00Z',
          createdBy: 'ai',
          lastUpdated: '2026-04-12T08:00:00Z',
          relatedEntities: [],
          interactions: [],
          metadata: {},
        },
      ];

      mockEntityManager.createEntity.mockResolvedValue(mockEntities[0]);

      const result = await vaultOps.importEntities(mockEntities);

      expect(mockEntityManager.createEntity).toHaveBeenCalledWith(mockEntities[0]);
      expect(result).toEqual(mockEntities);
    });

    it('should handle import errors gracefully', async () => {
      const mockEntities: Entity[] = [
        {
          id: 'entity_1',
          type: 'person',
          filePath: 'People/顾伟乐.md',
          title: '顾伟乐',
          titleRaw: '顾伟乐',
          aliases: [],
          tags: ['同事'],
          summary: '项目对接人',
          confidence: 0.9,
          verificationStatus: 'verified',
          createdAt: '2026-04-12T08:00:00Z',
          createdBy: 'ai',
          lastUpdated: '2026-04-12T08:00:00Z',
          relatedEntities: [],
          interactions: [],
          metadata: {},
        },
      ];

      mockEntityManager.createEntity.mockRejectedValue(new Error('Import failed'));

      const result = await vaultOps.importEntities(mockEntities);

      expect(result).toEqual([]);
    });
  });
});