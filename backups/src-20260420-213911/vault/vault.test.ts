/**
 * Vault Operations Tests
 */

import { Entity, EntityType } from '../entities/types';
import { VaultOperations as VaultOps, ENTITY_FOLDERS } from './vault';

// Mock app
const mockApp = {
  vault: {
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
    createFolder: jest.fn(),
  },
};

// Mock entity manager
const mockEntityManager = {
  indexFile: jest.fn(),
  searchEntities: jest.fn(),
  findEntity: jest.fn(),
  getEntity: jest.fn(),
  getEntitiesByType: jest.fn(),
  createEntity: jest.fn(),
};

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

// Track getAbstractFileByPath calls to simulate file existence
const getAbstractFileByPathMock = jest.fn();
mockApp.vault.getAbstractFileByPath = getAbstractFileByPathMock;

// Import after mocking
import { VaultOperations as VaultOps } from './vault';

describe('VaultOperations', () => {
  let vaultOps: VaultOperations;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock implementation to handle all calls fresh
    mockApp.vault.create.mockReset();
    mockApp.vault.createFolder.mockReset();
    mockEntityManager.indexFile.mockReset();
    mockEntityManager.createEntity.mockReset();

    // Track getAbstractFileByPath calls to simulate file existence
    getAbstractFileByPathMock.mockReset();

    // Default implementation: return null for folder checks, file for everything else
    getAbstractFileByPathMock.mockImplementation((path: string) => {
      // If path is a folder name, return null (folder doesn't exist yet)
      if (path === 'People' || path === 'Projects' || path === 'Things' || path === 'Ideas' || path === 'Knowledge') {
        return null;
      }
      // For all other paths (including file paths), return the file object
      return { path };
    });

    vaultOps = new VaultOps(mockApp, mockEntityManager, mockAIProvider, mockSkillExecutor);
  });

  describe('readDiary', () => {
    it('should read diary file for given date', async () => {
      const mockContent = `### 08:30 [Lifewiki] #工作
和顾伟乐聊了青岛移动B300项目的情况`;

      mockApp.vault.getAbstractFileByPath.mockReturnValue({
        path: 'Daily/2026-04-12.md',
      });
      mockApp.vault.read.mockResolvedValue(mockContent);

      const content = await vaultOps.readDiary('2026-04-12');

      expect(mockApp.vault.getAbstractFileByPath).toHaveBeenCalledWith('Daily/2026-04-12.md');
      expect(content).toBe(mockContent);
    });

    it('should return empty string if diary file not found', async () => {
      mockApp.vault.getAbstractFileByPath.mockReturnValue(null);

      const content = await vaultOps.readDiary('2026-04-13');

      expect(content).toBe('');
    });
  });

  describe('appendBlock', () => {
    it('should append block to existing diary file', async () => {
      const existingContent = `### 08:30 [Lifewiki] #工作
和顾伟乐聊了项目`;

      const mockFile = { path: 'Daily/2026-04-12.md' };
      mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
      mockApp.vault.read.mockResolvedValue(existingContent);

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

      expect(mockApp.vault.modify).toHaveBeenCalled();
      const modifiedContent = mockApp.vault.modify.mock.calls[0][1];
      expect(modifiedContent).toContain('09:00 [Lifewiki] #工作');
      expect(modifiedContent).toContain('新的一条日记');
    });
  });

  describe('createEntity', () => {
    it('should create entity file with frontmatter and index it', async () => {
      // Create a mock TFile-like object
      const mockFileObj = {
        path: 'People/顾伟乐.md',
        basename: '顾伟乐.md',
      };

      // getAbstractFileByPath is already mocked in beforeEach to simulate file existence
    // after folder creation (calls 1-2 return null, subsequent calls return the file)
    mockApp.vault.create.mockResolvedValue(undefined);
    mockEntityManager.indexFile.mockResolvedValue(undefined);

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

      expect(mockApp.vault.create).toHaveBeenCalled();
      expect(mockEntityManager.indexFile).toHaveBeenCalled();
      const [filePathResult, content] = mockApp.vault.create.mock.calls[0];

      expect(filePathResult).toBe('People/顾伟乐.md');
      expect(content).toContain('entity_type: "person"');
      expect(content).toContain('title: "顾伟乐"');
      expect(content).toContain('confidence: 0.85');
      expect(result.filePath).toBe('People/顾伟乐.md');
      // indexFile should be called with a TFile that has the correct path
      const indexFileCall = mockEntityManager.indexFile.mock.calls[0];
      expect(indexFileCall[0].path).toBe('People/顾伟乐.md');
      expect(indexFileCall[1]).toBe('person');
    });
  });

  describe('updateEntity', () => {
    it('should update entity file and re-index', async () => {
      // Setup mock to return the file object when getAbstractFileByPath is called
      const mockFileObj = {
        path: 'People/顾伟乐.md',
        basename: '顾伟乐.md',
      };
      mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFileObj);

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
      mockApp.vault.adapter.write.mockResolvedValue(undefined);

      const result = await vaultOps.updateEntity(mockEntity);

      expect(mockApp.vault.adapter.write).toHaveBeenCalledWith(mockEntity.filePath, expect.any(String));
      // Check that indexFile was called with the correct arguments
      const indexFileCall = mockEntityManager.indexFile.mock.calls[0];
      expect(indexFileCall[0].path).toBe(mockEntity.filePath);
      expect(indexFileCall[1]).toBe(mockEntity.type);
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
      expect(mockSkillExecutor.analyzeBlock).not.toHaveBeenCalled();
      expect(result).toEqual(mockAnalysis);
    });

    it('should handle missing AI provider', async () => {
      const vaultOpsNoAI = new VaultOps(mockApp, mockEntityManager, null, mockSkillExecutor);

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

      mockApp.vault.getMarkdownFiles.mockReturnValue(mockFiles);
      mockApp.vault.read.mockImplementation(async (file) => {
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

      // importEntities should pass entities without id and filePath to createEntity
      expect(mockEntityManager.createEntity).toHaveBeenCalledWith({
        type: 'person',
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
      } as EntityCreateInput);
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