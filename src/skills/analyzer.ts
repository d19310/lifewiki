/**
 * Skill-enhanced Block Analyzer
 * Uses AI provider and entity manager to analyze blocks with Skill functions
 */

import { AIProvider } from '../ai/provider';
import { EntityManager } from '../entities/manager';
import { Block, AnalysisResult, EntityPreview, Entity } from '../entities/types';
import { searchVault } from './vault';

export async function analyzeBlockWithSkills(
  block: Block,
  provider: AIProvider,
  entityManager: EntityManager,
  app: any
): Promise<AnalysisResult> {
  // Use AI provider to analyze
  const result = await provider.analyzeBlock(block.content);

  // Cross-reference with existing entities using Skill
  const enrichedResult = await enrichWithExistingEntities(result, entityManager, app);

  return enrichedResult;
}

async function enrichWithExistingEntities(
  result: AnalysisResult,
  entityManager: EntityManager,
  app: any
): Promise<AnalysisResult> {
  const enrichEntityList = async (entities: EntityPreview[]): Promise<EntityPreview[]> => {
    const enriched: EntityPreview[] = [];

    for (const entity of entities) {
      const existing = entityManager.findEntity(entity.name);

      enriched.push({
        ...entity,
        isArchived: !!existing,
        newEntity: !existing
      });

      // If entity exists, add its interactions via Skill
      if (existing) {
        await entityManager.addInteraction(existing.id, {
          timestamp: new Date().toISOString(),
          type: 'diary_mention',
          content: entity.context,
          sourceBlockId: result.blockId
        });
      }
    }

    return enriched;
  };

  return {
    ...result,
    entities: {
      people: await enrichEntityList(result.entities.people),
      projects: await enrichEntityList(result.entities.projects),
      things: await enrichEntityList(result.entities.things),
      ideas: await enrichEntityList(result.entities.ideas),
      knowledge: await enrichEntityList(result.entities.knowledge)
    }
  };
}

export async function createNewEntitiesWithSkills(
  result: AnalysisResult,
  entityManager: EntityManager,
  app: any
): Promise<Entity[]> {
  const created: Entity[] = [];

  for (const [type, entities] of Object.entries(result.entities)) {
    for (const entityPreview of entities) {
      if (entityPreview.newEntity) {
        const entity = await entityManager.createEntity({
          type: entityPreview.type,
          title: entityPreview.name,
          titleRaw: entityPreview.name,
          aliases: [],
          tags: [],
          summary: entityPreview.context,
          confidence: entityPreview.confidence,
          verificationStatus: 'pending',
          createdAt: new Date().toISOString(),
          createdBy: 'ai',
          lastUpdated: new Date().toISOString(),
          relatedEntities: [],
          interactions: [{
            timestamp: new Date().toISOString(),
            type: 'ai_analysis',
            content: `AI 分析识别: ${entityPreview.context}`,
            sourceBlockId: result.blockId
          }],
          metadata: {
            status: 'active',
            source: 'diary'
          }
        });

        created.push(entity);
      }
    }
  }

  return created;
}