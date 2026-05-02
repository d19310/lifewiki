/**
 * Entity Index
 * Efficient entity lookup using HashMap, Trie, Aho-Corasick, and string matching
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

export interface ScanContentOptions {
  /** Keep only the longest match at each position (default: true) */
  longestOnly?: boolean;
  /** Minimum pattern length to index (default: 2) */
  minPatternLength?: number;
}

/**
 * Trie Node for prefix matching and Aho-Corasick multi-pattern scanning
 */
class TrieNode {
  children: Map<string, TrieNode> = new Map();
  entity: Entity | null = null;
  isEndOfWord: boolean = false;
  // Aho-Corasick failure link
  fail: TrieNode | null = null;
  // Accumulated entities that end at or below this node via failure links
  outputEntities: Set<Entity> = new Set();
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

      // Build Trie with entity title (only if >= 2 chars for AC scanning)
      this.insertIntoTrie(entity.title, entity);
      // Also insert lowercase version for case-insensitive content scanning
      this.insertLowercase(entity.title, entity);

      // Also insert aliases into trie (only if >= 2 chars)
      for (const alias of entity.aliases) {
        this.insertIntoTrie(alias, entity);
        // Also insert lowercase version for case-insensitive scanning
        this.insertLowercase(alias, entity);
      }
    }

    // Build Aho-Corasick failure links for multi-pattern scanning
    this.buildFailureLinks();
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
   * Insert lowercase version of string into the Trie for case-insensitive scanning.
   * Ensures both original-case and lowercase paths lead to the entity.
   */
  private insertLowercase(str: string, entity: Entity): void {
    let node = this.trieRoot;

    for (const char of str.toLowerCase()) {
      if (!node.children.has(char)) {
        node.children.set(char, new TrieNode());
      }
      node = node.children.get(char)!;
    }

    // Always mark this node as end-of-word and set entity for the lowercase path
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
    // Require higher confidence for edit distance matches (threshold 1, not 2)
    if (name.length >= 2 && name.length <= 6) {
      const editDistanceResult = this.findByEditDistance(name, 1);
      if (editDistanceResult.entity && editDistanceResult.distance !== null) {
        // Calculate confidence based on edit distance and name length
        // distance 0 = confidence 1.0, distance 1 = confidence 0.8 (only for longer names)
        const baseConfidence = editDistanceResult.distance === 0 ? 1.0 : 0.7;
        // Only return match if confidence is high enough
        if (baseConfidence >= 0.7) {
          return {
            entity: editDistanceResult.entity,
            matchType: 'edit_distance',
            confidence: baseConfidence
          };
        }
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
  private findByEditDistance(name: string, threshold: number = 1): { entity: Entity | null; distance: number | null } {
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

    return { entity: bestMatch, distance: bestDistance === Infinity ? null : bestDistance };
  }

  /**
   * Build Aho-Corasick failure links using BFS.
   *
   * Failure links enable the automaton to transition on mismatch without
   * restarting from root, enabling O(M) single-pass content scanning.
   *
   * Algorithm:
   * 1. Root.fail = root (prevents infinite loops)
   * 2. BFS: depth-1 children fail to root
   * 3. For each node, compute child.fail based on node.fail
   * 4. Merge fail chain's outputEntities into each node's outputEntities
   */
  private buildFailureLinks(): void {
    const root = this.trieRoot;
    root.fail = root;

    // BFS queue
    const queue: TrieNode[] = [];

    // Initialize depth-1 children: their fail link points to root
    for (const child of root.children.values()) {
      child.fail = root;
      queue.push(child);
    }

    // BFS to build failure links
    while (queue.length > 0) {
      const node = queue.shift()!;

      // Merge fail node's output entities into this node's output
      if (node.fail) {
        for (const e of node.fail.outputEntities) {
          node.outputEntities.add(e);
        }
        // If fail node marks end of a word, add its entity too
        if (node.fail.isEndOfWord && node.fail.entity) {
          node.outputEntities.add(node.fail.entity);
        }
      }

      // If this node marks end of a word, add its entity to output
      if (node.isEndOfWord && node.entity) {
        node.outputEntities.add(node.entity);
      }

      for (const [char, child] of node.children) {
        // Find the failure link for child
        let failNode: TrieNode = node.fail!;
        while (failNode !== root && !failNode.children.has(char)) {
          failNode = failNode.fail!;
        }
        child.fail = failNode.children.get(char) || root;

        queue.push(child);
      }
    }

    // Final pass: ensure root's output includes entities from root's children
    // that are end-of-word (for single-char patterns, though they're filtered below)
    for (const child of root.children.values()) {
      if (child.isEndOfWord && child.entity) {
        root.outputEntities.add(child.entity);
      }
    }
  }

  /**
   * Scan content using Aho-Corasick multi-pattern matching.
   *
   * Single-pass O(M) scan where M = content length, independent of entity count.
   * Finds all entity name and alias occurrences in one traversal.
   *
   * @param content - The text to scan (diary content, etc.)
   * @param options - Optional configuration
   * @returns Map from Entity to array of match positions (0-based offsets)
   */
  scanContent(content: string, options: ScanContentOptions = {}): Map<Entity, number[]> {
    const { longestOnly = true } = options;
    const result = new Map<Entity, number[]>();
    const minLen = 2; // Minimum pattern length to prevent single-char false positives

    if (!content) return result;

    const root = this.trieRoot;
    let node: TrieNode = root;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];

      // Follow failure links on mismatch
      while (node !== root && !node.children.has(char)) {
        node = node.fail!;
      }

      if (node.children.has(char)) {
        node = node.children.get(char)!;
      }

      // Collect all entities that end at this position
      if (node.outputEntities.size > 0) {
        for (const entity of node.outputEntities) {
          // Filter by minimum pattern length (check the matched pattern length)
          if (entity.title.length < minLen) continue;

          if (!result.has(entity)) {
            result.set(entity, []);
          }
          // Record the START position of the match, not the end position
          const startPos = i - entity.title.length + 1;
          result.get(entity)!.push(startPos);
        }
      }
    }

    // If longestOnly, deduplicate: for each entity that is a substring of
    // another matched entity at the same position, remove the shorter one
    if (longestOnly && result.size > 1) {
      this.deduplicateLongestMatches(result);
    }

    return result;
  }

  /**
   * Deduplicate overlapping matches, keeping only the longest match per position.
   *
   * For example, if both "华为" (alias) and "华为技术有限公司" (title) match
   * at the same position, only the longer one is kept.
   */
  private deduplicateLongestMatches(result: Map<Entity, number[]>): void {
    const entities = Array.from(result.keys());
    const toRemove = new Set<Entity>();

    // Build a title->entity map for quick substring checks
    for (let i = 0; i < entities.length; i++) {
      for (let j = 0; j < entities.length; j++) {
        if (i === j) continue;
        const a = entities[i];
        const b = entities[j];

        // Check if a's title is a substring of b's title (a is "contained" by b)
        if (a.title.length < b.title.length && b.title.includes(a.title)) {
          // Check if a and b share any match positions
          const aPositions = result.get(a)!;
          const bPositions = result.get(b)!;
          const hasOverlap = aPositions.some(pos =>
            bPositions.some(bPos => {
              // b contains a if b's match position <= a's position <= b's position + b.title.length
              return pos >= bPos && pos < bPos + b.title.length;
            })
          );
          if (hasOverlap) {
            toRemove.add(a);
          }
        }
      }
    }

    for (const entity of toRemove) {
      result.delete(entity);
    }
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
