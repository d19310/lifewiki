/**
 * detect_entities Executor - AI-powered entity detection
 *
 * Uses AI to identify entities in diary content:
 * - people (人脉)
 * - projects (项目/任务)
 * - things (物品/设备)
 * - ideas (想法/灵感)
 * - knowledge (知识/文档)
 *
 * Then matches against archived entities using entity index.
 */

import type { App } from 'obsidian';
import type { EntityManager } from '../../../../entities/manager';
import type { AIProvider } from '../../../../ai/provider';
import type { ToolExecutionResult } from '../../types';
import { EntityIndex, MatchResult } from '../../../src/ai/langgraph/entity-index';

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
  subType?: string;
  matchType?: 'exact' | 'alias' | 'simplified' | 'traditional' | 'trie' | 'edit_distance';
  confidence: number;
  reason?: string;
  autoConfirmed?: boolean;
}

// Singleton index cache
let entityIndexCache: EntityIndex | null = null;
let lastIndexTime: number = 0;
const INDEX_CACHE_TTL = 60 * 1000; // 1 minute cache

/**
 * Get or build entity index (with caching)
 */
async function getEntityIndex(entityManager: EntityManager): Promise<EntityIndex> {
  const now = Date.now();
  if (entityIndexCache && (now - lastIndexTime) < INDEX_CACHE_TTL) {
    return entityIndexCache;
  }

  const entities = entityManager.getAllEntities();
  entityIndexCache = new EntityIndex();
  entityIndexCache.buildIndex(entities);
  lastIndexTime = now;
  return entityIndexCache;
}

/**
 * Use AI to identify entities in diary content
 */
async function AIIdentifyEntities(
  diaryContent: string,
  aiProvider: AIProvider
): Promise<Array<{ name: string; inferredType: string; confidence: number; reason: string }>> {
  const systemPrompt = `你是一个实体识别专家。分析日记内容，识别其中提到的人物、项目、任务、想法、知识等实体。

返回JSON格式：
{"entities": [{"name": "实体名称", "inferredType": "person|project|task|location|idea|knowledge", "confidence": 0.0-1.0, "reason": "识别理由"}]}

规则：
- person: 具体人名（如张成、李四）
- project: 有明确目标的工作、项目名称（如"华为项目"、"新版本开发"）
- task: 具体任务、待办事项
- location: 地点、场所（如"机房间"、"办公室"）
- idea: 想法、灵感、概念
- knowledge: 文章、书籍、课程、文档

重要：
- 公司名（如烽火公司、华为）不要作为实体返回，它们是人脉的元数据
- 如果日记中说"烽火公司的张成"，只返回张成（person），烽火公司是这个人的公司属性
- 只有当公司名独立出现且不是某个人所属时，才可以考虑返回location

只返回真正在日记中明确提到的实体。`;

  const userMessage = `日记内容：\n${diaryContent}`;

  try {
    const response = await aiProvider.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ]);

    // Parse JSON from response
    const text = response.content || '';
    console.log('[detect_entities] AI response:', text.substring(0, 200));
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.entities || [];
    }
    return [];
  } catch (error) {
    console.error('[detect_entities] AI identification failed:', error);
    return [];
  }
}

/**
 * Extract local file paths from text
 */
function extractLocalFilePaths(text: string): string[] {
  const paths: string[] = [];
  // Match ~/path, /path, or drive:\path
  const pathRegex = /(?:~|\/|[A-Za-z]:\\)[^\s,，.。]+/g;
  let match;
  while ((match = pathRegex.exec(text)) !== null) {
    paths.push(match[0]);
  }
  return paths;
}

/**
 * Extract web URLs from text
 */
function extractWebUrls(text: string): string[] {
  const urls: string[] = [];
  const urlRegex = /https?:\/\/[^\s,，.。]+/g;
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    urls.push(match[0]);
  }
  return urls;
}

/**
 * Main executor function
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
    console.log('[detect_entities] Starting AI-powered entity detection');
    console.log('[detect_entities] Content:', input.diaryContent.substring(0, 50));

    // Ensure we have options
    const options = {
      enableFuzzyMatch: true,
      similarityThreshold: 0.8,
      includeLocalFiles: true,
      includeWebLinks: true,
      ...input.options
    };

    // Step 1: Get entity index for matching
    const index = await getEntityIndex(context.entityManager);

    // Step 2: Use AI to identify entities in diary content
    let aiIdentifiedEntities: Array<{ name: string; inferredType: string; confidence: number; reason: string }> = [];
    if (context.aiProvider) {
      aiIdentifiedEntities = await AIIdentifyEntities(input.diaryContent, context.aiProvider);
      console.log('[detect_entities] AI identified entities:', aiIdentifiedEntities.length);
    } else {
      console.log('[detect_entities] No AI provider, skipping AI identification');
    }

    // Step 3: Match AI-identified entities against archived entities
    const archivedMatches: DetectedEntity[] = [];
    const newEntities: DetectedEntity[] = [];

    for (const entity of aiIdentifiedEntities) {
      const matchResult = index.findBestMatch(entity.name);

      if (matchResult.entity && matchResult.matchType) {
        // Found in archive
        archivedMatches.push({
          name: entity.name,
          entityId: matchResult.entity.id,
          type: matchResult.entity.type,
          inferredType: entity.inferredType as any,
          matchType: matchResult.matchType as any,
          confidence: Math.min(matchResult.confidence, entity.confidence),
          reason: entity.reason,
          autoConfirmed: entity.confidence >= 0.85
        });
      } else {
        // New entity (not in archive)
        newEntities.push({
          name: entity.name,
          inferredType: entity.inferredType as any,
          confidence: entity.confidence,
          reason: entity.reason,
          autoConfirmed: entity.confidence >= 0.85
        });
      }
    }

    // Step 4: Extract local files and web links
    const localFiles = options.includeLocalFiles ? extractLocalFilePaths(input.diaryContent) : [];
    const webLinks = options.includeWebLinks ? extractWebUrls(input.diaryContent) : [];

    // Step 5: Handle batch add_interaction for archived entities
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

    console.log('[detect_entities] Results:', {
      archived: archivedMatches.length,
      new: newEntities.length,
      files: localFiles.length,
      links: webLinks.length
    });

    // Step 6: Return structured result
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
    console.error('[detect_entities] Error:', error);
    return {
      success: false,
      error: `Detect entities failed: ${(error as Error).message}`
    };
  }
}
