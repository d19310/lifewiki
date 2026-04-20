/**
 * Analysis Panel Tests
 * Tests for AI analysis panel display logic
 */

import { AnalysisResult, EntityPreview } from '../entities/types';
import { generateAnalysisSummary, type AnalysisSummary, type EntityDisplayItem } from './analysis-panel';

/**
 * Create mock entity preview
 */
function createEntityPreview(overrides: Partial<EntityPreview> = {}): EntityPreview {
  return {
    type: 'person',
    name: '测试人物',
    confidence: 0.85,
    context: '测试上下文',
    isArchived: false,
    newEntity: true,
    ...overrides
  };
}

/**
 * Create mock AnalysisResult
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

describe('Analysis Panel', () => {
  describe('generateAnalysisSummary', () => {
    it('should return empty summary when no entities', () => {
      const result = createMockAnalysisResult();
      const summary = generateAnalysisSummary(result);

      expect(summary.totalEntities).toBe(0);
      expect(summary.people.length).toBe(0);
      expect(summary.projects.length).toBe(0);
    });

    it('should count people entities correctly', () => {
      const result = createMockAnalysisResult({
        entities: {
          people: [
            createEntityPreview({ type: 'person', name: '顾伟乐' }),
            createEntityPreview({ type: 'person', name: 'Alan' })
          ],
          projects: [],
          things: [],
          ideas: [],
          knowledge: []
        }
      });

      const summary = generateAnalysisSummary(result);

      expect(summary.totalEntities).toBe(2);
      expect(summary.people.length).toBe(2);
      expect(summary.people[0].name).toBe('顾伟乐');
      expect(summary.people[1].name).toBe('Alan');
    });

    it('should identify archived vs new entities', () => {
      const result = createMockAnalysisResult({
        entities: {
          people: [
            createEntityPreview({ name: '已归档人物', isArchived: true, newEntity: false }),
            createEntityPreview({ name: '新人物', isArchived: false, newEntity: true })
          ],
          projects: [],
          things: [],
          ideas: [],
          knowledge: []
        }
      });

      const summary = generateAnalysisSummary(result);

      expect(summary.archivedCount).toBe(1);
      expect(summary.newCount).toBe(1);
    });

    it('should count all entity types', () => {
      const result = createMockAnalysisResult({
        entities: {
          people: [createEntityPreview({ name: '人物1' })],
          projects: [
            createEntityPreview({ type: 'project', name: '项目1' }),
            createEntityPreview({ type: 'project', name: '项目2' })
          ],
          things: [createEntityPreview({ type: 'thing', name: '物品1' })],
          ideas: [createEntityPreview({ type: 'idea', name: '想法1' })],
          knowledge: [createEntityPreview({ type: 'knowledge', name: '知识1' })]
        }
      });

      const summary = generateAnalysisSummary(result);

      expect(summary.totalEntities).toBe(6);
      expect(summary.people.length).toBe(1);
      expect(summary.projects.length).toBe(2);
      expect(summary.things.length).toBe(1);
      expect(summary.ideas.length).toBe(1);
      expect(summary.knowledge.length).toBe(1);
    });

    it('should mark new entities correctly', () => {
      const result = createMockAnalysisResult({
        entities: {
          people: [
            createEntityPreview({ name: '已归档', isArchived: true, newEntity: false }),
            createEntityPreview({ name: '未归档', isArchived: false, newEntity: true })
          ],
          projects: [],
          things: [],
          ideas: [],
          knowledge: []
        }
      });

      const summary = generateAnalysisSummary(result);

      const archived = summary.people.find(p => p.name === '已归档');
      const newEntity = summary.people.find(p => p.name === '未归档');

      expect(archived?.isArchived).toBe(true);
      expect(newEntity?.newEntity).toBe(true);
    });

    it('should include confidence scores', () => {
      const result = createMockAnalysisResult({
        entities: {
          people: [
            createEntityPreview({ name: '高置信度', confidence: 0.95 }),
            createEntityPreview({ name: '低置信度', confidence: 0.5 })
          ],
          projects: [],
          things: [],
          ideas: [],
          knowledge: []
        }
      });

      const summary = generateAnalysisSummary(result);

      expect(summary.people[0].confidence).toBe(0.95);
      expect(summary.people[1].confidence).toBe(0.5);
    });

    it('should handle empty entity arrays', () => {
      const result = createMockAnalysisResult({
        entities: {
          people: [],
          projects: [],
          things: [],
          ideas: [],
          knowledge: []
        }
      });

      const summary = generateAnalysisSummary(result);

      expect(summary.totalEntities).toBe(0);
      expect(summary.archivedCount).toBe(0);
      expect(summary.newCount).toBe(0);
    });

    it('should include context in entity display items', () => {
      const result = createMockAnalysisResult({
        entities: {
          people: [
            createEntityPreview({ name: '顾伟乐', context: '青岛移动项目经理', confidence: 0.9, isArchived: true })
          ],
          projects: [],
          things: [],
          ideas: [],
          knowledge: []
        }
      });

      const summary = generateAnalysisSummary(result);

      expect(summary.people[0].context).toBe('青岛移动项目经理');
      expect(summary.people[0].displayText).toContain('顾伟乐');
      expect(summary.people[0].statusLabel).toBe('已归档');
    });

    it('should show different status labels for archived vs new entities', () => {
      const archivedResult = createMockAnalysisResult({
        entities: {
          people: [createEntityPreview({ name: '已归档', isArchived: true, newEntity: false })],
          projects: [],
          things: [],
          ideas: [],
          knowledge: []
        }
      });

      const newResult = createMockAnalysisResult({
        entities: {
          people: [createEntityPreview({ name: '未归档', isArchived: false, newEntity: true })],
          projects: [],
          things: [],
          ideas: [],
          knowledge: []
        }
      });

      const archivedSummary = generateAnalysisSummary(archivedResult);
      const newSummary = generateAnalysisSummary(newResult);

      expect(archivedSummary.people[0].statusLabel).toBe('已归档');
      expect(newSummary.people[0].statusLabel).toBe('未归档');
    });
  });

  describe('EntityDisplayItem structure', () => {
    it('should include all required display fields', () => {
      const result = createMockAnalysisResult({
        entities: {
          people: [createEntityPreview({ name: '测试', context: '上下文', confidence: 0.8 })],
          projects: [],
          things: [],
          ideas: [],
          knowledge: []
        }
      });

      const summary = generateAnalysisSummary(result);
      const item = summary.people[0];

      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('type');
      expect(item).toHaveProperty('confidence');
      expect(item).toHaveProperty('context');
      expect(item).toHaveProperty('isArchived');
      expect(item).toHaveProperty('newEntity');
      expect(item).toHaveProperty('displayText');
      expect(item).toHaveProperty('statusLabel');
    });
  });
});
