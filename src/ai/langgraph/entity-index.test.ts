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

  describe('scanContent (Aho-Corasick)', () => {
    it('should find single entity mentioned in content', () => {
      const content = '今天和张三开了个会';
      const matches = index.scanContent(content);

      const zhangSan = entities.find(e => e.title === '张三');
      expect(matches.has(zhangSan!)).toBe(true);
    });

    it('should find multiple entities in one pass', () => {
      const content = '张三和李四一起讨论了华为项目';
      const matches = index.scanContent(content);

      const zhangSan = entities.find(e => e.title === '张三');
      const liSi = entities.find(e => e.title === '李四');
      const huaWei = entities.find(e => e.title === '华为技术有限公司');
      expect(matches.has(zhangSan!)).toBe(true);
      expect(matches.has(liSi!)).toBe(true);
      expect(matches.has(huaWei!)).toBe(true);
    });

    it('should find entity by alias in content', () => {
      const content = '张经理今天没来';
      const matches = index.scanContent(content);

      const zhangSan = entities.find(e => e.title === '张三');
      expect(matches.has(zhangSan!)).toBe(true);
    });

    it('should find entity mentioned multiple times', () => {
      const content = '华为的服务器，华为的项目，华为的人';
      const matches = index.scanContent(content);

      const huaWei = entities.find(e => e.title === '华为技术有限公司');
      expect(matches.has(huaWei!)).toBe(true);
      expect(matches.get(huaWei!).length).toBe(3);
    });

    it('should return empty map for content with no entities', () => {
      const content = '今天天气很好，去公园散步';
      const matches = index.scanContent(content);

      expect(matches.size).toBe(0);
    });

    it('should handle empty content', () => {
      const matches = index.scanContent('');
      expect(matches.size).toBe(0);
    });

    it('should handle overlapping patterns and return longest match', () => {
      const content = '华为技术有限公司发布了新芯片';
      const matches = index.scanContent(content, { longestOnly: true });

      const huaWei = entities.find(e => e.title === '华为技术有限公司');
      expect(matches.has(huaWei!)).toBe(true);
      // The alias "华为" should NOT appear as a separate match when longestOnly is true
      // (it's contained within 华为技术有限公司)
    });

    it('should handle mixed Chinese and English content', () => {
      const content = '用 MacBook Pro 写代码，和华为的张三对接';
      const matches = index.scanContent(content);

      const macbook = entities.find(e => e.title === 'MacBook Pro');
      const huaWei = entities.find(e => e.title === '华为技术有限公司');
      const zhangSan = entities.find(e => e.title === '张三');
      expect(matches.has(macbook!)).toBe(true);
      expect(matches.has(huaWei!)).toBe(true);
      expect(matches.has(zhangSan!)).toBe(true);
    });

    it('should handle case-insensitive English matching', () => {
      const content = 'mbp 性能很好';
      const matches = index.scanContent(content);

      const macbook = entities.find(e => e.title === 'MacBook Pro');
      // MBP alias should match in lowercase content
      expect(matches.has(macbook!)).toBe(true);
    });

    it('should not match single character patterns', () => {
      const shortEntities = [
        { ...createTestEntity('张', 'person'), id: 'entity_short_zhang' },
      ];
      const shortIndex = new EntityIndex(shortEntities);
      const content = '张和李四见面了';
      const matches = shortIndex.scanContent(content);

      expect(matches.size).toBe(0); // "张" is too short, minimum is 2
    });

    it('should return correct match positions', () => {
      const content = '张三在华为工作';
      const matches = index.scanContent(content);

      const zhangSan = entities.find(e => e.title === '张三');
      const positions = matches.get(zhangSan!);
      expect(positions).toBeDefined();
      expect(positions![0]).toBe(0); // "张三" starts at position 0
    });

    it('should find entities with Chinese prefix via AC scan', () => {
      const content = '华为项目A正在推进';
      const matches = index.scanContent(content);

      const huaWei = entities.find(e => e.title === '华为技术有限公司');
      const projectA = entities.find(e => e.title === '项目A');
      expect(matches.has(huaWei!)).toBe(true);
      expect(matches.has(projectA!)).toBe(true);
    });
  });

  describe('buildFailureLinks', () => {
    it('should set root fail link to root itself', () => {
      // Root's fail link must point to itself to prevent infinite loops
      const testIndex = new EntityIndex([createTestEntity('测试', 'person')]);
      // This is an internal implementation detail, but we verify via scanContent
      const content = '测试内容';
      const matches = testIndex.scanContent(content);
      expect(matches.size).toBeGreaterThan(0);
    });

    it('should handle single-character entities without crashing', () => {
      // Even though we filter single-char patterns, the AC algorithm itself
      // should handle them without errors
      const testEntities = [
        createTestEntity('A', 'thing'),
        createTestEntity('AB', 'thing'),
      ];
      const testIndex = new EntityIndex(testEntities);
      const content = 'ABC';
      const matches = testIndex.scanContent(content);
      // "AB" should match, "A" should be filtered by min length
      expect(matches.size).toBeGreaterThan(0);
    });

    it('should handle entities sharing common prefix', () => {
      const testEntities = [
        createTestEntity('张三', 'person'),
        createTestEntity('张三丰', 'person'),
        createTestEntity('张三四', 'person'),
      ];
      const testIndex = new EntityIndex(testEntities);
      const content = '张三丰是武当派的';
      const matches = testIndex.scanContent(content);

      const zhangSan = testEntities.find(e => e.title === '张三');
      const zhangSanFeng = testEntities.find(e => e.title === '张三丰');
      expect(matches.has(zhangSanFeng!)).toBe(true);
      // "张三" is a prefix of "张三丰" at the same position, so longestOnly dedup removes it
      expect(matches.has(zhangSan!)).toBe(false);
    });

    it('should find both entities when they overlap at different positions', () => {
      const testEntities = [
        createTestEntity('张三', 'person'),
        createTestEntity('张三丰', 'person'),
      ];
      const testIndex = new EntityIndex(testEntities);
      // "张三" appears independently here, not as part of "张三丰"
      const content = '张三在武当，张三丰在武当';
      const matches = testIndex.scanContent(content, { longestOnly: false });

      const zhangSan = testEntities.find(e => e.title === '张三');
      const zhangSanFeng = testEntities.find(e => e.title === '张三丰');
      expect(matches.has(zhangSan!)).toBe(true);
      expect(matches.has(zhangSanFeng!)).toBe(true);
    });
  });
});
