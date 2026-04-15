/**
 * Skill executor that coordinates AI provider and entity manager
 * Provides unified Skill interface for Block Editor
 */

import { App } from 'obsidian';
import { AIProvider } from '../ai/provider';
import { EntityManager } from '../entities/manager';
import { AnalysisResult, Entity, EntityType } from '../entities/types';
import { analyzeBlockWithSkills, createNewEntitiesWithSkills } from './analyzer';
import { searchVault, createEntityWithSkill, updateEntityWithSkill } from './vault';

export interface SkillExecutor {
  analyzeBlock(block: any): Promise<AnalysisResult>;
  search(query: string, type?: 'all' | 'diary' | 'entity'): Promise<any>;
  createEntity(entityType: EntityType, data: any, entityManager: EntityManager): Promise<any>;
  updateEntity(entityId: string, updates: any, entityManager: EntityManager): Promise<any>;
}

export function createSkillExecutor(app: any, provider: AIProvider, entityManager: EntityManager): SkillExecutor {
  return {
    async analyzeBlock(block) {
      const result = await analyzeBlockWithSkills(block, provider, entityManager, app);
      return {
        ...result,
        skillsUsed: ['analyze_entity', 'search_vault'],
        entitiesAnalyzed: result.entities.people.length +
          result.entities.projects.length +
          result.entities.things.length +
          result.entities.ideas.length +
          result.entities.knowledge.length
      };
    },
    async search(query, type = 'all') {
      return searchVault(app, query, type);
    },
    async createEntity(entityType, data, entityManager) {
      return createEntityWithSkill(app, entityType, data, entityManager);
    },
    async updateEntity(entityId, updates, entityManager) {
      return updateEntityWithSkill(app, entityId, updates, entityManager);
    }
  };
}