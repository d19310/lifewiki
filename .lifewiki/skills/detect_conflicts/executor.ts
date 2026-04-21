/**
 * detect_conflicts Executor
 * 检测日记内容与实体档案之间的事实冲突
 */

import type { App } from 'obsidian';
import type { EntityManager } from '../../../../entities/manager';
import type { AIProvider } from '../../../../ai/provider';
import type { ToolExecutionResult } from '../../types';

export type ConflictType =
  | 'value_changed'
  | 'status_changed'
  | 'relation_conflict'
  | 'type_conflict'
  | 'alias_conflict'
  | 'metadata_missing';

export type Severity = 'high' | 'medium' | 'low';

export interface DetectConflictsInput {
  entityId: string;
  diaryContent: string;
  options?: {
    /** 要检查的字段列表，默认全部 */
    checkFields?: string[];
    /** 严格模式，任何差异都算冲突 */
    strictMode?: boolean;
  };
}

export interface Conflict {
  field: string;
  conflictType: ConflictType;
  oldValue: any;
  newValue: any;
  evidence: {
    diary: string;
    archive: string;
    diaryQuoted?: string;
    archiveQuoted?: string;
  };
  severity: Severity;
  autoResolved: boolean;
}

export interface UnchangedField {
  field: string;
  archiveValue: any;
  diaryImplication: string;
  status: 'consistent';
}

export interface DetectConflictsResult {
  success: boolean;
  hasConflicts: boolean;
  conflicts: Conflict[];
  unchanged: UnchangedField[];
  summary: {
    totalConflicts: number;
    totalUnchanged: number;
    autoResolvedCount: number;
  };
}

/**
 * 从日记内容中提取与实体相关的事实
 */
function extractEntityFacts(entityName: string, diaryContent: string): string[] {
  const facts: string[] = [];

  // 简单的基于关键词的事实提取
  // 实际实现应该更复杂，可能需要 AI 辅助
  const patterns = [
    new RegExp(`${entityName}[^。！？]*`, 'g'),
  ];

  for (const pattern of patterns) {
    const matches = diaryContent.match(pattern);
    if (matches) {
      facts.push(...matches);
    }
  }

  return facts;
}

/**
 * 检测字符串值是否实质性相同（考虑同义词等）
 */
function isValueEssentiallySame(oldVal: string, newVal: string): boolean {
  if (!oldVal || !newVal) return false;

  const normalizedOld = oldVal.toLowerCase().trim();
  const normalizedNew = newVal.toLowerCase().trim();

  // 完全相同
  if (normalizedOld === normalizedNew) return true;

  // 包含关系（可能是全称vs简称）
  if (normalizedOld.includes(normalizedNew) || normalizedNew.includes(normalizedOld)) {
    return true;
  }

  // 常见同义词判断（可扩展）
  const synonyms: Record<string, string[]> = {
    '华为': ['华为科技', '华为技术有限公司', '华为公司'],
    '腾讯': ['腾讯科技', '腾讯公司'],
  };

  for (const [key, values] of Object.entries(synonyms)) {
    const oldInSynonyms = values.includes(normalizedOld) || normalizedOld === key;
    const newInSynonyms = values.includes(normalizedNew) || normalizedNew === key;
    if (oldInSynonyms && newInSynonyms) return true;
  }

  return false;
}

/**
 * 检测冲突
 */
export async function detectConflictsExecutor(
  context: {
    entityManager: EntityManager;
    app?: App;
    aiProvider?: AIProvider;
    blockId?: string;
  },
  input: DetectConflictsInput
): Promise<ToolExecutionResult> {
  try {
    // Validate required fields
    if (!input.entityId) {
      return {
        success: false,
        error: 'entityId is required'
      };
    }

    if (!input.diaryContent) {
      return {
        success: true,
        data: {
          hasConflicts: false,
          conflicts: [],
          unchanged: [],
          summary: {
            totalConflicts: 0,
            totalUnchanged: 0,
            autoResolvedCount: 0
          }
        } as DetectConflictsResult
      };
    }

    // Get entity from manager
    const entity = context.entityManager.getEntity(input.entityId);
    if (!entity) {
      return {
        success: false,
        error: `Entity not found: ${input.entityId}`
      };
    }

    const conflicts: Conflict[] = [];
    const unchanged: UnchangedField[] = [];

    // Extract facts from diary about this entity
    const facts = extractEntityFacts(entity.title, input.diaryContent);

    // Check company field (common for person entities)
    if (entity.metadata?.company) {
      const archiveCompany = entity.metadata.company as string;
      const foundInDiary = facts.some(f => f.includes(archiveCompany));

      if (!foundInDiary) {
        // 可能公司已变更 - 需要更复杂的检测
        // 这里简化处理，实际应该用 AI 分析
      }
    }

    // Check status field (common for project entities)
    if (entity.metadata?.status) {
      const archiveStatus = entity.metadata.status as string;

      // 从日记中提取状态关键词
      const statusKeywords: Record<string, string[]> = {
        '已完成': ['完成', '结束了', '交付了', '结束了'],
        '进行中': ['进行中', '推进', '执行', '开发', '建设中'],
        '暂停': ['暂停', '搁置', '停止'],
        '取消': ['取消', '终止', '放弃了'],
      };

      for (const [status, keywords] of Object.entries(statusKeywords)) {
        const foundStatus = keywords.some(kw => input.diaryContent.includes(kw));
        if (foundStatus && archiveStatus !== status) {
          conflicts.push({
            field: 'metadata.status',
            conflictType: 'status_changed',
            oldValue: archiveStatus,
            newValue: status,
            evidence: {
              diary: `日记中提到相关状态：${keywords.find(k => input.diaryContent.includes(k))}`,
              archive: `档案中记录状态为：${archiveStatus}`,
            },
            severity: 'medium',
            autoResolved: false
          });
        }
      }
    }

    // Check project type fields
    if (entity.type === 'project' && entity.metadata?.subType) {
      const subType = entity.metadata.subType as string;

      // 项目名称中的关键词
      if (entity.title.includes('项目')) {
        // 检查是否是新项目
        if (input.diaryContent.includes('新项目') || input.diaryContent.includes('新启动')) {
          // 可能是新项目，不算冲突
        }
      }
    }

    // Check for relation conflicts (simplified)
    // 实际应该分析日记中提到的关系是否与档案一致
    if (entity.relatedEntities && entity.relatedEntities.length > 0) {
      // 简化处理：检查日记中是否提到了关联实体
      for (const related of entity.relatedEntities) {
        const relatedEntity = context.entityManager.getEntity(related.entityId);
        if (relatedEntity && !input.diaryContent.includes(relatedEntity.title)) {
          // 日记没提到这个关联实体，但不一定是冲突
        }
      }
    }

    // Check metadata fields for potential conflicts
    const metadataFields = ['company', 'position', 'status', 'location', 'department'];
    const checkFields = input.options?.checkFields || metadataFields;

    for (const field of checkFields) {
      if (field in (entity.metadata || {})) {
        const archiveValue = (entity.metadata as any)[field];
        // 这里可以添加更复杂的检测逻辑
        // 目前简化处理
      }
    }

    // Build result
    const autoResolvedCount = conflicts.filter(c => c.autoResolved).length;
    const result: DetectConflictsResult = {
      success: true,
      hasConflicts: conflicts.length > 0,
      conflicts,
      unchanged,
      summary: {
        totalConflicts: conflicts.length,
        totalUnchanged: unchanged.length,
        autoResolvedCount
      }
    };

    return {
      success: true,
      data: result
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to detect conflicts: ${(error as Error).message}`
    };
  }
}
