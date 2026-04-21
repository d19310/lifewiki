/**
 * Entity Index
 * Efficient entity lookup using HashMap, Trie, and string matching
 */

import type { Entity, EntityType } from '../../entities/types';
import { levenshteinDistance, isSimilar } from './string-matcher';

export interface MatchResult {
  entity: Entity | null;
  matchType: 'exact' | 'alias' | 'simplified' | 'traditional' | 'trie' | 'edit_distance' | null;
  confidence: number;
}

export interface EntityIndexSummary {
  name: string;
  type: EntityType;
}

/**
 * Trie Node for prefix matching
 */
class TrieNode {
  children: Map<string, TrieNode> = new Map();
  entity: Entity | null = null;
  isEndOfWord: boolean = false;
}

/**
 * Entity Index for efficient entity lookup
 * Combines HashMap for O(1) exact lookup, Trie for prefix matching
 */
export class EntityIndex {
  // HashMap: lowercase name -> entity (for exact matching)
  private nameToEntity: Map<string, Entity> = new Map();

  // Alias HashMap: lowercase alias -> entity
  private aliasToEntity: Map<string, Entity> = new Map();

  // Trie: for prefix matching
  private trieRoot: TrieNode = new TrieNode();

  // All entities for iteration
  private allEntities: Entity[] = [];

  constructor(entities: Entity[] = []) {
    if (entities.length > 0) {
      this.buildIndex(entities);
    }
  }

  /**
   * Build all indexes from entity list
   */
  buildIndex(entities: Entity[]): void {
    this.allEntities = entities;
    this.nameToEntity.clear();
    this.aliasToEntity.clear();
    this.trieRoot = new TrieNode();

    for (const entity of entities) {
      // Add to exact match index (case-sensitive for proper names)
      this.nameToEntity.set(entity.title, entity);

      // Also add lowercase version for case-insensitive lookup
      this.nameToEntity.set(entity.title.toLowerCase(), entity);

      // Add aliases
      for (const alias of entity.aliases) {
        this.aliasToEntity.set(alias.toLowerCase(), entity);
        this.aliasToEntity.set(alias, entity);
      }

      // Build Trie with entity title
      this.insertIntoTrie(entity.title, entity);

      // Also insert aliases into trie
      for (const alias of entity.aliases) {
        this.insertIntoTrie(alias, entity);
      }
    }
  }

  /**
   * Insert a string into the Trie
   */
  private insertIntoTrie(str: string, entity: Entity): void {
    let node = this.trieRoot;

    for (const char of str) {
      if (!node.children.has(char)) {
        node.children.set(char, new TrieNode());
      }
      node = node.children.get(char)!;
    }

    node.isEndOfWord = true;
    node.entity = entity;
  }

  /**
   * Find exact match (HashMap lookup)
   */
  findExact(name: string): Entity | null {
    // Try case-sensitive first
    let entity = this.nameToEntity.get(name) || null;

    // If not found, try case-insensitive
    if (!entity) {
      entity = this.nameToEntity.get(name.toLowerCase()) || null;
    }

    // If still not found, try alias
    if (!entity) {
      entity = this.aliasToEntity.get(name.toLowerCase()) || null;
    }

    return entity;
  }

  /**
   * Batch exact lookup - O(k) where k = number of names
   */
  findExactBatch(names: string[]): Map<string, Entity | null> {
    const results = new Map<string, Entity | null>();

    for (const name of names) {
      results.set(name, this.findExact(name));
    }

    return results;
  }

  /**
   * Find entities by prefix using Trie - O(m) where m = prefix length
   */
  findByPrefix(prefix: string, limit: number = 5): Entity[] {
    let node = this.trieRoot;
    const results: Entity[] = [];

    // Navigate to the node for the prefix
    for (const char of prefix) {
      const child = node.children.get(char);
      if (!child) {
        return results; // No matches
      }
      node = child;
    }

    // Collect all entities under this prefix
    this.collectEntities(node, results, limit);

    return results;
  }

  /**
   * Recursively collect entities from Trie node
   */
  private collectEntities(node: TrieNode, results: Entity[], limit: number): void {
    if (results.length >= limit) return;

    if (node.isEndOfWord && node.entity) {
      results.push(node.entity);
    }

    for (const child of node.children.values()) {
      this.collectEntities(child, results, limit);
      if (results.length >= limit) return;
    }
  }

  /**
   * Find best match using layered approach
   * 1. Exact match (HashMap) - O(1)
   * 2. Alias match - O(k)
   * 3. Trie prefix match - O(m)
   * 4. Edit distance match - O(k * n)
   */
  findBestMatch(name: string): MatchResult {
    // Step 1: Exact match
    const exactEntity = this.findExact(name);
    if (exactEntity) {
      return {
        entity: exactEntity,
        matchType: 'exact',
        confidence: 1.0
      };
    }

    // Step 2: Try lowercase match
    const lowerEntity = this.nameToEntity.get(name.toLowerCase());
    if (lowerEntity) {
      return {
        entity: lowerEntity,
        matchType: 'exact',
        confidence: 0.95
      };
    }

    // Step 3: Trie prefix match
    const trieMatches = this.findByPrefix(name, 3);
    if (trieMatches.length > 0) {
      // Return the best (first) match
      return {
        entity: trieMatches[0],
        matchType: 'trie',
        confidence: 0.8
      };
    }

    // Step 4: Edit distance match (only for candidates)
    // Only search if name is short enough to be a potential entity name
    if (name.length >= 2 && name.length <= 6) {
      const editDistanceMatch = this.findByEditDistance(name);
      if (editDistanceMatch) {
        return {
          entity: editDistanceMatch,
          matchType: 'edit_distance',
          confidence: 0.6
        };
      }
    }

    // No match found
    return {
      entity: null,
      matchType: null,
      confidence: 0
    };
  }

  /**
   * Find match by edit distance
   */
  private findByEditDistance(name: string, threshold: number = 2): Entity | null {
    let bestMatch: Entity | null = null;
    let bestDistance = Infinity;

    for (const entity of this.allEntities) {
      // Check title
      const titleDistance = levenshteinDistance(name, entity.title);
      if (titleDistance <= threshold && titleDistance < bestDistance) {
        bestDistance = titleDistance;
        bestMatch = entity;
      }

      // Check aliases
      for (const alias of entity.aliases) {
        const aliasDistance = levenshteinDistance(name, alias);
        if (aliasDistance <= threshold && aliasDistance < bestDistance) {
          bestDistance = aliasDistance;
          bestMatch = entity;
        }
      }
    }

    return bestMatch;
  }

  /**
   * Get match type for a name (without returning the entity)
   */
  getMatchType(name: string): MatchResult['matchType'] {
    const result = this.findBestMatch(name);
    return result.matchType;
  }

  /**
   * Get summary of all indexed entities (for AI context)
   */
  getEntityIndexSummary(): EntityIndexSummary[] {
    return this.allEntities.map(e => ({
      name: e.title,
      type: e.type
    }));
  }

  /**
   * Get count of indexed entities
   */
  get size(): number {
    return this.allEntities.length;
  }
}
