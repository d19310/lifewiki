/**
 * search_entity Executor
 * 在已归档实体中搜索与给定名称匹配的单个实体
 */

import type { EntityManager } from '../../../../entities/manager';
import type { ToolExecutionResult } from '../../types';

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

    const entity = entityManager.findEntity(input.name);

    if (entity) {
      return {
        success: true,
        data: {
          found: true,
          entity: {
            id: entity.id,
            title: entity.title,
            type: entity.type,
            summary: entity.summary,
            metadata: entity.metadata,
            aliases: entity.aliases,
            tags: entity.tags,
            confidence: entity.confidence,
            verificationStatus: entity.verificationStatus,
            createdAt: entity.createdAt,
            lastUpdated: entity.lastUpdated,
            recentInteractions: entity.interactions.slice(-3).map(i => ({
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
