/**
 * Operation Executor
 * Executes pending operations after user confirmation
 */

import type { Entity, EntityType, EntityCreateInput } from '../../entities/types';
import type { EntityManager } from '../../entities/manager';
import type { ConfirmResult } from './user-reply-parser';

export interface PendingCreateEntity {
  name: string;
  entityType: EntityType;
  summary?: string;
  metadata?: Record<string, any>;
  sourceBlockId?: string;
}

export interface PendingAddInteraction {
  entityId: string;
  entityName: string;
  content: string;
  sourceBlockId?: string;
}

export interface PendingLinkEntities {
  entityIdA: string;
  entityNameA: string;
  entityIdB: string;
  entityNameB: string;
  relation: string;
  context: string;
}

export interface PendingUpdateEntity {
  entityId: string;
  entityName: string;
  updates: Partial<Entity>;
  reason: string;
}

export interface PendingOperations {
  createEntities: PendingCreateEntity[];
  addInteractions: PendingAddInteraction[];
  linkEntities: PendingLinkEntities[];
  updateEntities: PendingUpdateEntity[];
}

export interface ExecutionResult {
  success: boolean;
  results: {
    created?: Array<{ name: string; entityId: string }>;
    interactions?: Array<{ entityName: string; success: boolean }>;
    linked?: Array<{ from: string; to: string; success: boolean }>;
    updated?: Array<{ name: string; success: boolean }>;
  };
  errors?: string[];
}

/**
 * Apply user modifications to pending operations
 */
export function applyModifications(
  ops: PendingOperations,
  modifications: Record<string, { field: string; newValue: any }>
): PendingOperations {
  const updated = JSON.parse(JSON.stringify(ops)) as PendingOperations;

  for (const [name, mod] of Object.entries(modifications)) {
    // Find entity in createEntities and apply modification
    const entity = updated.createEntities.find(e => e.name === name);
    if (entity && mod.field === 'entityType') {
      entity.entityType = mod.newValue as EntityType;
    }
  }

  return updated;
}

/**
 * Filter operations by confirmed entities
 */
export function filterByConfirmation(
  ops: PendingOperations,
  confirmedEntities: string[]
): PendingOperations {
  const confirmedSet = new Set(confirmedEntities.map(n => n.toLowerCase()));

  return {
    createEntities: ops.createEntities.filter(e =>
      confirmedSet.has(e.name.toLowerCase())
    ),
    addInteractions: ops.addInteractions.filter(i =>
      confirmedSet.has(i.entityName.toLowerCase())
    ),
    linkEntities: ops.linkEntities.filter(l =>
      confirmedSet.has(l.entityNameA.toLowerCase()) ||
      confirmedSet.has(l.entityNameB.toLowerCase())
    ),
    updateEntities: ops.updateEntities.filter(u =>
      confirmedSet.has(u.entityName.toLowerCase())
    )
  };
}

/**
 * Execute all pending operations
 */
export async function executeOperations(
  ops: PendingOperations,
  entityManager: EntityManager,
  userConfirmation: ConfirmResult
): Promise<ExecutionResult> {
  const result: ExecutionResult = {
    success: true,
    results: {},
    errors: []
  };

  // Apply modifications if any
  let finalOps = ops;
  if (userConfirmation.modifications && Object.keys(userConfirmation.modifications).length > 0) {
    finalOps = applyModifications(ops, userConfirmation.modifications);
  }

  // Filter by confirmed entities if partial confirmation
  if (userConfirmation.action === 'partial_confirm' && userConfirmation.confirmedEntities) {
    finalOps = filterByConfirmation(finalOps, userConfirmation.confirmedEntities);
  }

  // Execute create entities
  if (finalOps.createEntities.length > 0) {
    const created: Array<{ name: string; entityId: string }> = [];
    for (const entity of finalOps.createEntities) {
      try {
        const input: EntityCreateInput = {
          type: entity.entityType,
          title: entity.name,
          titleRaw: entity.name,
          aliases: [],
          tags: [],
          summary: entity.summary || '',
          confidence: 0.8,
          verificationStatus: 'pending',
          createdAt: new Date().toISOString(),
          createdBy: 'ai',
          lastUpdated: new Date().toISOString(),
          relatedEntities: [],
          interactions: [{
            timestamp: new Date().toISOString(),
            type: 'ai_analysis',
            content: entity.content || `创建于日记分析`,
            sourceBlockId: entity.sourceBlockId
          }],
          metadata: entity.metadata || {}
        };

        const createdEntity = await entityManager.createEntity(input);
        created.push({ name: entity.name, entityId: createdEntity.id });
      } catch (error) {
        result.errors?.push(`创建实体 ${entity.name} 失败: ${error}`);
      }
    }
    result.results.created = created;
  }

  // Execute add interactions (for already archived entities)
  if (finalOps.addInteractions.length > 0) {
    const interactions: Array<{ entityName: string; success: boolean }> = [];
    for (const interaction of finalOps.addInteractions) {
      try {
        await entityManager.addInteraction(interaction.entityId, {
          timestamp: new Date().toISOString(),
          type: 'diary_mention',
          content: interaction.content,
          sourceBlockId: interaction.sourceBlockId
        });
        interactions.push({ entityName: interaction.entityName, success: true });
      } catch (error) {
        result.errors?.push(`添加互动 ${interaction.entityName} 失败: ${error}`);
        interactions.push({ entityName: interaction.entityName, success: false });
      }
    }
    result.results.interactions = interactions;
  }

  // Execute link entities
  if (finalOps.linkEntities.length > 0) {
    const linked: Array<{ from: string; to: string; success: boolean }> = [];
    for (const link of finalOps.linkEntities) {
      try {
        const entityA = entityManager.getEntity(link.entityIdA);
        if (!entityA) {
          result.errors?.push(`实体 ${link.entityNameA} 不存在`);
          linked.push({ from: link.entityNameA, to: link.entityNameB, success: false });
          continue;
        }

        const entityB = entityManager.getEntity(link.entityIdB);
        if (!entityB) {
          result.errors?.push(`实体 ${link.entityNameB} 不存在`);
          linked.push({ from: link.entityNameA, to: link.entityNameB, success: false });
          continue;
        }

        // Add related entity to both sides
        const updatedRelatedA: Entity['relatedEntities'] = [
          ...entityA.relatedEntities,
          {
            entityId: entityB.id,
            relation: link.relation as any,
            context: link.context
          }
        ];

        const updatedRelatedB: Entity['relatedEntities'] = [
          ...entityB.relatedEntities,
          {
            entityId: entityA.id,
            relation: link.relation as any,
            context: link.context
          }
        ];

        await entityManager.updateEntity(entityA.id, { relatedEntities: updatedRelatedA });
        await entityManager.updateEntity(entityB.id, { relatedEntities: updatedRelatedB });

        linked.push({ from: link.entityNameA, to: link.entityNameB, success: true });
      } catch (error) {
        result.errors?.push(`建立关系 ${link.entityNameA} → ${link.entityNameB} 失败: ${error}`);
        linked.push({ from: link.entityNameA, to: link.entityNameB, success: false });
      }
    }
    result.results.linked = linked;
  }

  // Execute update entities
  if (finalOps.updateEntities.length > 0) {
    const updated: Array<{ name: string; success: boolean }> = [];
    for (const update of finalOps.updateEntities) {
      try {
        await entityManager.updateEntity(update.entityId, update.updates);
        updated.push({ name: update.entityName, success: true });
      } catch (error) {
        result.errors?.push(`更新实体 ${update.entityName} 失败: ${error}`);
        updated.push({ name: update.entityName, success: false });
      }
    }
    result.results.updated = updated;
  }

  // Determine overall success
  result.success = !result.errors || result.errors.length === 0;

  return result;
}

/**
 * Create a summary of pending operations for user confirmation
 */
export function summarizeOperations(ops: PendingOperations): string {
  const parts: string[] = [];

  if (ops.createEntities.length > 0) {
    const names = ops.createEntities.map(e => `${e.name}（${e.entityType}）`).join('、');
    parts.push(`新增实体：${names}`);
  }

  if (ops.addInteractions.length > 0) {
    const names = ops.addInteractions.map(i => i.entityName).join('、');
    parts.push(`已归档实体互动：${names}`);
  }

  if (ops.linkEntities.length > 0) {
    const links = ops.linkEntities.map(l => `${l.entityNameA} → ${l.entityNameB}`).join('、');
    parts.push(`关联关系：${links}`);
  }

  if (ops.updateEntities.length > 0) {
    const names = ops.updateEntities.map(u => u.entityName).join('、');
    parts.push(`更新实体：${names}`);
  }

  return parts.join('\n');
}