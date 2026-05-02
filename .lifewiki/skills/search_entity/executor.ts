/**
 * search_entity Executor
 * 在已归档实体中搜索与给定名称匹配的单个实体
 * Uses EntityIndex.findBestMatch() with layered matching (exact → alias → prefix → edit distance)
 */

import type { EntityManager } from '../../../../entities/manager';
import type { ToolExecutionResult } from '../../types';
import { EntityIndex } from '../../../../ai/langgraph/entity-index';

export interface SearchEntityInput {
  name: string;
}

export async function searchEntityExecutor(
  entityManager: EntityManager,
  input: SearchEntityInput
): Promise<ToolExecutionResult> {
  try {
    if (!input.name || input.name.trim() === '') {
      return {
        success: false,
        error: 'Entity name is required'
      };
    }

    // Build EntityIndex for layered matching
    const entities = entityManager.getAllEntities();
    const index = new EntityIndex(entities);

    // Use findBestMatch for layered matching (exact → alias → prefix → edit distance)
    const match = index.findBestMatch(input.name);

    if (match.entity) {
      return {
        success: true,
        data: {
          found: true,
          matchType: match.matchType,
          confidence: match.confidence,
          entity: {
            id: match.entity.id,
            title: match.entity.title,
            type: match.entity.type,
            summary: match.entity.summary,
            metadata: match.entity.metadata,
            aliases: match.entity.aliases,
            tags: match.entity.tags,
            confidence: match.entity.confidence,
            verificationStatus: match.entity.verificationStatus,
            createdAt: match.entity.createdAt,
            lastUpdated: match.entity.lastUpdated,
            recentInteractions: match.entity.interactions.slice(-3).map(i => ({
              timestamp: i.timestamp,
              type: i.type,
              content: i.content
            }))
          }
        }
      };
    }

    return {
      success: true,
      data: {
        found: false
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Search failed: ${(error as Error).message}`
    };
  }
}
