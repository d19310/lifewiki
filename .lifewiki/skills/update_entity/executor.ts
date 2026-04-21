/**
 * update_entity Executor
 * 更新已有实体的字段信息
 */

import type { EntityManager } from '../../../../entities/manager';
import type { ToolExecutionResult } from '../../types';

export interface UpdateEntityInput {
  entityId: string;
  updates: {
    title?: string;
    summary?: string;
    tags?: string[];
    metadata?: Record<string, any>;
    [key: string]: any;
  };
}

export async function updateEntityExecutor(
  entityManager: EntityManager,
  input: UpdateEntityInput
): Promise<ToolExecutionResult> {
  try {
    // Validate required fields
    if (!input.entityId) {
      return {
        success: false,
        error: 'Entity ID is required'
      };
    }

    if (!input.updates || Object.keys(input.updates).length === 0) {
      return {
        success: false,
        error: 'No updates provided'
      };
    }

    // Check if entity exists
    const existingEntity = entityManager.getEntity(input.entityId);
    if (!existingEntity) {
      return {
        success: false,
        error: `Entity not found: ${input.entityId}`
      };
    }

    // Build updates with metadata merge
    const updates: Record<string, any> = {};
    const metadataUpdates: Record<string, any> = {};

    for (const [field, value] of Object.entries(input.updates)) {
      if (field === 'metadata' && typeof value === 'object') {
        metadataUpdates['metadata'] = value;
      } else if (field.startsWith('metadata.')) {
        const metaKey = field.substring('metadata.'.length);
        metadataUpdates[`metadata.${metaKey}`] = value;
      } else {
        updates[field] = value;
      }
    }

    // Merge metadata if there are updates
    if (Object.keys(metadataUpdates).length > 0) {
      const mergedMetadata = { ...existingEntity.metadata, ...metadataUpdates.metadata };
      updates.metadata = mergedMetadata;
    }

    // Add lastUpdated timestamp
    updates.lastUpdated = new Date().toISOString();

    // Perform the update
    const updatedEntity = await entityManager.updateEntity(input.entityId, updates);

    if (updatedEntity) {
      return {
        success: true,
        data: {
          success: true,
          entity: {
            id: updatedEntity.id,
            title: updatedEntity.title,
            type: updatedEntity.type,
            summary: updatedEntity.summary,
            metadata: updatedEntity.metadata,
            lastUpdated: updatedEntity.lastUpdated
          }
        }
      };
    }

    return {
      success: false,
      error: 'Failed to update entity'
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to update entity: ${(error as Error).message}`
    };
  }
}
