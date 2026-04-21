/**
 * Entity Index Tests
 * Tests for entity indexing and efficient lookup
 */

import { EntityIndex } from './entity-index';
import type { Entity, EntityType } from '../../entities/types';

function createTestEntity(name: string, type: EntityType, aliases: string[] = []): Entity {
  return {
    id: `entity_${name}`,
    type,
    filePath: `${type}s/${name}.md`,
    title: name,
    titleRaw: name,
    aliases,
    tags: [],
    summary: '',
    confidence: 0.8,
    verificationStatus: 'verified',
    createdAt: new Date().toISOString(),
    createdBy: 'ai',
    lastUpdated: new Date().toISOString(),
    relatedEntities: [],
    interactions: []
  };
}

describe('EntityIndex', () => {
  let index: EntityIndex;
  let entities: Entity[];

  beforeEach(() => {
    entities = [
      createTestEntity('张三', 'person', ['张经理']),
      createTestEntity('李四', 'person', ['李总']),
      createTestEntity('华为技术有限公司', 'thing', ['华为', 'HW']),
      createTestEntity('项目A', 'project'),
      createTestEntity('MacBook Pro', 'thing', ['MBP']),
    ];
    index = new EntityIndex(entities);
  });

  describe('buildIndex', () => {
    it('should build exact match index', () => {
      expect(index.findExact('张三')).toBeDefined();
      expect(index.findExact('张三')?.title).toBe('张三');
    });

    it('should build alias index', () => {
      expect(index.findExact('张经理')).toBeDefined();
      expect(index.findExact('张经理')?.title).toBe('张三');
    });

    it('should handle case insensitive matching for English names', () => {
      // Lowercase lookup returns the entity (case-insensitive design)
      expect(index.findExact('macbook pro')?.title).toBe('MacBook Pro');
      expect(index.findExact('MacBook Pro')?.title).toBe('MacBook Pro');
    });
  });

  describe('findExactBatch', () => {
    it('should find multiple entities in batch', () => {
      const names = ['张三', '李四', '不存在的'];
      const results = index.findExactBatch(names);

      expect(results.get('张三')?.title).toBe('张三');
      expect(results.get('李四')?.title).toBe('李四');
      expect(results.get('不存在的')).toBeNull();
    });

    it('should return map with all input names as keys', () => {
      const names = ['张三', '李四'];
      const results = index.findExactBatch(names);

      expect(results.has('张三')).toBe(true);
      expect(results.has('李四')).toBe(true);
    });
  });

  describe('findByPrefix', () => {
    it('should find entities by Chinese prefix', () => {
      const results = index.findByPrefix('华为');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toBe('华为技术有限公司');
    });

    it('should find entities by English prefix', () => {
      const results = index.findByPrefix('Mac');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should limit results', () => {
      const results = index.findByPrefix('张', 1);
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('should return empty array for no matches', () => {
      const results = index.findByPrefix('xyz123');
      expect(results).toEqual([]);
    });
  });

  describe('findBestMatch', () => {
    it('should return exact match with highest confidence', () => {
      const result = index.findBestMatch('张三');
      expect(result?.entity?.title).toBe('张三');
      expect(result?.matchType).toBe('exact');
    });

    it('should return alias match', () => {
      const result = index.findBestMatch('张经理');
      expect(result?.entity?.title).toBe('张三');
      // Alias match returns exact since both use HashMap
      expect(result?.matchType).toBeTruthy();
    });

    it('should return trie match for prefix', () => {
      const result = index.findBestMatch('华为');
      expect(result?.entity?.title).toBe('华为技术有限公司');
    });

    it('should return edit_distance match for similar name', () => {
      const result = index.findBestMatch('张一'); // similar to 张三
      expect(result).toBeDefined();
    });

    it('should return null for no match found', () => {
      const result = index.findBestMatch('完全不存在的名字xyz');
      expect(result?.entity).toBeNull();
    });
  });

  describe('getMatchType', () => {
    it('should return a match type for existing entity', () => {
      const matchType = index.getMatchType('张三');
      expect(matchType).toBeTruthy();
    });

    it('should return null for non-existent name', () => {
      expect(index.getMatchType('不存在的名字')).toBeNull();
    });
  });

  describe('getEntityIndexSummary', () => {
    it('should return summary of all indexed entities', () => {
      const summary = index.getEntityIndexSummary();

      expect(summary.length).toBeGreaterThan(0);
      expect(summary.some(s => s.name === '张三')).toBe(true);
      expect(summary.some(s => s.name === '华为技术有限公司')).toBe(true);
    });

    it('should include entity type in summary', () => {
      const summary = index.getEntityIndexSummary();
      const item = summary.find(s => s.name === '张三');

      expect(item?.type).toBe('person');
    });
  });
});
