/**
 * process_entities Executor
 * Batch processing of entity operations - create, add_interaction, link
 */

import type { App } from 'obsidian';
import type { EntityManager } from '../../../../entities/manager';
import type { AIProvider } from '../../../../ai/provider';
import type { ToolExecutionResult } from '../../types';

export interface ProcessEntitiesInput {
  /** 批量实体操作数组 */
  entities: Array<{
    name?: string;
    action: 'create' | 'add_interaction' | 'link';
    entityId?: string;
    entityType?: 'person' | 'project' | 'thing' | 'idea' | 'knowledge';
    subType?: string;
    summary?: string;
    content?: string;
    metadata?: Record<string, any>;
    entityIdA?: string;
    entityIdB?: string;
    relation?: string;
    /** 来源日记内容，用于创建实体的初始互动记录 */
    sourceDiaryContent?: string;
  }>;
  options?: {
    skipOnConflict?: boolean;
  };
}

export interface EntityProcessResult {
  name?: string;
  entityId?: string;
  success: boolean;
  error?: string;
  alreadyExists?: boolean;
  path?: string;
}

export interface ProcessResult {
  success: boolean;
  results: {
    created: EntityProcessResult[];
    interactions: EntityProcessResult[];
    links: EntityProcessResult[];
    errors: EntityProcessResult[];
  };
  summary: {
    totalCreated: number;
    totalInteractionsAdded: number;
    totalLinksCreated: number;
    totalErrors: number;
  };
}

/**
 * Process entities in batch
 */
export async function processEntitiesExecutor(
  context: {
    entityManager: EntityManager;
    app?: App;
    aiProvider?: AIProvider;
    blockId?: string;
  },
  input: ProcessEntitiesInput
): Promise<ToolExecutionResult> {
  try {
    const results = {
      created: [] as EntityProcessResult[],
      interactions: [] as EntityProcessResult[],
      links: [] as EntityProcessResult[],
      errors: [] as EntityProcessResult[]
    };

    // Process each entity operation
    for (const entity of input.entities) {
      try {
        switch (entity.action) {
          case 'create':
            await processCreate(context, entity, results);
            break;
          case 'add_interaction':
            await processAddInteraction(context, entity, results);
            break;
          case 'link':
            await processLink(context, entity, results);
            break;
          default:
            results.errors.push({
              name: entity.name,
              success: false,
              error: `Unknown action: ${entity.action}`
            });
        }
      } catch (error) {
        results.errors.push({
          name: entity.name,
          entityId: entity.entityId,
          success: false,
          error: (error as Error).message
        });
      }
    }

    // Build summary
    const summary = {
      totalCreated: results.created.filter(r => r.success).length,
      totalInteractionsAdded: results.interactions.filter(r => r.success).length,
      totalLinksCreated: results.links.filter(r => r.success).length,
      totalErrors: results.errors.length
    };

    // Return success even if some operations failed - check results.errors
    return {
      success: true,
      data: {
        results,
        summary
      } as ProcessResult
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to process entities: ${(error as Error).message}`
    };
  }
}

/**
 * Handle create action
 */
async function processCreate(
  context: any,
  entity: ProcessEntitiesInput['entities'][0],
  results: any
): Promise<void> {
  if (!entity.name || !entity.entityType) {
    results.errors.push({
      name: entity.name,
      success: false,
      error: 'name and entityType are required for create action'
    });
    return;
  }

  // Check if entity already exists
  const existing = context.entityManager.findEntity(entity.name);
  if (existing) {
    results.errors.push({
      name: entity.name,
      entityId: existing.id,
      success: false,
      error: 'entity already exists',
      alreadyExists: true
    });
    return;
  }

  // Build metadata with subType info
  const metadata = { ...(entity.metadata || {}) };
  metadata.status = metadata.status || 'active';
  metadata.source = metadata.source || 'diary_analysis';
  if (entity.subType) {
    metadata.subType = entity.subType;
  }

  // Build initial interaction from diary content
  const initialInteraction = {
    timestamp: new Date().toISOString(),
    type: 'ai_analysis' as const,
    content: entity.sourceDiaryContent
      ? `从日记分析创建：${entity.sourceDiaryContent.slice(0, 200)}`
      : (entity.summary || '从日记分析创建'),
    sourceBlockId: context.blockId
  };

  // Create entity
  const created = await context.entityManager.createEntity({
    type: entity.entityType,
    title: entity.name,
    titleRaw: entity.name,
    aliases: [],
    tags: [],
    summary: entity.summary || '',
    confidence: 0.8,
    verificationStatus: 'verified',
    createdAt: new Date().toISOString(),
    createdBy: 'ai',
    lastUpdated: new Date().toISOString(),
    relatedEntities: [],
    interactions: [initialInteraction],
    metadata
  });

  results.created.push({
    name: entity.name,
    entityId: created.id,
    success: true,
    path: `${entity.entityType}s/${entity.name}.md`
  });
}

/**
 * Handle add_interaction action
 */
async function processAddInteraction(
  context: any,
  entity: ProcessEntitiesInput['entities'][0],
  results: any
): Promise<void> {
  if (!entity.entityId || !entity.content) {
    results.errors.push({
      entityId: entity.entityId,
      success: false,
      error: 'entityId and content are required for add_interaction action'
    });
    return;
  }

  // Check if entity exists
  const existingEntity = context.entityManager.getEntity(entity.entityId);
  if (!existingEntity) {
    results.errors.push({
      entityId: entity.entityId,
      success: false,
      error: 'entity not found'
    });
    return;
  }

  // Add interaction
  await context.entityManager.addInteraction(entity.entityId, {
    timestamp: new Date().toISOString(),
    type: 'diary_mention',
    content: entity.content,
    sourceBlockId: context.blockId
  });

  results.interactions.push({
    entityId: entity.entityId,
    success: true
  });
}

/**
 * Handle link action
 */
async function processLink(
  context: any,
  entity: ProcessEntitiesInput['entities'][0],
  results: any
): Promise<void> {
  if (!entity.entityIdA || !entity.entityIdB || !entity.relation) {
    results.errors.push({
      name: entity.name,
      success: false,
      error: 'entityIdA, entityIdB, and relation are required for link action'
    });
    return;
  }

  // Get entity A
  const entityA = context.entityManager.getEntity(entity.entityIdA);
  if (!entityA) {
    results.errors.push({
      entityId: entity.entityIdA,
      success: false,
      error: 'Entity A not found'
    });
    return;
  }

  // Add relation to entity A
  const relations = [...(entityA.relatedEntities || [])];
  relations.push({
    entityId: entity.entityIdB,
    relation: entity.relation as any,
    context: entity.context || ''
  });

  await context.entityManager.updateEntity(entity.entityIdA, { relatedEntities: relations });

  results.links.push({
    entityId: entity.entityIdA,
    success: true
  });
}