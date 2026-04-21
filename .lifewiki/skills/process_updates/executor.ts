/**
 * process_updates Executor
 * 批量更新多个实体的字段信息
 */

import type { App } from 'obsidian';
import type { EntityManager } from '../../../../entities/manager';
import type { AIProvider } from '../../../../ai/provider';
import type { ToolExecutionResult } from '../../types';

export interface ProcessUpdatesInput {
  updates: Array<{
    entityId: string;
    changes: {
      title?: string;
      summary?: string;
      tags?: string[];
      metadata?: Record<string, any>;
      [key: string]: any;
    };
    /** 更新原因，用于互动记录 */
    reason?: string;
  }>;
  options?: {
    skipOnError?: boolean;
  };
}

export interface UpdateResult {
  entityId: string;
  success: boolean;
  error?: string;
  entity?: {
    id: string;
    title: string;
    metadata: Record<string, any>;
  };
}

export interface ProcessUpdatesResult {
  success: boolean;
  results: {
    updated: UpdateResult[];
    errors: UpdateResult[];
  };
  summary: {
    totalUpdated: number;
    totalErrors: number;
  };
}

/**
 * 批量更新实体
 */
export async function processUpdatesExecutor(
  context: {
    entityManager: EntityManager;
    app?: App;
    aiProvider?: AIProvider;
    blockId?: string;
  },
  input: ProcessUpdatesInput
): Promise<ToolExecutionResult> {
  try {
    const updated: UpdateResult[] = [];
    const errors: UpdateResult[] = [];

    // Process each update
    for (const updateItem of input.updates) {
      try {
        // Validate required fields
        if (!updateItem.entityId) {
          errors.push({
            entityId: updateItem.entityId,
            success: false,
            error: 'entityId is required'
          });
          continue;
        }

        if (!updateItem.changes || Object.keys(updateItem.changes).length === 0) {
          errors.push({
            entityId: updateItem.entityId,
            success: false,
            error: 'No changes provided'
          });
          continue;
        }

        // Check if entity exists
        const existingEntity = context.entityManager.getEntity(updateItem.entityId);
        if (!existingEntity) {
          errors.push({
            entityId: updateItem.entityId,
            success: false,
            error: `Entity not found: ${updateItem.entityId}`
          });
          continue;
        }

        // Build updates with metadata merge
        const updates: Record<string, any> = {};
        const metadataUpdates: Record<string, any> = {};

        for (const [field, value] of Object.entries(updateItem.changes)) {
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

        // Add interaction record for this update
        if (updateItem.reason) {
          // 先获取最新实体以添加互动记录
          const currentEntity = context.entityManager.getEntity(updateItem.entityId);
          if (currentEntity) {
            const interactions = [...(currentEntity.interactions || [])];
            interactions.push({
              timestamp: new Date().toISOString(),
              type: 'conflict_resolution' as const,
              content: updateItem.reason,
              sourceBlockId: context.blockId
            });
            updates.interactions = interactions;
          }
        }

        // Perform the update
        const updatedEntity = await context.entityManager.updateEntity(updateItem.entityId, updates);

        if (updatedEntity) {
          updated.push({
            entityId: updateItem.entityId,
            success: true,
            entity: {
              id: updatedEntity.id,
              title: updatedEntity.title,
              metadata: updatedEntity.metadata
            }
          });
        } else {
          errors.push({
            entityId: updateItem.entityId,
            success: false,
            error: 'Failed to update entity'
          });
        }
      } catch (error) {
        errors.push({
          entityId: updateItem.entityId,
          success: false,
          error: (error as Error).message
        });

        // Check if we should skip on error
        if (input.options?.skipOnError) {
          continue;
        }
      }
    }

    // Build result
    const result: ProcessUpdatesResult = {
      success: errors.length === 0,
      results: {
        updated,
        errors
      },
      summary: {
        totalUpdated: updated.length,
        totalErrors: errors.length
      }
    };

    return {
      success: true,
      data: result
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to process updates: ${(error as Error).message}`
    };
  }
}
