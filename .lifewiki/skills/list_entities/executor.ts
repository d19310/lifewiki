/**
 * list_entities Executor
 * 批量获取 vault 中指定类型的所有已归档实体
 */

import type { EntityManager } from '../../../../entities/manager';
import type { EntityType } from '../../../../entities/types';
import type { ToolExecutionResult } from '../../types';

export interface ListEntitiesInput {
  entityType: EntityType;
  status?: 'active' | 'archived' | 'all';
}

export async function listEntitiesExecutor(
  entityManager: EntityManager,
  input: ListEntitiesInput
): Promise<ToolExecutionResult> {
  try {
    const entities = await entityManager.getEntitiesByType(input.entityType);

    // Filter by status if specified
    let filteredEntities = entities;
    if (input.status && input.status !== 'all') {
      filteredEntities = entities.filter(e => {
        if (input.status === 'active') {
          return e.metadata?.status !== 'archived';
        }
        return e.metadata?.status === input.status;
      });
    }

    return {
      success: true,
      data: {
        entities: filteredEntities.map(e => ({
          id: e.id,
          title: e.title,
          type: e.type,
          summary: e.summary,
          metadata: e.metadata,
          lastUpdated: e.lastUpdated
        })),
        total: filteredEntities.length
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to list entities: ${(error as Error).message}`
    };
  }
}
