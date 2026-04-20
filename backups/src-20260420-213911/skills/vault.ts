/**
 * Vault Skills
 * Handles file operations and search with Skill functions
 */

import { App, TFile, Vault } from 'obsidian';
import { Entity, EntityType } from '../entities/types';
import { EntityManager } from '../entities/manager';

const DIARY_FOLDER = 'Daily';

const ENTITY_FOLDERS: Record<EntityType, string> = {
  person: 'People',
  project: 'Projects',
  thing: 'Things',
  idea: 'Ideas',
  knowledge: 'Knowledge'
};

export async function searchVault(app: App, query: string, type: 'all' | 'diary' | 'entity' = 'all') {
  const results: {
    entities: Entity[];
    diaryEntries: any[];
  } = {
    entities: [],
    diaryEntries: []
  };

  // Search entities (always available as Skill)
  results.entities = await searchEntities(app, query, type === 'entity' ? [] : undefined);

  // Search diary entries if not restricted
  if (type !== 'entity') {
    results.diaryEntries = await searchDiary(app, query);
  }

  return results;
}

async function searchEntities(app: App, query: string, types?: EntityType[]): Promise<Entity[]> {
  // Use EntityManager search
  const entityManager = new EntityManager(app);
  return entityManager.searchEntities(query, types);
}

async function searchDiary(app: App, query: string): Promise<any[]> {
  const vault = app.vault as Vault;
  const files = vault.getMarkdownFiles();
  const results: any[] = [];

  for (const file of files) {
    if (file.path.startsWith(DIARY_FOLDER + '/')) {
      const content = await vault.read(file);
      if (content.toLowerCase().includes(query.toLowerCase())) {
        results.push({
          file: file.path,
          content: content.substring(0, 200)
        });
      }
    }
  }

  return results;
}

export async function createEntityWithSkill(
  app: App,
  entityType: EntityType,
  data: any,
  entityManager: EntityManager
): Promise<Entity> {
  // Validate required fields
  if (!data.title) {
    throw new Error('Entity title is required');
  }

  // Use Skill to create entity
  const entity = await entityManager.createEntity({
    type: entityType,
    title: data.title,
    titleRaw: data.titleRaw || data.title,
    aliases: data.aliases || [],
    tags: data.tags || [],
    summary: data.summary || '',
    confidence: data.confidence || 0.5,
    verificationStatus: 'pending',
    createdAt: new Date().toISOString(),
    createdBy: 'ai',
    lastUpdated: new Date().toISOString(),
    relatedEntities: (data.relatedEntities || []).map((id: string) => ({ entityId: id, relation: 'about', context: '' })),
    interactions: data.interactions || [],
    metadata: data.metadata || {}
  });

  return entity;
}

export async function updateEntityWithSkill(
  app: App,
  entityId: string,
  updates: Partial<Entity>,
  entityManager: EntityManager
): Promise<Entity | null> {
  return entityManager.updateEntity(entityId, updates);
}