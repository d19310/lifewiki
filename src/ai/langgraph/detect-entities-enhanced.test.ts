/**
 * detect_entities Enhanced Tests
 * Tests for enhanced detection with inferred type auto-confirmation
 */

import { detectEntitiesExecutor, clearEntityIndexCache, DetectEntitiesInput } from '../../../.lifewiki/skills/detect_entities/executor';

// Mock EntityManager
function createMockEntityManager(entities: any[] = []) {
  return {
    ensureInitialized: jest.fn().mockResolvedValue(undefined),
    getEntitiesByType: jest.fn().mockImplementation((type: string) => {
      return Promise.resolve(entities.filter(e => e.type === type));
    }),
    getEntity: jest.fn().mockImplementation((id: string) => {
      return entities.find(e => e.id === id) || null;
    }),
    findEntity: jest.fn().mockImplementation((name: string) => {
      return entities.find(e => e.title === name || e.aliases?.includes(name)) || null;
    }),
    createEntity: jest.fn().mockImplementation((entity) => {
      return Promise.resolve({ ...entity, id: `mock-${Date.now()}` });
    }),
    addInteraction: jest.fn().mockResolvedValue(undefined),
    updateEntity: jest.fn().mockResolvedValue({})
  };
}

const mockEntities = [
  {
    id: 'entity-zhangsan',
    type: 'person',
    title: '张三',
    titleRaw: '张三',
    aliases: ['张经理'],
    tags: [],
    summary: '某科技公司项目经理',
    confidence: 0.9,
    verificationStatus: 'verified' as const,
    createdAt: '2024-01-01T00:00:00Z',
    createdBy: 'ai',
    lastUpdated: '2024-01-01T00:00:00Z',
    relatedEntities: [],
    interactions: [],
    metadata: {}
  },
  {
    id: 'entity-huawei',
    type: 'thing',
    title: '华为技术有限公司',
    titleRaw: '华为技术有限公司',
    aliases: ['华为', 'HW'],
    tags: [],
    summary: '通信设备公司',
    confidence: 0.9,
    verificationStatus: 'verified' as const,
    createdAt: '2024-01-01T00:00:00Z',
    createdBy: 'ai',
    lastUpdated: '2024-01-01T00:00:00Z',
    relatedEntities: [],
    interactions: [],
    metadata: {}
  }
];

describe('detect_entities executor - enhanced features', () => {
  beforeEach(() => {
    clearEntityIndexCache();
  });

  describe('inferred type auto-confirmation', () => {
    it('should include autoConfirmed=true for high confidence inferred types', async () => {
      const mockManager = createMockEntityManager([]);
      const context = { entityManager: mockManager };

      // Use text with project keyword - 项目 should get high confidence
      const input: DetectEntitiesInput = {
        diaryContent: 'The Alpha项目 is progressing well.',
        options: {}
      };

      const result = await detectEntitiesExecutor(context as any, input);

      expect(result.success).toBe(true);
      const data = result.data as any;

      // Find entity with 项目 in name
      const projectEntity = data.newEntities?.find((e: any) => e.name?.includes('项目'));

      expect(projectEntity).toBeDefined();
      expect(projectEntity.inferredType).toBe('project');
      expect(projectEntity.confidence).toBeGreaterThanOrEqual(0.8);
      expect(projectEntity.autoConfirmed).toBe(true);
    });

    it('should mark English capitalized names with low confidence', async () => {
      const mockManager = createMockEntityManager([]);
      const context = { entityManager: mockManager };

      // English names without strong patterns
      const input: DetectEntitiesInput = {
        diaryContent: 'Met with Alice and Bob today.',
        options: {}
      };

      const result = await detectEntitiesExecutor(context as any, input);

      expect(result.success).toBe(true);
      const data = result.data as any;

      const alice = data.newEntities?.find((e: any) => e.name === 'Alice');

      expect(alice).toBeDefined();
      // English names without strong patterns get low confidence
      expect(alice.confidence).toBeLessThan(0.8);
      expect(alice.autoConfirmed).toBe(false);
    });

    it('should handle partial failures in batch add_interaction', async () => {
      const mockManager = createMockEntityManager(mockEntities.slice(0, 1)); // Only one entity
      mockManager.addInteraction = jest.fn()
        .mockResolvedValueOnce(undefined)  // First call succeeds
        .mockRejectedValueOnce(new Error('Entity not found')); // Second fails
      const context = { entityManager: mockManager, blockId: 'test-block' };

      const input: DetectEntitiesInput = {
        diaryContent: 'Meeting.',
        options: {
          addInteractionsToArchived: [
            { entityId: 'entity-zhangsan', content: 'Discussion 1' },
            { entityId: 'non-existent-entity', content: 'Discussion 2' }
          ]
        }
      };

      const result = await detectEntitiesExecutor(context as any, input);

      expect(result.success).toBe(true);
      const data = result.data as any;

      expect(data.interactionResults).toBeDefined();
      expect(data.interactionResults.length).toBe(2);
      // First should succeed, second should fail gracefully
      expect(data.interactionResults[0].success).toBe(true);
      expect(data.interactionResults[1].success).toBe(false);
      expect(data.interactionResults[1].error).toBeDefined();
    });
  });
});