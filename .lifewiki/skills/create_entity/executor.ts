/**
 * create_entity Executor
 * 创建新的实体档案并写入 vault
 */

import type { App } from 'obsidian';
import type { EntityManager } from '../../../../entities/manager';
import type { EntityType } from '../../../../entities/types';
import type { ToolExecutionResult } from '../../types';

export interface CreateEntityInput {
  entityType: EntityType;
  name: string;
  summary?: string;
  sourceDocument?: string;
  sourceContent?: string;
  metadata?: Record<string, any>;
}

export async function createEntityExecutor(
  app: App,
  entityManager: EntityManager,
  input: CreateEntityInput
): Promise<ToolExecutionResult> {
  try {
    // Validate required fields
    if (!input.entityType) {
      return {
        success: false,
        error: 'Entity type is required'
      };
    }

    if (!input.name || input.name.trim() === '') {
      return {
        success: false,
        error: 'Entity name is required'
      };
    }

    // Check if entity already exists
    const existing = entityManager.findEntity(input.name);
    if (existing) {
      return {
        success: false,
        error: `Entity already exists: ${input.name}`
      };
    }

    // Build metadata with source info if provided
    const metadata = {
      ...(input.metadata || {}),
      status: 'active',
      source: 'diary'
    };

    if (input.sourceDocument) {
      metadata.source_path = input.sourceDocument;
    }

    if (input.sourceContent) {
      metadata.description = input.sourceContent.substring(0, 500);
    }

    // Create the entity via EntityManager
    const entity = await entityManager.createEntity({
      type: input.entityType,
      title: input.name,
      titleRaw: input.name,
      aliases: [],
      tags: [],
      summary: input.summary || '',
      confidence: 0.8,
      verificationStatus: 'verified',
      createdAt: new Date().toISOString(),
      createdBy: 'ai',
      lastUpdated: new Date().toISOString(),
      relatedEntities: [],
      interactions: [{
        timestamp: new Date().toISOString(),
        type: 'ai_analysis',
        content: input.summary || 'Entity created from diary analysis',
        sourceBlockId: undefined
      }],
      metadata
    });

    return {
      success: true,
      data: {
        success: true,
        entityId: entity.id,
        path: entity.filePath
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to create entity: ${(error as Error).message}`
    };
  }
}
