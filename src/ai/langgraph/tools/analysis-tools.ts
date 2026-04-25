/**
 * Analysis Tools - 5步分析流程的Tool定义
 *
 * 每个工具定义清晰，包含使用场景和强制调用说明
 * 使用 JSON Schema 格式（OpenAI兼容）
 */

/**
 * JSON Schema 格式的工具参数定义
 */
const DETECT_ENTITIES_PARAMS = {
  type: 'object',
  properties: {
    diaryContent: {
      type: 'string',
      description: '日记原文内容'
    }
  },
  required: ['diaryContent']
};

const CONFIRM_ENTITY_TYPE_PARAMS = {
  type: 'object',
  properties: {
    entityName: {
      type: 'string',
      description: '实体名称'
    },
    options: {
      type: 'array',
      items: { type: 'string' },
      description: '可选类型列表'
    },
    confirmedType: {
      type: 'string',
      description: '用户确认的类型'
    }
  },
  required: ['entityName']
};

const DISCOVER_RELATION_PARAMS = {
  type: 'object',
  properties: {
    entity1: {
      type: 'string',
      description: '第一个实体名称'
    },
    entity2: {
      type: 'string',
      description: '第二个实体名称'
    },
    context: {
      type: 'string',
      description: '日记上下文'
    },
    relation: {
      type: 'string',
      description: '用户确认的关系类型'
    }
  },
  required: ['entity1', 'entity2']
};

const CHECK_CONFLICT_PARAMS = {
  type: 'object',
  properties: {
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string' }
        }
      },
      description: '待检测的实体列表'
    },
    relation: {
      type: 'string',
      description: '用户确认的关系'
    }
  }
};

const GENERATE_SUMMARY_PARAMS = {
  type: 'object',
  properties: {
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string' }
        }
      },
      description: '已确认的实体列表'
    },
    relations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          relation: { type: 'string' }
        }
      },
      description: '已确认的关系列表'
    },
    diaryContent: {
      type: 'string',
      description: '日记原文'
    },
    summary: {
      type: 'string',
      description: '生成的总结'
    },
    areas: {
      type: 'array',
      items: { type: 'string' },
      description: '提取的标签'
    }
  }
};

/**
 * 工具元数据定义
 */
export interface ToolDefinition {
  name: string;
  description: string;
  schema: Record<string, unknown>;  // JSON Schema格式
  systemPrompt: string;  // 专属于此工具的system prompt
}

/**
 * 5步分析流程的工具列表
 */
export const ANALYSIS_TOOLS: ToolDefinition[] = [
  {
    name: 'detect_entities',
    description: '识别日记中的实体（人物、项目、想法等）。必须调用此工具来发现实体，不要自己猜测。',
    schema: DETECT_ENTITIES_PARAMS,
    systemPrompt: `你是一个实体识别助手。

你的任务：识别日记中提到的人物、项目、想法等实体。

必须调用 detect_entities 工具来识别实体。
不要自己回答，不要猜测，直接调用工具。

输入是日记原文，工具会返回识别结果。`
  },
  {
    name: 'confirm_entity_type',
    description: '确认实体类型。向用户询问实体类型，等待用户回复后记录。',
    schema: CONFIRM_ENTITY_TYPE_PARAMS,
    systemPrompt: `你是一个实体类型确认助手。

你的任务：向用户确认每个实体的类型。

问法格式："[名字]是哪种？"
选项：人脉/项目/想法/知识/任务/地点

必须使用 confirm_entity_type 工具来询问用户。
等待用户回复后，继续问下一个实体。

如果用户没有回复，继续问同一个问题。`
  },
  {
    name: 'discover_relation',
    description: '发现实体间的关系。根据日记内容推断实体关系，询问用户确认。',
    schema: DISCOVER_RELATION_PARAMS,
    systemPrompt: `你是一个关系发现助手。

你的任务：根据日记内容，发现实体之间的关系。

问法格式："[实体A]和[实体B]什么关系？"
关系选项：客户/成员/负责人/相关/其他

必须使用 discover_relation 工具来询问用户。
等待用户回复后，记录关系并继续检查其他可能的配对。

如果日记中没有明显的关系，输出"未发现关系"。`
  },
  {
    name: 'check_conflict',
    description: '检测实体信息是否有冲突。如有矛盾，询问用户如何处理。',
    schema: CHECK_CONFLICT_PARAMS,
    systemPrompt: `你是一个冲突检测助手。

你的任务：检查已确认的实体信息是否有矛盾。

常见冲突：
- 同一个人被赋予不同类型（如既是客户又是供应商）
- 同一项目被赋予矛盾的状态
- 关系与实际不符

如果没有冲突，输出"无冲突"。
如果有冲突，问用户："[实体]的信息有冲突，怎么处理？"

必须使用 check_conflict 工具来处理。`
  },
  {
    name: 'generate_summary',
    description: '生成分析总结。生成50字以内的总结，提取#tag标签。',
    schema: GENERATE_SUMMARY_PARAMS,
    systemPrompt: `你是一个总结生成助手。

你的任务：生成简短的分析总结。

要求：
- 50字以内
- 包含主要实体和关系
- 提取1-2个#tag（如#工作 #个人 #学习）

示例："今天和张三讨论华为项目，他是项目负责人。#工作"

最后问用户："还有其他要补充的吗？"

必须使用 generate_summary 工具来生成总结。`
  }
];

/**
 * 根据步骤获取工具定义
 */
export function getToolForStep(step: 1 | 2 | 3 | 4 | 5): ToolDefinition {
  return ANALYSIS_TOOLS[step - 1];
}

/**
 * 获取工具的Zod schema
 */
export function getToolSchema(toolName: string): z.ZodType<any> | null {
  const tool = ANALYSIS_TOOLS.find(t => t.name === toolName);
  return tool?.schema || null;
}

/**
 * 获取工具的system prompt
 */
export function getToolSystemPrompt(toolName: string): string | null {
  const tool = ANALYSIS_TOOLS.find(t => t.name === toolName);
  return tool?.systemPrompt || null;
}
