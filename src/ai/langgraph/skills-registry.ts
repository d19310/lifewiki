/**
 * Skills Registry
 * Maps skill names to their implementations for the AI agent
 */

import { z } from 'zod';
import type { EntityManager } from '../../entities/manager';
import type { App } from 'obsidian';
import type { AIProvider } from '../../ai/provider';
import type { ToolExecutionResult } from './types';

// Import all skill executors
import { listEntitiesExecutor } from '../../../.lifewiki/skills/list_entities/executor';
import { searchEntityExecutor } from '../../../.lifewiki/skills/search_entity/executor';
import { createEntityExecutor } from '../../../.lifewiki/skills/create_entity/executor';
import { addInteractionExecutor } from '../../../.lifewiki/skills/add_interaction/executor';
import { linkEntitiesExecutor } from '../../../.lifewiki/skills/link_entities/executor';
import { updateEntityExecutor } from '../../../.lifewiki/skills/update_entity/executor';
import { readLocalDocumentExecutor } from '../../../.lifewiki/skills/read_local_document/executor';
import { clipAndSummarizeExecutor } from '../../../.lifewiki/skills/clip_and_summarize/executor';
import { detectEntitiesExecutor } from '../../../.lifewiki/skills/detect_entities/executor';
import { processEntitiesExecutor } from '../../../.lifewiki/skills/process_entities/executor';
import { detectConflictsExecutor } from '../../../.lifewiki/skills/detect_conflicts/executor';
import { processUpdatesExecutor } from '../../../.lifewiki/skills/process_updates/executor';
import { updateBlockMetadataExecutor } from '../../../.lifewiki/skills/update_block_metadata/executor';

/**
 * Skill definition interface
 */
export interface SkillDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType<any>;
  execute: (context: SkillContext, input: any) => Promise<ToolExecutionResult>;
}

/**
 * Skill execution context
 */
export interface SkillContext {
  entityManager: EntityManager;
  app: App;
  aiProvider?: AIProvider;
  blockId?: string;
}

/**
 * Skills registry
 */
class SkillsRegistry {
  private skills: Map<string, SkillDefinition> = new Map();
  private initialized = false;

  /**
   * Initialize the registry with all available skills
   */
  registerAll(): void {
    if (this.initialized) return;

    // list_entities
    this.register({
      name: 'list_entities',
      description: '批量获取 vault 中指定类型的所有已归档实体',
      inputSchema: z.object({
        entityType: z.enum(['person', 'project', 'thing', 'idea', 'knowledge']),
        status: z.enum(['active', 'archived', 'all']).optional().default('active')
      }),
      execute: async (context, input) => {
        return listEntitiesExecutor(context.entityManager, input);
      }
    });

    // search_entity
    this.register({
      name: 'search_entity',
      description: '在已归档实体中搜索与给定名称匹配的单个实体',
      inputSchema: z.object({
        name: z.string()
      }),
      execute: async (context, input) => {
        return searchEntityExecutor(context.entityManager, input);
      }
    });

    // create_entity
    this.register({
      name: 'create_entity',
      description: '创建新的实体档案并写入 vault',
      inputSchema: z.object({
        entityType: z.enum(['person', 'project', 'thing', 'idea', 'knowledge']),
        name: z.string(),
        summary: z.string().optional(),
        metadata: z.record(z.any()).optional()
      }),
      execute: async (context, input) => {
        if (!context.app) {
          return { success: false, error: 'App context not available' };
        }
        return createEntityExecutor(context.app, context.entityManager, input);
      }
    });

    // add_interaction
    this.register({
      name: 'add_interaction',
      description: '为已有实体添加互动记录',
      inputSchema: z.object({
        entityId: z.string(),
        content: z.string(),
        sourceBlockId: z.string().optional()
      }),
      execute: async (context, input) => {
        return addInteractionExecutor(context.entityManager, input);
      }
    });

    // link_entities
    this.register({
      name: 'link_entities',
      description: '批量建立实体间的双向关联关系',
      inputSchema: z.object({
        links: z.array(z.object({
          entityIdA: z.string(),
          entityIdB: z.string(),
          relation: z.enum(['负责人', '成员', '相关', '同一项目', '同一任务', '属于', '包含', '对立', '上下游', '合作', '替代', '组成']),
          context: z.string().optional()
        }))
      }),
      execute: async (context, input) => {
        return linkEntitiesExecutor(context, input);
      }
    });

    // update_entity
    this.register({
      name: 'update_entity',
      description: '更新已有实体的字段信息',
      inputSchema: z.object({
        entityId: z.string(),
        updates: z.record(z.any())
      }),
      execute: async (context, input) => {
        return updateEntityExecutor(context.entityManager, input);
      }
    });

    // read_local_document
    this.register({
      name: 'read_local_document',
      description: '读取本地文件系统中的 Markdown 文档内容',
      inputSchema: z.object({
        path: z.string()
      }),
      execute: async (context, input) => {
        if (!context.app) {
          return { success: false, error: 'App context not available' };
        }
        return readLocalDocumentExecutor(context.app, input);
      }
    });

    // clip_and_summarize
    this.register({
      name: 'clip_and_summarize',
      description: '抓取网页内容并生成摘要总结',
      inputSchema: z.object({
        url: z.string().url()
      }),
      execute: async (context, input) => {
        if (!context.aiProvider) {
          return { success: false, error: 'AI Provider not available' };
        }
        return clipAndSummarizeExecutor(context.aiProvider, input);
      }
    });

    // detect_entities
    this.register({
      name: 'detect_entities',
      description: '高效检测日记中的实体，支持精确匹配、别名匹配、Trie前缀匹配、编辑距离匹配',
      inputSchema: z.object({
        diaryContent: z.string(),
        options: z.object({
          enableFuzzyMatch: z.boolean().optional(),
          similarityThreshold: z.number().optional(),
          includeLocalFiles: z.boolean().optional(),
          includeWebLinks: z.boolean().optional()
        }).optional()
      }),
      execute: async (context, input) => {
        if (!context.entityManager) {
          return { success: false, error: 'Entity manager not available' };
        }
        return detectEntitiesExecutor(context as any, input);
      }
    });

    // process_entities
    this.register({
      name: 'process_entities',
      description: '批量处理实体操作——创建实体、添加互动记录、关联实体',
      inputSchema: z.object({
        entities: z.array(z.object({
          name: z.string().optional(),
          action: z.enum(['create', 'add_interaction', 'link']),
          entityId: z.string().optional(),
          entityType: z.enum(['person', 'project', 'thing', 'idea', 'knowledge']).optional(),
          summary: z.string().optional(),
          content: z.string().optional(),
          metadata: z.record(z.any()).optional(),
          entityIdA: z.string().optional(),
          entityIdB: z.string().optional(),
          relation: z.string().optional(),
          context: z.string().optional()
        })),
        options: z.object({
          skipOnConflict: z.boolean().optional()
        }).optional()
      }),
      execute: async (context, input) => {
        if (!context.entityManager) {
          return { success: false, error: 'Entity manager not available' };
        }
        return processEntitiesExecutor(context as any, input);
      }
    });

    // detect_conflicts
    this.register({
      name: 'detect_conflicts',
      description: '检测日记内容与实体档案之间的事实冲突',
      inputSchema: z.object({
        entityId: z.string(),
        diaryContent: z.string(),
        options: z.object({
          checkFields: z.array(z.string()).optional(),
          strictMode: z.boolean().optional()
        }).optional()
      }),
      execute: async (context, input) => {
        if (!context.entityManager) {
          return { success: false, error: 'Entity manager not available' };
        }
        return detectConflictsExecutor(context as any, input);
      }
    });

    // process_updates
    this.register({
      name: 'process_updates',
      description: '批量更新多个实体的字段信息',
      inputSchema: z.object({
        updates: z.array(z.object({
          entityId: z.string(),
          changes: z.record(z.any()),
          reason: z.string().optional()
        })),
        options: z.object({
          skipOnError: z.boolean().optional()
        }).optional()
      }),
      execute: async (context, input) => {
        if (!context.entityManager) {
          return { success: false, error: 'Entity manager not available' };
        }
        return processUpdatesExecutor(context as any, input);
      }
    });

    // update_block_metadata
    this.register({
      name: 'update_block_metadata',
      description: '更新 block 的领域标签和分类',
      inputSchema: z.object({
        blockId: z.string(),
        updates: z.object({
          category: z.enum(['工作', '个人', '待确认']).optional(),
          areas: z.array(z.string()).optional()
        })
      }),
      execute: async (context, input) => {
        if (!context.app) {
          return { success: false, error: 'App context not available' };
        }
        return updateBlockMetadataExecutor(context as any, input);
      }
    });

    this.initialized = true;
  }

  /**
   * Register a skill
   */
  private register(definition: SkillDefinition): void {
    this.skills.set(definition.name, definition);
  }

  /**
   * Get a skill by name
   */
  get(name: string): SkillDefinition | undefined {
    return this.skills.get(name);
  }

  /**
   * Get all registered skills
   */
  getAll(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get skill names
   */
  getSkillNames(): string[] {
    return Array.from(this.skills.keys());
  }

  /**
   * Check if a skill exists
   */
  has(name: string): boolean {
    return this.skills.has(name);
  }
}

// Singleton instance
export const skillsRegistry = new SkillsRegistry();

/**
 * Initialize the skills registry
 */
export function initializeSkillsRegistry(): void {
  skillsRegistry.registerAll();
}

/**
 * Get skill definitions for AI prompt
 */
export function getSkillDefinitionsForPrompt(): string {
  const skills = skillsRegistry.getAll();

  const lines: string[] = [
    '# LifeWiki Agent 可用技能',
    '',
    '## 技能列表',
    ''
  ];

  for (const skill of skills) {
    lines.push(`### ${skill.name}`);
    lines.push(skill.description);
    lines.push('');
  }

  return lines.join('\n');
}
