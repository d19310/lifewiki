/**
 * Confirmation Trigger
 * Generates structured confirmation requests for user
 */

import type { Entity, EntityType } from '../../entities/types';
import type { PendingOperations } from './operation-executor';

export interface DetectedEntity {
  name: string;
  inferredType: EntityType;
  confidence: number;
  isArchived: boolean;
  entityId?: string;
  matchType?: 'exact' | 'alias' | 'simplified' | 'trie' | 'edit_distance';
}

export interface DetectedLink {
  entityNameA: string;
  entityIdA?: string;
  entityNameB: string;
  entityIdB?: string;
  relation: string;
  context: string;
}

export interface DetectedUpdate {
  entityId: string;
  entityName: string;
  updates: Partial<Entity>;
  reason: string;
}

export interface DetectionResult {
  archivedMatches: DetectedEntity[];
  newEntities: DetectedEntity[];
  localFiles: string[];
  webLinks: string[];
  links: DetectedLink[];
  updates: DetectedUpdate[];
}

/**
 * Generate confirmation request text from pending operations
 */
export function generateConfirmationRequest(
  ops: PendingOperations,
  detectionResult?: DetectionResult
): string {
  const lines: string[] = [];

  lines.push('【待确认操作】\n');

  // New entities to create
  if (ops.createEntities.length > 0) {
    lines.push('新增实体：');
    for (const entity of ops.createEntities) {
      lines.push(`- ${entity.name}（${entity.entityType}）`);
    }
    lines.push('');
  }

  // Interactions to add
  if (ops.addInteractions.length > 0) {
    lines.push('已归档实体互动：');
    for (const interaction of ops.addInteractions) {
      lines.push(`- ${interaction.entityName}`);
    }
    lines.push('');
  }

  // Links to create
  if (ops.linkEntities.length > 0) {
    lines.push('关联关系：');
    for (const link of ops.linkEntities) {
      lines.push(`- ${link.entityNameA} → ${link.entityNameB}（${link.relation}）`);
    }
    lines.push('');
  }

  // Updates to make
  if (ops.updateEntities.length > 0) {
    lines.push('更新实体：');
    for (const update of ops.updateEntities) {
      lines.push(`- ${update.entityName}`);
    }
    lines.push('');
  }

  lines.push('请确认是否执行以上操作。');
  lines.push('回复"好"执行全部，"取消"放弃。');

  return lines.join('\n');
}

/**
 * Build pending operations from detection result
 */
export function buildPendingOperations(
  detection: DetectionResult,
  sourceBlockId: string,
  diaryContent: string
): PendingOperations {
  return {
    createEntities: detection.newEntities.map(e => ({
      name: e.name,
      entityType: e.inferredType,
      summary: `从日记中识别：${diaryContent.substring(0, 100)}...`,
      sourceBlockId
    })),
    addInteractions: detection.archivedMatches.map(e => ({
      entityId: e.entityId!,
      entityName: e.name,
      content: diaryContent,
      sourceBlockId
    })),
    linkEntities: detection.links.map(l => ({
      entityIdA: l.entityIdA!,
      entityNameA: l.entityNameA,
      entityIdB: l.entityIdB!,
      entityNameB: l.entityNameB,
      relation: l.relation,
      context: l.context
    })),
    updateEntities: detection.updates.map(u => ({
      entityId: u.entityId,
      entityName: u.entityName,
      updates: u.updates,
      reason: u.reason
    }))
  };
}

/**
 * Check if any operations need confirmation
 */
export function hasPendingOperations(ops: PendingOperations): boolean {
  return (
    ops.createEntities.length > 0 ||
    ops.updateEntities.length > 0 ||
    ops.linkEntities.length > 0
  );
}

/**
 * Check if operations only need auto-execution (add_interaction only)
 */
export function isAutoExecutable(ops: PendingOperations): boolean {
  return (
    ops.createEntities.length === 0 &&
    ops.updateEntities.length === 0 &&
    ops.linkEntities.length === 0 &&
    ops.addInteractions.length > 0
  );
}

/**
 * Format entity type for display
 */
export function formatEntityType(type: EntityType): string {
  const typeMap: Record<EntityType, string> = {
    person: '人脉',
    project: '项目',
    thing: '物品',
    idea: '想法',
    knowledge: '知识'
  };
  return typeMap[type] || type;
}

/**
 * Parse entity type from user input
 */
export function parseEntityType(input: string): EntityType | null {
  const normalized = input.toLowerCase().trim();

  const typeMap: Record<string, EntityType> = {
    '人': 'person',
    '人脉': 'person',
    'person': 'person',
    '项目': 'project',
    'project': 'project',
    '任务': 'project',
    '物品': 'thing',
    '产品': 'thing',
    '设备': 'thing',
    'thing': 'thing',
    '想法': 'idea',
    '灵感': 'idea',
    'idea': 'idea',
    '知识': 'knowledge',
    '文章': 'knowledge',
    '文档': 'knowledge',
    'knowledge': 'knowledge'
  };

  return typeMap[normalized] || null;
}