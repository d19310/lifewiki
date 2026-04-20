/**
 * Confirmation Dialog
 * Handles AI entity confirmation UI and logic
 *
 * Architecture:
 * - Pure functions in confirmation-dialog.ts for business logic
 * - ConfirmationDialogUI class for DOM rendering in block-editor
 */

import { AnalysisResult, EntityPreview, EntityType, EntityCreateInput } from '../entities/types';

/**
 * Confirmation item for a single entity awaiting user confirmation
 */
export interface ConfirmationItem {
  id: string;
  entityType: EntityType | 'category';
  name: string;
  confidence: number;
  context: string;
  blockId: string;
}

/**
 * Generate unique ID for confirmation items
 */
function generateConfirmId(): string {
  return `confirm-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generate confirmation items from analysis result
 * Returns array of entities that need user confirmation for archiving
 */
export function generateConfirmationItems(result: AnalysisResult): ConfirmationItem[] {
  const items: ConfirmationItem[] = [];

  // Check for category confirmation
  if (result.category === '待确认') {
    items.push({
      id: generateConfirmId(),
      entityType: 'category',
      name: '分类待确认',
      confidence: 1.0,
      context: '请确认这条日记是工作还是个人内容',
      blockId: result.blockId
    });
  }

  // Process all entity types
  const entityTypes: (keyof AnalysisResult['entities'])[] = ['people', 'projects', 'things', 'ideas', 'knowledge'];

  for (const entityType of entityTypes) {
    const entities = result.entities[entityType];

    for (const entity of entities) {
      // Only include new entities that need confirmation
      if (entity.newEntity && !entity.isArchived) {
        const typeKey = entityType === 'people' ? 'person' :
                        entityType === 'projects' ? 'project' :
                        entityType === 'things' ? 'thing' :
                        entityType === 'ideas' ? 'idea' : 'knowledge';

        // Check if this entity is in needsConfirmation list
        const confirmKey = `${typeKey}:${entity.name}`;
        if (result.needsConfirmation.includes(confirmKey)) {
          items.push({
            id: generateConfirmId(),
            entityType: typeKey as EntityType,
            name: entity.name,
            confidence: entity.confidence,
            context: entity.context,
            blockId: result.blockId
          });
        }
      }
    }
  }

  return items;
}

/**
 * Convert confirmation item to entity creation input
 */
export function createEntityFromConfirmation(item: ConfirmationItem): EntityCreateInput {
  return {
    type: item.entityType as EntityType,
    title: item.name,
    titleRaw: item.name,
    aliases: [],
    tags: [],
    summary: item.context,
    confidence: item.confidence,
    verificationStatus: 'pending',
    createdAt: new Date().toISOString(),
    createdBy: 'human',
    lastUpdated: new Date().toISOString(),
    relatedEntities: [],
    interactions: [
      {
        timestamp: new Date().toISOString(),
        type: 'user_feedback',
        content: `用户确认创建实体: ${item.name}`,
        sourceBlockId: item.blockId
      }
    ],
    metadata: {
      status: 'active',
      source: 'diary'
    }
  };
}

/**
 * Get display label for entity type
 */
export function getEntityTypeLabel(type: EntityType): string {
  const labels: Record<EntityType, string> = {
    person: '人脉',
    project: '项目',
    thing: '物品',
    idea: '想法',
    knowledge: '知识'
  };
  return labels[type];
}

/**
 * Get emoji for entity type
 */
export function getEntityTypeEmoji(type: EntityType): string {
  const emojis: Record<EntityType, string> = {
    person: '👤',
    project: '📋',
    thing: '💡',
    idea: '💭',
    knowledge: '📚'
  };
  return emojis[type];
}
