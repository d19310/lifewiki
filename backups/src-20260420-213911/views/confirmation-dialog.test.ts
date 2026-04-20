/**
 * Confirmation Dialog Tests
 * Tests for AI confirmation dialog logic
 */

import { AnalysisResult } from '../entities/types';
import { generateConfirmationItems, createEntityFromConfirmation, type ConfirmationItem } from './confirmation-dialog';

/**
 * Generate mock AnalysisResult for testing
 */
function createMockAnalysisResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    blockId: 'block-123',
    timestamp: new Date().toISOString(),
    category: '工作',
    entities: {
      people: [],
      projects: [],
      things: [],
      ideas: [],
      knowledge: []
    },
    needsConfirmation: [],
    aiResponse: '测试回复',
    ...overrides
  };
}

describe('Confirmation Dialog', () => {
  describe('generateConfirmationItems', () => {
    it('should generate confirmation items for new people entities', () => {
      const result = createMockAnalysisResult({
        entities: {
          people: [
            { type: 'person', name: '顾伟乐', confidence: 0.85, context: '青岛移动项目经理', isArchived: false, newEntity: true },
            { type: 'person', name: 'Alan', confidence: 0.7, context: '技术专家', isArchived: false, newEntity: true }
          ],
          projects: [],
          things: [],
          ideas: [],
          knowledge: []
        },
        needsConfirmation: ['person:顾伟乐', 'person:Alan']
      });

      const items = generateConfirmationItems(result);

      expect(items.length).toBe(2);
      expect(items[0].entityType).toBe('person');
      expect(items[0].name).toBe('顾伟乐');
      expect(items[0].confidence).toBe(0.85);
      expect(items[1].name).toBe('Alan');
    });

    it('should generate confirmation items for new project entities', () => {
      const result = createMockAnalysisResult({
        entities: {
          people: [],
          projects: [
            { type: 'project', name: '青岛移动B300项目', confidence: 0.9, context: '算力采购项目', isArchived: false, newEntity: true }
          ],
          things: [],
          ideas: [],
          knowledge: []
        },
        needsConfirmation: ['project:青岛移动B300项目']
      });

      const items = generateConfirmationItems(result);

      expect(items.length).toBe(1);
      expect(items[0].entityType).toBe('project');
      expect(items[0].name).toBe('青岛移动B300项目');
    });

    it('should generate confirmation items for new things entities', () => {
      const result = createMockAnalysisResult({
        entities: {
          people: [],
          projects: [],
          things: [
            { type: 'thing', name: 'Hermes Agent', confidence: 0.75, context: 'Agent框架', isArchived: false, newEntity: true }
          ],
          ideas: [],
          knowledge: []
        },
        needsConfirmation: ['thing:Hermes Agent']
      });

      const items = generateConfirmationItems(result);

      expect(items.length).toBe(1);
      expect(items[0].entityType).toBe('thing');
      expect(items[0].name).toBe('Hermes Agent');
    });

    it('should generate confirmation items for new ideas entities', () => {
      const result = createMockAnalysisResult({
        entities: {
          people: [],
          projects: [],
          things: [],
          ideas: [
            { type: 'idea', name: '跨平台记忆系统', confidence: 0.8, context: '架构设计想法', isArchived: false, newEntity: true }
          ],
          knowledge: []
        },
        needsConfirmation: ['idea:跨平台记忆系统']
      });

      const items = generateConfirmationItems(result);

      expect(items.length).toBe(1);
      expect(items[0].entityType).toBe('idea');
      expect(items[0].name).toBe('跨平台记忆系统');
    });

    it('should generate confirmation items for new knowledge entities', () => {
      const result = createMockAnalysisResult({
        entities: {
          people: [],
          projects: [],
          things: [],
          ideas: [],
          knowledge: [
            { type: 'knowledge', name: 'Hermes文档', confidence: 0.95, context: '官方用户指南', isArchived: false, newEntity: true }
          ]
        },
        needsConfirmation: ['knowledge:Hermes文档']
      });

      const items = generateConfirmationItems(result);

      expect(items.length).toBe(1);
      expect(items[0].entityType).toBe('knowledge');
      expect(items[0].name).toBe('Hermes文档');
    });

    it('should return empty array when no new entities', () => {
      const result = createMockAnalysisResult({
        entities: {
          people: [
            { type: 'person', name: '顾伟乐', confidence: 0.85, context: '青岛移动', isArchived: true, newEntity: false }
          ],
          projects: [],
          things: [],
          ideas: [],
          knowledge: []
        },
        needsConfirmation: []
      });

      const items = generateConfirmationItems(result);

      expect(items.length).toBe(0);
    });

    it('should return empty array when needsConfirmation is empty', () => {
      const result = createMockAnalysisResult({
        entities: {
          people: [
            { type: 'person', name: '新朋友', confidence: 0.8, context: '今天认识', isArchived: false, newEntity: true }
          ],
          projects: [],
          things: [],
          ideas: [],
          knowledge: []
        },
        needsConfirmation: []
      });

      const items = generateConfirmationItems(result);

      expect(items.length).toBe(0);
    });

    it('should handle category confirmation when category is pending', () => {
      const result = createMockAnalysisResult({
        category: '待确认',
        entities: {
          people: [],
          projects: [],
          things: [],
          ideas: [],
          knowledge: []
        },
        needsConfirmation: []
      });

      const items = generateConfirmationItems(result);

      expect(items.some(item => item.entityType === 'category')).toBe(true);
    });

    it('should include confidence and context in confirmation items', () => {
      const result = createMockAnalysisResult({
        entities: {
          people: [
            { type: 'person', name: '测试人物', confidence: 0.92, context: '详细上下文信息', isArchived: false, newEntity: true }
          ],
          projects: [],
          things: [],
          ideas: [],
          knowledge: []
        },
        needsConfirmation: ['person:测试人物']
      });

      const items = generateConfirmationItems(result);

      expect(items[0].confidence).toBe(0.92);
      expect(items[0].context).toBe('详细上下文信息');
    });
  });

  describe('createEntityFromConfirmation', () => {
    it('should create entity input from confirmation item', () => {
      const item: ConfirmationItem = {
        id: 'confirm-1',
        entityType: 'person',
        name: '顾伟乐',
        confidence: 0.85,
        context: '青岛移动项目经理',
        blockId: 'block-123'
      };

      const entityInput = createEntityFromConfirmation(item);

      expect(entityInput.type).toBe('person');
      expect(entityInput.title).toBe('顾伟乐');
      expect(entityInput.titleRaw).toBe('顾伟乐');
      expect(entityInput.summary).toBe('青岛移动项目经理');
      expect(entityInput.confidence).toBe(0.85);
      expect(entityInput.verificationStatus).toBe('pending');
      expect(entityInput.createdBy).toBe('human');
      expect(entityInput.interactions[0].type).toBe('user_feedback');
    });

    it('should create project entity with correct metadata', () => {
      const item: ConfirmationItem = {
        id: 'confirm-2',
        entityType: 'project',
        name: '青岛B300项目',
        confidence: 0.9,
        context: '算力采购项目',
        blockId: 'block-456'
      };

      const entityInput = createEntityFromConfirmation(item);

      expect(entityInput.type).toBe('project');
      expect(entityInput.metadata.source).toBe('diary');
    });

    it('should include timestamp and sourceBlockId in interaction', () => {
      const item: ConfirmationItem = {
        id: 'confirm-3',
        entityType: 'thing',
        name: 'MacBook Pro',
        confidence: 0.75,
        context: '工作电脑',
        blockId: 'block-789'
      };

      const entityInput = createEntityFromConfirmation(item);

      expect(entityInput.interactions[0].sourceBlockId).toBe('block-789');
      expect(entityInput.interactions[0].timestamp).toBeDefined();
    });
  });
});
