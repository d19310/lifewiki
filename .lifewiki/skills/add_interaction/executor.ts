/**
 * add_interaction Executor
 * 为已有实体添加互动记录
 */

import type { EntityManager } from '../../../../entities/manager';
import type { ToolExecutionResult } from '../../types';

export interface AddInteractionInput {
  entityId: string;
  content: string;
  sourceBlockId?: string;
}

export async function addInteractionExecutor(
  entityManager: EntityManager,
  input: AddInteractionInput
): Promise<ToolExecutionResult> {
  try {
    // Validate required fields
    if (!input.entityId) {
      return {
        success: false,
        error: 'Entity ID is required'
      };
    }

    if (!input.content || input.content.trim() === '') {
      return {
        success: false,
        error: 'Interaction content is required'
      };
    }

    // Check if entity exists
    const entity = entityManager.getEntity(input.entityId);
    if (!entity) {
      return {
        success: false,
        error: `Entity not found: ${input.entityId}`
      };
    }

    // Add the interaction
    await entityManager.addInteraction(input.entityId, {
      timestamp: new Date().toISOString(),
      type: 'diary_mention',
      content: input.content,
      sourceBlockId: input.sourceBlockId
    });

    return {
      success: true,
      data: {
        success: true,
        interactionId: `interaction_${Date.now()}`
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to add interaction: ${(error as Error).message}`
    };
  }
}
