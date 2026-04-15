/**
 * Analysis Panel
 * Handles AI analysis results display logic
 */

import { AnalysisResult, EntityPreview, EntityType } from '../entities/types';

/**
 * Display item for a single entity in the analysis panel
 */
export interface EntityDisplayItem {
  type: EntityType;
  name: string;
  confidence: number;
  context: string;
  isArchived: boolean;
  newEntity?: boolean;
  displayText: string;
  statusLabel: string;
}

/**
 * Summary of analysis results for display
 */
export interface AnalysisSummary {
  totalEntities: number;
  archivedCount: number;
  newCount: number;
  people: EntityDisplayItem[];
  projects: EntityDisplayItem[];
  things: EntityDisplayItem[];
  ideas: EntityDisplayItem[];
  knowledge: EntityDisplayItem[];
}

/**
 * Convert EntityPreview to display item
 */
function toDisplayItem(entity: EntityPreview): EntityDisplayItem {
  return {
    type: entity.type,
    name: entity.name,
    confidence: entity.confidence,
    context: entity.context,
    isArchived: entity.isArchived,
    newEntity: entity.newEntity,
    displayText: entity.name,
    statusLabel: entity.isArchived ? '已归档' : '未归档'
  };
}

/**
 * Generate analysis summary from analysis result
 * Used for displaying in the analysis panel
 */
export function generateAnalysisSummary(result: AnalysisResult): AnalysisSummary {
  const summary: AnalysisSummary = {
    totalEntities: 0,
    archivedCount: 0,
    newCount: 0,
    people: [],
    projects: [],
    things: [],
    ideas: [],
    knowledge: []
  };

  // Process people
  for (const entity of result.entities.people) {
    const item = toDisplayItem(entity);
    summary.people.push(item);
    summary.totalEntities++;
    if (entity.isArchived) summary.archivedCount++;
    if (entity.newEntity) summary.newCount++;
  }

  // Process projects
  for (const entity of result.entities.projects) {
    const item = toDisplayItem(entity);
    summary.projects.push(item);
    summary.totalEntities++;
    if (entity.isArchived) summary.archivedCount++;
    if (entity.newEntity) summary.newCount++;
  }

  // Process things
  for (const entity of result.entities.things) {
    const item = toDisplayItem(entity);
    summary.things.push(item);
    summary.totalEntities++;
    if (entity.isArchived) summary.archivedCount++;
    if (entity.newEntity) summary.newCount++;
  }

  // Process ideas
  for (const entity of result.entities.ideas) {
    const item = toDisplayItem(entity);
    summary.ideas.push(item);
    summary.totalEntities++;
    if (entity.isArchived) summary.archivedCount++;
    if (entity.newEntity) summary.newCount++;
  }

  // Process knowledge
  for (const entity of result.entities.knowledge) {
    const item = toDisplayItem(entity);
    summary.knowledge.push(item);
    summary.totalEntities++;
    if (entity.isArchived) summary.archivedCount++;
    if (entity.newEntity) summary.newCount++;
  }

  return summary;
}

/**
 * Get section title for entity type
 */
export function getSectionTitle(type: keyof AnalysisSummary): string {
  const titles: Record<keyof AnalysisSummary, string> = {
    people: '人脉',
    projects: '项目',
    things: '物品',
    ideas: '想法',
    knowledge: '知识',
    totalEntities: '',
    archivedCount: '',
    newCount: ''
  };
  return titles[type] || '';
}

/**
 * Get emoji for entity type
 */
export function getEntityEmoji(type: EntityType): string {
  const emojis: Record<EntityType, string> = {
    person: '👤',
    project: '📋',
    thing: '💡',
    idea: '💭',
    knowledge: '📚'
  };
  return emojis[type] || '📄';
}
