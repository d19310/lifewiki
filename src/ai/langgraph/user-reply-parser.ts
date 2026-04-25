/**
 * User Reply Parser
 * Parses user replies to confirmation requests
 */

export interface ConfirmResult {
  action: 'confirm_all' | 'partial_confirm' | 'cancel_all' | 'modify';
  confirmedEntities?: string[];
  modifications?: Record<string, EntityModification>;
}

export interface EntityModification {
  name: string;
  field: string;
  newValue: any;
}

/**
 * Parse user reply to confirmation request
 *
 * Supported formats:
 * - "好" / "好的" / "确认" → confirm_all
 * - "好，但张三改成客户" → confirm_all + modify
 * - "只创建张三" → partial_confirm: [张三]
 * - "取消" / "算了" → cancel_all
 */
export function parseUserReply(reply: string): ConfirmResult {
  const normalized = reply.trim().toLowerCase();

  // Cancel patterns
  if (
    normalized === '取消' ||
    normalized === '算了' ||
    normalized === '不' ||
    normalized === '不要' ||
    normalized === '否'
  ) {
    return { action: 'cancel_all' };
  }

  // Confirm all patterns
  if (
    normalized === '好' ||
    normalized === '好的' ||
    normalized === '确认' ||
    normalized === '是' ||
    normalized === '执行' ||
    normalized === 'ok' ||
    normalized === 'yes' ||
    normalized === 'y'
  ) {
    return { action: 'confirm_all' };
  }

  // Partial confirm with "但" or "不过"
  if (normalized.includes('但') || normalized.includes('不过')) {
    return parsePartialWithModification(reply);
  }

  // Partial confirm with "只" or "仅"
  if (normalized.includes('只') || normalized.includes('仅')) {
    return parsePartialConfirm(reply);
  }

  // Default: confirm all
  return { action: 'confirm_all' };
}

/**
 * Parse partial confirm with modifications
 * "好，但张三改成客户"
 */
function parsePartialWithModification(reply: string): ConfirmResult {
  const modifications: Record<string, EntityModification> = {};

  // Split by "但" or "不过"
  const parts = reply.split(/但|不过/);

  // First part is the confirmation
  const firstPart = parts[0].trim().toLowerCase();
  let action: ConfirmResult['action'] = 'confirm_all';

  if (firstPart === '取消' || firstPart === '算了' || firstPart === '不') {
    action = 'cancel_all';
  } else if (firstPart === '只' || firstPart === '仅') {
    // Handle "只...但..." pattern
    action = 'partial_confirm';
  }

  // Parse modifications from remaining parts
  for (let i = 1; i < parts.length; i++) {
    const mod = parseModification(parts[i]);
    if (mod) {
      modifications[mod.name] = mod;
    }
  }

  if (Object.keys(modifications).length > 0) {
    return { action, modifications };
  }

  return { action: 'confirm_all' };
}

/**
 * Parse modification string like "张三改成客户" or "李四改成负责人"
 */
function parseModification(text: string): EntityModification | null {
  // Pattern 1: "X改成Y" or "X改为Y"
  const changePattern1 = /([^\s，,]+)改成([^\s，,]+)/;
  const changePattern2 = /([^\s，,]+)改为([^\s，,]+)/;

  let match = text.match(changePattern1) || text.match(changePattern2);

  if (match) {
    return {
      name: match[1].trim(),
      field: 'entityType',
      newValue: normalizeEntityType(match[2].trim())
    };
  }

  // Pattern 2: "X是Y" or "X为Y"
  const isPattern = /([^\s，,]+)\s*(是|为)\s*([^\s，,]+)/;
  match = text.match(isPattern);

  if (match) {
    return {
      name: match[1].trim(),
      field: 'entityType',
      newValue: normalizeEntityType(match[3].trim())
    };
  }

  return null;
}

/**
 * Parse partial confirm - only certain entities
 * "只创建张三" / "仅处理李四"
 */
function parsePartialConfirm(reply: string): ConfirmResult {
  const confirmedEntities: string[] = [];

  // Extract entity names after "只" or "仅"
  const pattern = /(?:只|仅)(?:创建|处理|确认|执行)?([^\s，,]+)/g;
  let match;

  while ((match = pattern.exec(reply)) !== null) {
    const name = match[1].trim();
    if (name && name.length > 0) {
      confirmedEntities.push(name);
    }
  }

  // Also handle comma-separated entities
  // "只创建张三、李四"
  const commaPattern = /(?:只|仅)(?:创建|处理|确认|执行)?([^\n，,]+)/;
  const commaMatch = reply.match(commaPattern);
  if (commaMatch) {
    const entities = commaMatch[1].split(/、|,/);
    for (const entity of entities) {
      const name = entity.trim();
      if (name && !confirmedEntities.includes(name)) {
        confirmedEntities.push(name);
      }
    }
  }

  if (confirmedEntities.length > 0) {
    return { action: 'partial_confirm', confirmedEntities };
  }

  // Default to cancel if no entities specified
  return { action: 'cancel_all' };
}

/**
 * Normalize entity type string to standard type
 */
function normalizeEntityType(type: string): string {
  const normalized = type.toLowerCase().trim();

  // Person types
  if (
    normalized === '人' ||
    normalized === '人物' ||
    normalized === 'person' ||
    normalized === '人脉'
  ) {
    return 'person';
  }

  // Company types
  if (
    normalized === '公司' ||
    normalized === '企业' ||
    normalized === 'company' ||
    normalized === '客户' ||
    normalized === 'vendor' ||
    normalized === '供应商'
  ) {
    return 'company';
  }

  // Project types
  if (
    normalized === '项目' ||
    normalized === 'project' ||
    normalized === '项目组'
  ) {
    return 'project';
  }

  // Task types
  if (normalized === '任务' || normalized === 'task' || normalized === 'todo') {
    return 'task';
  }

  // Thing types
  if (
    normalized === '物品' ||
    normalized === '产品' ||
    normalized === '设备' ||
    normalized === '设施' ||
    normalized === '方案' ||
    normalized === 'thing'
  ) {
    return 'thing';
  }

  // Idea types
  if (
    normalized === '想法' ||
    normalized === '灵感' ||
    normalized === '概念' ||
    normalized === 'idea'
  ) {
    return 'idea';
  }

  // Knowledge types
  if (
    normalized === '知识' ||
    normalized === '文章' ||
    normalized === '论文' ||
    normalized === '文档' ||
    normalized === '链接' ||
    normalized === 'knowledge'
  ) {
    return 'knowledge';
  }

  // Return as-is if no match
  return type;
}

/**
 * Check if a reply indicates the user wants to cancel
 */
export function isCancelReply(reply: string): boolean {
  const normalized = reply.trim().toLowerCase();
  return (
    normalized === '取消' ||
    normalized === '算了' ||
    normalized === '不' ||
    normalized === '不要' ||
    normalized === '否'
  );
}

/**
 * Check if a reply indicates confirmation
 */
export function isConfirmReply(reply: string): boolean {
  const normalized = reply.trim().toLowerCase();
  return (
    normalized === '好' ||
    normalized === '好的' ||
    normalized === '确认' ||
    normalized === '是' ||
    normalized === '执行' ||
    normalized === 'ok' ||
    normalized === 'yes' ||
    normalized === 'y'
  );
}