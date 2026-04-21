/**
 * detect_entities Executor
 * High-efficiency entity detection for diary content
 */

import type { App } from 'obsidian';
import type { EntityManager } from '../../../../entities/manager';
import type { AIProvider } from '../../../../ai/provider';
import type { ToolExecutionResult } from '../../types';
import { EntityIndex, MatchResult } from '../../../src/ai/langgraph/entity-index';
import { extractPotentialNames } from '../../../src/ai/langgraph/string-matcher';

export interface DetectEntitiesInput {
  diaryContent: string;
  options?: {
    enableFuzzyMatch?: boolean;
    similarityThreshold?: number;
    includeLocalFiles?: boolean;
    includeWebLinks?: boolean;
    // Phase 2: Batch add_interaction support
    addInteractionsToArchived?: Array<{
      entityId: string;
      content: string;
    }>;
  };
}

export interface DetectedEntity {
  name: string;
  entityId?: string;
  type?: string;
  inferredType?: 'person' | 'project' | 'thing' | 'idea' | 'knowledge';
  subType?: string;  // e.g., '人', '项目', '任务', '产品/设备', '想法', '文章/文档'
  matchType?: 'exact' | 'alias' | 'simplified' | 'traditional' | 'trie' | 'edit_distance';
  confidence: number;
  reason?: string;
  // Phase 1: Auto-confirmation for high confidence inferred types
  autoConfirmed?: boolean;
}

// Threshold for auto-confirmation of inferred types
const AUTO_CONFIRM_THRESHOLD = 0.85;

// Singleton index cache
let entityIndexCache: EntityIndex | null = null;
let lastIndexTime: number = 0;
const INDEX_CACHE_TTL = 60 * 1000; // 1 minute cache

/**
 * Get or build entity index (with caching)
 */
async function getEntityIndex(entityManager: EntityManager): Promise<EntityIndex> {
  const now = Date.now();

  // Return cached index if fresh
  if (entityIndexCache && (now - lastIndexTime) < INDEX_CACHE_TTL) {
    return entityIndexCache;
  }

  // Build new index
  await entityManager.ensureInitialized();

  const entities = [
    ...await entityManager.getEntitiesByType('person'),
    ...await entityManager.getEntitiesByType('project'),
    ...await entityManager.getEntitiesByType('thing'),
    ...await entityManager.getEntitiesByType('idea'),
    ...await entityManager.getEntitiesByType('knowledge')
  ];

  entityIndexCache = new EntityIndex(entities);
  lastIndexTime = now;

  return entityIndexCache;
}

/**
 * Extract local file paths from text
 */
function extractLocalFilePaths(text: string): string[] {
  const paths: string[] = [];

  // Match ~/path/path.md or /Users/xxx/path.md
  const homePathRegex = /~\/[\w\-\/\.]+\.md/g;
  const absPathRegex = /\/[\w\-\/\.]+\.md/g;

  let match;
  while ((match = homePathRegex.exec(text)) !== null) {
    paths.push(match[0]);
  }
  while ((match = absPathRegex.exec(text)) !== null) {
    if (!match[0].startsWith('//')) { // Skip URLs
      paths.push(match[0]);
    }
  }

  return [...new Set(paths)]; // Deduplicate
}

/**
 * Extract web URLs from text
 */
function extractWebUrls(text: string): string[] {
  const urls: string[] = [];

  // Match http/https URLs
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;

  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    urls.push(match[0]);
  }

  return [...new Set(urls)]; // Deduplicate
}


/**
 * Detect entities in diary content
 */
export async function detectEntitiesExecutor(
  context: {
    entityManager: EntityManager;
    app?: App;
    aiProvider?: AIProvider;
    blockId?: string;
  },
  input: DetectEntitiesInput
): Promise<ToolExecutionResult> {
  try {
    // Ensure we have options
    const options = {
      enableFuzzyMatch: true,
      similarityThreshold: 0.8,
      includeLocalFiles: true,
      includeWebLinks: true,
      ...input.options
    };

    // Step 1: Get entity index
    const index = await getEntityIndex(context.entityManager);

    // Step 2: Extract potential entity names from text
    const detectedNames = extractPotentialNames(input.diaryContent);

    // Step 3: Batch lookup for archived entities
    const archivedMatches: DetectedEntity[] = [];
    const newEntityNames: string[] = [];

    for (const name of detectedNames) {
      const matchResult = index.findBestMatch(name);

      if (matchResult.entity && matchResult.matchType) {
        archivedMatches.push({
          name,
          entityId: matchResult.entity.id,
          type: matchResult.entity.type,
          matchType: matchResult.matchType as 'exact' | 'alias' | 'trie' | 'edit_distance',
          confidence: matchResult.confidence
        });
      } else {
        newEntityNames.push(name);
      }
    }

    // Step 4: Return new entity names for AI to infer types
    // Type inference is done by AI Agent based on SKILL.md rules
    const newEntities: DetectedEntity[] = newEntityNames.map(name => ({
      name,
      confidence: 0
    }));

    // Step 5: Extract local files and web links
    const localFiles = options.includeLocalFiles ? extractLocalFilePaths(input.diaryContent) : [];
    const webLinks = options.includeWebLinks ? extractWebUrls(input.diaryContent) : [];

    // Step 6: Handle batch add_interaction for archived entities
    const interactionResults: Array<{ entityId: string; success: boolean; error?: string }> = [];
    if (options.addInteractionsToArchived && options.addInteractionsToArchived.length > 0) {
      for (const interaction of options.addInteractionsToArchived) {
        try {
          await context.entityManager.addInteraction(interaction.entityId, {
            timestamp: new Date().toISOString(),
            type: 'diary_mention',
            content: interaction.content,
            sourceBlockId: context.blockId
          });
          interactionResults.push({ entityId: interaction.entityId, success: true });
        } catch (error) {
          interactionResults.push({
            entityId: interaction.entityId,
            success: false,
            error: (error as Error).message
          });
        }
      }
    }

    // Step 7: Return structured result
    return {
      success: true,
      data: {
        archivedMatches,
        newEntities,
        localFiles,
        webLinks,
        interactionResults: interactionResults.length > 0 ? interactionResults : undefined,
        summary: {
          totalArchivedFound: archivedMatches.length,
          totalNewFound: newEntities.length,
          totalLocalFiles: localFiles.length,
          totalWebLinks: webLinks.length,
          totalInteractionsAdded: interactionResults.filter(r => r.success).length
        }
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to detect entities: ${(error as Error).message}`
    };
  }
}

/**
 * Clear entity index cache (for testing or memory management)
 */
export function clearEntityIndexCache(): void {
  entityIndexCache = null;
  lastIndexTime = 0;
}
