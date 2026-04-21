/**
 * update_block_metadata Executor
 * 更新 block 的元数据（领域标签、分类状态等）
 */

import type { App } from 'obsidian';
import type { ToolExecutionResult } from '../../types';

export type BlockCategory = '工作' | '个人' | '待确认';

export interface UpdateBlockMetadataInput {
  blockId: string;
  updates: {
    category?: BlockCategory;
    areas?: string[];
  };
}

export interface UpdateBlockMetadataResult {
  success: boolean;
  blockId: string;
  updated: {
    category?: BlockCategory;
    areas?: string[];
  };
}

/**
 * 更新 block 元数据
 */
export async function updateBlockMetadataExecutor(
  context: {
    app: App;
    blockId?: string;
  },
  input: UpdateBlockMetadataInput
): Promise<ToolExecutionResult> {
  try {
    // Validate required fields
    if (!input.blockId) {
      return {
        success: false,
        error: 'blockId is required'
      };
    }

    if (!input.updates || (Object.keys(input.updates).length === 0)) {
      return {
        success: false,
        error: 'No updates provided'
      };
    }

    // Get BlockEditorView from workspace
    const VIEW_TYPE_BLOCK_EDITOR = 'block-editor';
    const leaves = context.app.workspace.getLeavesOfType(VIEW_TYPE_BLOCK_EDITOR);

    if (leaves.length === 0) {
      return {
        success: false,
        error: 'BlockEditorView not found in workspace'
      };
    }

    const blockEditorView = leaves[0].view as any;
    if (!blockEditorView) {
      return {
        success: false,
        error: 'BlockEditorView is not available'
      };
    }

    // Get the block by ID
    const block = blockEditorView.getBlockById(input.blockId);
    if (!block) {
      return {
        success: false,
        error: `Block not found: ${input.blockId}`
      };
    }

    const updated: Record<string, any> = {};

    // Update category if provided
    if (input.updates.category !== undefined) {
      const validCategories: BlockCategory[] = ['工作', '个人', '待确认'];
      if (!validCategories.includes(input.updates.category)) {
        return {
          success: false,
          error: `Invalid category: ${input.updates.category}. Valid values: ${validCategories.join(', ')}`
        };
      }
      block.category = input.updates.category;
      updated.category = input.updates.category;
    }

    // Update areas if provided
    if (input.updates.areas !== undefined) {
      if (!Array.isArray(input.updates.areas)) {
        return {
          success: false,
          error: 'areas must be an array'
        };
      }
      block.areas = input.updates.areas;
      updated.areas = input.updates.areas;
    }

    // Save to file
    await blockEditorView.saveBlockToFile(block);

    return {
      success: true,
      data: {
        success: true,
        blockId: input.blockId,
        updated
      } as UpdateBlockMetadataResult
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to update block metadata: ${(error as Error).message}`
    };
  }
}
