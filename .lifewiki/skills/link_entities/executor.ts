/**
 * link_entities Executor
 * 批量建立实体间的双向关联关系
 */

import type { App } from 'obsidian';
import type { EntityManager } from '../../../../entities/manager';
import type { AIProvider } from '../../../../ai/provider';
import type { ToolExecutionResult } from '../../types';

export type RelationType =
  | '负责人' | '成员' | '相关' | '同一项目' | '同一任务'
  | '属于' | '包含' | '对立' | '上下游' | '合作' | '替代' | '组成';

export interface LinkEntitiesInput {
  /** 批量关联数组 */
  links: Array<{
    entityIdA: string;
    entityIdB: string;
    relation: RelationType;
    context?: string;
  }>;
  options?: {
    /** 高置信度关系自动确认（目前未使用，保留扩展） */
    autoConfirmHighConfidence?: boolean;
  };
}

export interface LinkResult {
  entityIdA: string;
  entityIdB: string;
  relation: RelationType;
  success: boolean;
  error?: string;
}

export interface LinkEntitiesResult {
  success: boolean;
  results: {
    linked: LinkResult[];
    errors: LinkResult[];
  };
  summary: {
    totalLinked: number;
    totalErrors: number;
  };
}

/**
 * 有效关系类型列表
 */
export const VALID_RELATIONS: RelationType[] = [
  '负责人', '成员', '相关', '同一项目', '同一任务',
  '属于', '包含', '对立', '上下游', '合作', '替代', '组成'
];

/**
 * 获取反向关系
 */
function getInverseRelation(relation: RelationType): RelationType {
  const inverseMap: Record<string, RelationType> = {
    '负责人': '成员',
    '成员': '负责人',
    '属于': '包含',
    '包含': '属于',
    '上下游': '上下游',
    '替代': '被替代',
    '组成': '的组成部分'
  };
  return inverseMap[relation] || relation;
}

/**
 * 批量建立实体关联
 */
export async function linkEntitiesExecutor(
  context: {
    entityManager: EntityManager;
    app?: App;
    aiProvider?: AIProvider;
    blockId?: string;
  },
  input: LinkEntitiesInput
): Promise<ToolExecutionResult> {
  try {
    const linked: LinkResult[] = [];
    const errors: LinkResult[] = [];

    // Process each link
    for (const link of input.links) {
      const result = await processSingleLink(context, link);
      if (result.success) {
        linked.push(result);
      } else {
        errors.push(result);
      }
    }

    // Build summary
    const summary = {
      totalLinked: linked.length,
      totalErrors: errors.length
    };

    return {
      success: true,
      data: {
        linked,
        errors,
        summary
      } as LinkEntitiesResult
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to link entities: ${(error as Error).message}`
    };
  }
}

/**
 * 处理单个关联
 */
async function processSingleLink(
  context: {
    entityManager: EntityManager;
  },
  link: LinkEntitiesInput['links'][0]
): Promise<LinkResult> {
  const { entityIdA, entityIdB, relation, context: relationContext } = link;

  // Validate relation type
  if (!VALID_RELATIONS.includes(relation)) {
    return {
      entityIdA,
      entityIdB,
      relation,
      success: false,
      error: `Invalid relation type: ${relation}. Valid types: ${VALID_RELATIONS.join(', ')}`
    };
  }

  // Check if both entities exist
  const entityA = context.entityManager.getEntity(entityIdA);
  if (!entityA) {
    return {
      entityIdA,
      entityIdB,
      relation,
      success: false,
      error: `Entity not found: ${entityIdA}`
    };
  }

  const entityB = context.entityManager.getEntity(entityIdB);
  if (!entityB) {
    return {
      entityIdA,
      entityIdB,
      relation,
      success: false,
      error: `Entity not found: ${entityIdB}`
    };
  }

  try {
    // Add relation from A to B
    const relationsA = [...(entityA.relatedEntities || [])];
    relationsA.push({
      entityId: entityIdB,
      relation: relation as any,
      context: relationContext || ''
    });
    await context.entityManager.updateEntity(entityIdA, { relatedEntities: relationsA });

    // Add inverse relation from B to A
    const relationsB = [...(entityB.relatedEntities || [])];
    const inverseRelation = getInverseRelation(relation);
    relationsB.push({
      entityId: entityIdA,
      relation: inverseRelation as any,
      context: relationContext || ''
    });
    await context.entityManager.updateEntity(entityIdB, { relatedEntities: relationsB });

    return {
      entityIdA,
      entityIdB,
      relation,
      success: true
    };
  } catch (error) {
    return {
      entityIdA,
      entityIdB,
      relation,
      success: false,
      error: (error as Error).message
    };
  }
}
