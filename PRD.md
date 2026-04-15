# LifeWiki 产品规格文档 V0.1

## 1. 产品概述

### 1.1 产品定位

LifeWiki 是一款 Obsidian 插件，通过 AI 辅助实现流水账式日记分析，挖掘用户的人脉、项目、物品、想法和知识，形成 Agent 友好的 Wiki 知识库，作为通用 Agent（如 OpenClaw）的记忆系统之一。

### 1.2 核心价值

- **更顺滑的日记体验**：区别于 Obsidian 原生日记 UI，提供更直观、更容易进入心流的 Block 输入方式
- **AI 驱动的知识挖掘**：实时分析日记，识别实体并通过对话补充元数据
- **Agent 记忆系统**：以 Skill 形式为通用 Agent 提供 Wiki 搜索/写入能力

### 1.3 目标用户

- Obsidian 重度用户
- 知识管理、Second Brain 实践者
- 需要 AI 辅助分析日记的个人用户

---

## 2. 产品架构

### 2.1 三栏式 UI

```
┌─────────────────────────────────────────────────────────────────┐
│                         Obsidian 主界面                          │
├────────────┬────────────────────────────┬──────────────────────┤
│            │                            │                      │
│  左侧栏    │        中栏（白板）          │      右侧栏          │
│  Obsidian  │    日记 Block 瀑布流        │    AI 对话框         │
│  原生文件  │    流水账式输入              │    实时响应          │
│  管理器    │                            │                      │
│            │    ┌──────────────────┐    │    ┌────────────┐  │
│            │    │ Block 1 #工作   │    │    │ AI 分析   │  │
│            │    │ 08:30  内容...   │    │    │ 人脉识别  │  │
│            │    └──────────────────┘    │    │ 项目识别  │  │
│            │           │               │    │ 对话补充  │  │
│            │           ▼ 子Block        │    └────────────┘  │
│            │    ┌──────────────────┐    │                      │
│            │    │ Block 2 #个人   │    │                      │
│            │    │ 09:15  内容...   │    │                      │
│            │    └──────────────────┘    │                      │
│            │                            │                      │
│            │    ┌──────────────────┐    │                      │
│            │    │ 输入框 (≤250字)  │    │                      │
│            │    └──────────────────┘    │                      │
└────────────┴────────────────────────────┴──────────────────────┘
```

### 2.2 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                    LifeWiki 插件                              │
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │
│  │ AI Provider │    │ Skill       │    │ Vault       │ │
│  │ (LLM API)  │◄──►│ (函数定义)  │◄──►│ (脚本读写)  │ │
│  └─────────────┘    └─────────────┘    └─────────────┘ │
│         │                  │                   │           │
│         ▼                  ▼                   ▼           │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │
│  │ OpenAI     │    │ Skill       │    │ Node.js     │ │
│  │ Claude     │    │ Executor    │    │ 文件操作    │ │
│  │ Ollama     │    │             │    │ (fs 模块)   │ │
│  │ 自定义 API │    │             │    │             │ │
│  └─────────────┘    └─────────────┘    └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 AI Provider 层

支持多种 LLM 提供者，松耦合设计：

| Provider | 说明 | 配置 |
|----------|------|------|
| `ollama` | 本地模型（如 qwen2.5、llama3） | `baseUrl: http://localhost:11434` |
| `openai` | OpenAI API | `apiKey` + `model` |
| `claude` | Anthropic Claude | `apiKey` + `model` |
| `custom` | 自定义 API（兼容 OpenAI 格式） | `baseUrl` + `apiKey` |

### 2.4 Skill 系统

插件内部实现 Skill 函数，供 AI 调用：

| Skill | 说明 | 参数 |
|-------|------|------|
| `search_vault` | 搜索 Vault | `query: string, type?: string` |
| `read_diary` | 读取日记 | `date: YYYY-MM-DD` |
| `write_block` | 写入 Block | `date, content, category` |
| `create_entity` | 创建实体 | `entityType, name, summary, metadata` |
| `update_entity` | 更新实体 | `entityId, updates` |
| `get_entity` | 获取实体 | `entityId` |
| `list_entities` | 列出实体 | `type, status` |
| `get_entity_history` | 获取实体历史 | `entityId` |

### 2.5 Vault 操作

直接用 Node.js `fs` 模块读写文件，不依赖外部 CLI：

```typescript
// 读取实体
const content = await app.vault.read(file);

// 写入实体
await app.vault.create(filePath, content);
// 或
await app.vault.modify(file, content);

// 搜索（Obsidian 内置）
app.vault.search(query);
```

### 2.6 数据存储

Vault 文件结构：
```
Vault/
├── Daily/                      # 日记（Obsidian 原生格式）
│   ├── 2026-04-12.md
│   └── 2026-04-12_analysis.md  # AI 每日复盘（LifeWiki 生成）
├── People/                     # 人脉实体
│   ├── 方刚.md
│   └── 顾伟乐.md
├── Projects/                   # 项目/事
│   └── 青岛移动B300项目.md
├── Things/                     # 物品（新增）
│   └── ...
├── Ideas/                      # 想法
│   └── ...
├── Knowledge/                  # 知识
│   └── Agent文件审核指南.md
└── .lifewiki/                  # LifeWiki 私有数据（隐藏）
    └── analysis_cache.json     # AI 分析缓存
```

---

## 3. 功能详细设计

### 3.1 Block 日记编辑器

#### 3.1.1 Block 结构

每条日记输入生成一个 Block：

```markdown
### HH:mm [Lifewiki] #工作/ #个人
这是日记内容，最多250字；
- HH:mm 子Block内容（追加模式）
```

**Block 特征**：
- 顶部时间戳 `HH:mm`
- 渠道标签 `[Lifewiki]`
- 工作/个人分类标签 `#工作` 或 `#个人`
- 支持子 Block（追加模式）

#### 3.1.2 输入框

- 位置：中栏底部，悬浮形态
- 字数限制：250 字
- 支持：文字、图片（ Obsidian 原生附件）
- 交互：
  - 输入完成 → 回车 → Block 生成
  - Cmd/Ctrl + Enter → 发送

#### 3.1.3 Block 操作

| 操作 | 行为 |
|------|------|
| 选中 | 高亮，显示追加/探索按钮 |
| 追加 | 选中 Block 后，在其下方添加子 Block |
| 删除 | 父 Block 删除 → 弹出：删除子Block 或保留子Block |
| 编辑 | 点击 Block 内容直接编辑 |

### 3.2 AI 实时分析

#### 3.2.1 触发时机

每条 Block 输入后**立即触发** AI 分析。

#### 3.2.2 AI 分析流程

```
Block 输入
    │
    ▼
AI 识别实体（人/事/物/想法/知识）
    │
    ├─── 已归档 ───→ 更新实体文件（追加 ## YYYY-MM-DD 更新）
    │                  同时更新 frontmatter last_updated
    │
    └─── 未归档 ───→ AI 对话引导用户补充信息
                        │
                        ▼
                   用户确认后创建实体草稿
                   status: pending_review
                        │
                        ▼
                   用户确认归档
```

#### 3.2.3 AI 分析输出

实体识别结果（显示在右侧栏）：

```
┌─────────────────────────────┐
│ 🔍 AI 分析                    │
├─────────────────────────────┤
│ 👤 人脉                       │
│   - 顾伟乐（已归档）           │
│   - Alan（未归档）→ 询问中     │
│                             │
│ 📋 项目                       │
│   - 青岛移动B300项目（已归档）  │
│   - 北京顺义算力项目（未归档）  │
│                             │
│ 💡 想法                       │
│   - 待识别                    │
│                             │
│ 📚 知识                       │
│   - https://...（链接剪藏）   │
└─────────────────────────────┘
```

### 3.3 实体分类与元数据

> **设计原则**：对 AI 友好，便于程序解析和维护。人类可读性降为次要目标。

#### 3.3.1 AI 友好的 frontmatter 设计原则

```yaml
# 所有实体通用字段
---
# 基础标识（AI 生成，不可编辑）
entity_id: "uuid-v4"           # 全局唯一 ID
entity_type: "person|project|thing|idea|knowledge"  # 实体类型
created_at: "2026-04-12T08:30:00Z"  # ISO 8601 时间戳
created_by: "ai|human"         # 创建来源

# 可信度与状态
confidence: 0.95                # AI 置信度 0-1
verification_status: "pending|verified|rejected"  # 人工审核状态
last_verified_at: "2026-04-12T08:30:00Z"

# 内容（AI 维护）
title: "实体名称"               # 标准化的标题
title_raw: "原始提及形式"       # 原始输入（如"小王"、"王老板"）
aliases: ["别名1", "别名2"]     # AI 推理的别名/昵称
tags: ["标签1", "标签2"]         # AI 生成的分类标签
summary: "一句话描述"            # AI 生成的一句话概括

# 关联（AI 维护，交叉引用）
related_entities:
  - entity_id: "xxx"
    relation: "mentioned_in|part_of|related_to|update_of"
    context: "在 XXX 日记中提及"
  - entity_id: "yyy"
    relation: "part_of"
    context: "关联项目"

# 交互历史（append-only）
interactions:
  - timestamp: "2026-04-12T08:30:00Z"
    type: "diary_mention|ai_analysis|user_feedback|update"
    content: "..."
    source_block_id: "block-uuid"

# 元数据（人类或 AI 补充）
metadata:
  status: "active|archived"
  priority: "high|medium|low"
  # ... 各类型特有字段
---

# 标题（人类友好）
正文...
```

---

#### 3.3.2 人脉 (People)

```yaml
---
entity_id: "550e8400-e29b-41d4-a716-446655440001"
entity_type: "person"
created_at: "2026-04-12T08:30:00Z"
created_by: "ai"
confidence: 0.85
verification_status: "pending"
last_verified_at: null

title: "顾伟乐"
title_raw: "顾伟乐"
aliases: []
tags: ["同事", "商务"]
summary: "青岛移动B300项目对接人"

related_entities:
  - entity_id: "550e8400-e29b-41d4-a716-446655440002"
    relation: "part_of"
    context: "青岛移动B300项目负责人"

interactions:
  - timestamp: "2026-04-12T08:25:00Z"
    type: "diary_mention"
    content: "和顾伟乐聊了青岛移动B300项目的情况"
    source_block_id: "block-abc123"

metadata:
  status: "active"
  company: "青岛移动"
  position: "项目经理"
  first_contact: "2026-04-12"
  contact_channel: "Discord"
  importance: "high"
---

# 顾伟乐

## 基本信息
- **公司**: 青岛移动
- **职位**: 项目经理
- **首次接触**: 2026-04-12
- **渠道**: Discord

## 背景
待补充

## 互动记录
- 2026-04-12: 讨论青岛移动B300项目 → [[2026-04-12]]

## 跟进事项
- [ ] 补充公司背景
- [ ] 补充职位详情
```

---

#### 3.3.3 项目 (Projects)

```yaml
---
entity_id: "550e8400-e29b-41d4-a716-446655440002"
entity_type: "project"
created_at: "2026-04-12T08:30:00Z"
created_by: "ai"
confidence: 0.90
verification_status: "verified"
last_verified_at: "2026-04-12T10:00:00Z"

title: "青岛移动B300项目"
title_raw: "青岛移动B300项目"
aliases: ["青岛B300", "QDB300"]
tags: ["算力", "B300", "青岛移动"]
summary: "青岛移动B300服务器采购项目"

related_entities:
  - entity_id: "550e8400-e29b-41d4-a716-446655440001"
    relation: "mentioned_in"
    context: "顾伟乐是项目对接人"

interactions:
  - timestamp: "2026-04-12T08:25:00Z"
    type: "diary_mention"
    content: "和顾伟乐聊了青岛移动B300项目的情况"
    source_block_id: "block-abc123"

metadata:
  status: "active"
  priority: "high"
  customer: "青岛移动"
  start_date: "2026-04-12"
  owner: "顾伟乐"
  project_type: "B300采购"

milestones:
  - title: "需求确认"
    status: "pending"
    due_date: null
  - title: "方案交付"
    status: "pending"
    due_date: null
---

# 青岛移动B300项目

## 项目信息
和顾伟乐聊了青岛移动B300项目的情况

## 背景
待补充

## 关键里程碑
- [ ] 需求确认
- [ ] 方案交付
- [ ] 项目验收

## 跟进事项
- [ ] 补充客户详细信息
- [ ] 补充预算信息
```

---

#### 3.3.4 物品 (Things)

```yaml
---
entity_id: "550e8400-e29b-41d4-a716-446655440010"
entity_type: "thing"
created_at: "2026-04-12T14:00:00Z"
created_by: "ai"
confidence: 0.75
verification_status: "pending"
last_verified_at: null

title: "Hermes Agent"
title_raw: "hermes"
aliases: ["Hermes", "hermes-agent"]
tags: ["AI", "Agent框架", "开源"]
summary: " NousResearch 的 Agent 框架，支持 Discord 消息"

related_entities:
  - entity_id: null
    relation: "mentioned_in"
    context: "在 Discord 消息中发现"

interactions:
  - timestamp: "2026-04-12T14:06:00Z"
    type: "diary_mention"
    content: "发现一个好的 Agent 框架 hermes-agent"
    source_block_id: "block-def456"
  - timestamp: "2026-04-12T14:10:00Z"
    type: "ai_analysis"
    content: "AI 建议：这是一个值得关注的 Agent 框架，可用于跨平台记忆"
    source_block_id: null

metadata:
  status: "tracking"
  thing_type: "软件"
  url: "https://hermes-agent.nousresearch.com/"
  price_range: null
  why_interesting: "提供了跨平台记忆的解决方案"
---

# Hermes Agent

## 基本信息
- **类型**: 软件
- **链接**: https://hermes-agent.nousresearch.com/
- **价格**: 免费/开源

## 为什么关注
提供了跨平台记忆的解决方案

## 跟进记录
- 2026-04-12: 发现，AI 建议深入研究
```

---

#### 3.3.5 想法 (Ideas)

```yaml
---
entity_id: "550e8400-e29b-41d4-a716-446655440020"
entity_type: "idea"
created_at: "2026-04-12T14:10:00Z"
created_by: "ai"
confidence: 0.80
verification_status: "pending"
last_verified_at: null

title: "跨平台记忆系统方案"
title_raw: "跨平台记忆"
aliases: ["跨设备记忆", "统一记忆"]
tags: ["记忆系统", "架构", "跨平台"]
summary: "通过 Agent 框架实现跨平台统一记忆的方案"

related_entities:
  - entity_id: "550e8400-e29b-41d4-a716-446655440010"
    relation: "related_to"
    context: "Hermes Agent 提供了实现思路"

interactions:
  - timestamp: "2026-04-12T14:10:00Z"
    type: "diary_mention"
    content: "觉得 Hermes Agent 的跨平台记忆方案是个好想法"
    source_block_id: "block-ghi789"

metadata:
  status: "active"
  idea_type: "架构设计"
  source: "diary"
  potential_impact: "high"
---

# 跨平台记忆系统方案

## 想法描述
通过 Agent 框架实现跨平台统一记忆的方案

## 相关链接
- [[Hermes Agent]]

## 进展记录
- 2026-04-12: 初步想法，来源 Hermes Agent
```

---

#### 3.3.6 知识 (Knowledge)

```yaml
---
entity_id: "550e8400-e29b-41d4-a716-446655440030"
entity_type: "knowledge"
created_at: "2026-04-12T14:06:00Z"
created_by: "ai"
confidence: 0.95
verification_status: "verified"
last_verified_at: "2026-04-12T14:15:00Z"

title: "Hermes Agent 文档"
title_raw: "hermes-agent documentation"
aliases: ["Hermes文档"]
tags: ["Agent", "Discord", "文档"]
summary: "Hermes Agent 的官方用户指南，关于 Discord 消息处理"

related_entities:
  - entity_id: "550e8400-e29b-41d4-a716-446655440010"
    relation: "about"
    context: "是 Hermes Agent 的官方文档"

interactions:
  - timestamp: "2026-04-12T14:06:00Z"
    type: "diary_mention"
    content: "发现 hermes-agent 文档"
    source_block_id: "block-jkl012"

metadata:
  status: "active"
  source_type: "article"
  url: "https://hermes-agent.nousresearch.com/docs/user-guide/messaging/discord"
  author: null
  published_date: null
  accessed_date: "2026-04-12"
  summary_generated: "Hermes Agent 支持通过 Discord 进行消息传递，提供了跨平台记忆的解决思路"

content_tags:
  - "Discord集成"
  - "跨平台记忆"
  - "Agent消息"
---

# Hermes Agent 文档

## 摘要
Hermes Agent 的官方用户指南，关于 Discord 消息处理

## 链接
https://hermes-agent.nousresearch.com/docs/user-guide/messaging/discord

## 核心内容
...

## 相关引用
- [[2026-04-12]] - 发现该文档
```

### 3.4 AI Skill 系统

#### 3.4.1 Skill 函数定义

每个 Skill 包含定义和执行函数：

```typescript
interface Skill {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
  execute: (params: any) => Promise<any>;
}
```

#### 3.4.2 Skill 实现示例

```typescript
// search_vault
{
  name: "search_vault",
  description: "搜索 Vault 中的日记和实体",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "搜索关键词" },
      type: { type: "string", enum: ["all", "diary", "person", "project"] }
    }
  },
  execute: async ({ query, type }) => {
    // 使用 Obsidian 内置搜索
    const results = app.vault.search(query);
    return results.map(r => ({ path: r.path, content: r.content?.substring(0, 200) }));
  }
}

// create_entity
{
  name: "create_entity",
  description: "创建新实体（人脉/项目/物品/想法/知识）",
  parameters: {
    type: "object",
    properties: {
      entityType: { type: "string", enum: ["person", "project", "thing", "idea", "knowledge"] },
      name: { type: "string" },
      summary: { type: "string" },
      metadata: { type: "object" }
    },
    required: ["entityType", "name"]
  },
  execute: async (params) => {
    // 调用 entityManager.createEntity()
    return entityManager.createEntity(params);
  }
}
```

#### 3.4.3 AI 调用流程

```
用户输入 Block
    │
    ▼
构建提示词（含 Skill 定义）
    │
    ▼
调用 LLM API（OpenAI/Claude/Ollama）
    │
    ▼
解析 LLM 返回
    │
    ├─── 文本回复 ──→ 显示在 AI 面板
    │
    └─── Skill 调用 ──→ 执行 Skill 函数 ──→ 返回结果 ──→ 继续对话
```

### 3.5 提示词设计

```typescript
const SYSTEM_PROMPT = `你是一个日记分析助手。用户每天记录流水账式日记，你需要：

1. 分析每条日记，识别人脉、项目、物品、想法、知识
2. 判断是工作还是个人内容，标注 #工作 或 #个人
3. 使用工具创建/更新实体
4. 用友好方式与用户互动，补充实体信息

实体类型：
- person: 人脉，字段：name, company, position, importance
- project: 项目/任务，字段：name, customer, status, priority
- thing: 物品/产品，字段：name, category, why_interesting
- idea: 想法/观点，字段：name, idea_type, potential_impact
- knowledge: 知识，字段：name, source_type, url, summary

可用的工具：
- search_vault: 搜索 Vault 内容
- create_entity: 创建实体
- update_entity: 更新已有实体
- list_entities: 列出某类型的所有实体

回复要求：
- 简洁友好，不超过 100 字
- 识别到新实体时，询问用户是否归档
- 不确定时主动询问用户`;
```

---

## 4. 技术实现

### 4.1 技术栈

- **插件框架**：Obsidian API (TypeScript)
- **LLM 调用**：OpenAI / Claude / Ollama / 自定义 API
- **存储**：Obsidian Vault (Markdown)
- **打包**：esbuild

### 4.2 文件结构

```
lifewiki/
├── manifest.json           # 插件清单
├── main.js               # 打包后的入口
├── styles.css            # 插件样式
├── esbuild.config.mjs   # 打包配置
├── package.json
├── tsconfig.json
└── src/
    ├── main.ts           # 插件入口
    ├── ai/
    │   ├── provider.ts   # LLM API 调用
    │   └── analyzer.ts    # AI 分析逻辑
    ├── skills/
    │   ├── index.ts      # Skill 注册
    │   └── vault.ts       # Vault 操作
    ├── entities/
    │   ├── types.ts      # 实体类型
    │   └── manager.ts     # 实体管理
    └── views/
        └── block-editor.ts # UI
```

### 4.3 配置项

```typescript
interface LifeWikiSettings {
  // AI 配置
  ai: {
    provider: "openai" | "claude" | "ollama" | "custom";
    apiKey?: string;
    baseUrl?: string;       // Ollama: http://localhost:11434
    model?: string;         // e.g., "qwen2.5:14b"
  };

  // 提示词
  prompts: {
    systemPrompt: string;
  };

  // 行为
  skills: {
    enabled: boolean;
    autoConfirm: boolean;   // 自动确认创建实体
  };
}
```

---

## 5. MVP 范围

### 5.1 必须实现 (MVP)

- [ ] Block 输入界面（250字限制）
- [ ] Block 生成（带时间戳、标签）
- [ ] Ollama/OpenAI LLM 集成
- [ ] AI 实时响应（识别人/事/知识）
- [ ] AI 对话引导未归档实体
- [ ] 实体创建（People, Projects）
- [ ] 实体元数据更新
- [ ] Obsidian 内置搜索集成

### 5.2 后续版本 (V1.1+)

- [ ] Things 物品类别
- [ ] Ideas 想法类别
- [ ] Claude Provider 支持
- [ ] 探索模式
- [ ] 每日复盘报告生成

### 5.3 后续版本 (V2.0+)

- [ ] 向量语义搜索
- [ ] Agent Skill HTTP 接口（供外部调用）
- [ ] 同步工具集成（Syncthing）
- [ ] 思维导图/头脑风暴可视化

---

## 5. 技术实现

### 5.1 技术栈

- **插件框架**：Obsidian API (TypeScript)
- **AI 接入**：OpenClaw diaryagent (WebSocket) + 可配置其他 Provider
- **存储**：Obsidian Vault (Markdown)
- **本地 Server**：Express.js / Hono.js（Node.js child process）
- **实体索引**：SQLite FTS5（可选升级）

### 5.2 Vault 同步策略

用户自行选择同步方式：
- **iCloud/OneDrive**：原生支持
- **Syncthing**：跨设备同步
- **Git**：通过 obsidian-git 插件

### 5.3 文件变化监听

```typescript
// Obsidian API
this.vault.on('modify', (file) => {
  // 触发实体索引更新
});
```

---

## 6. 风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| AI 分析质量 | 高 | 人工复核流程必须 |
| Vault 文件冲突 | 中 | 使用 `.lifewiki/` 隔离 LifeWiki 数据 |
| 插件审核周期 | 中 | 提前准备文档，预期 2-4 周 |
| 多设备同步冲突 | 中 | 建议 Syncthing 等确定性同步工具 |

---

## 7. 未来演进

### 7.1 搜索优化路径

```
V1.0: Obsidian 内置搜索
  ↓
V1.1: SQLite FTS5 索引（别名、标签优先）
  ↓
V2.0: 向量嵌入语义搜索（Ollama 本地模型）
```

### 7.2 Agent 集成深化

```
V1.0: Skill HTTP 接口
  ↓
V1.1: 双向读写、上下文注入
  ↓
V2.0: OpenClaw Native Memory Adapter
```

---

## 8. 附录

### 8.1 参考模板

日记模板见：`/Users/vincent/OneDrive/VincentVault/Template/日记模板V2-for Lifewiki.md`

### 8.2 现有实体参考

- 人脉格式：`. VincentVault/00 Agent/People/方刚.md`
- 项目格式：`. VincentVault/00 Agent/Projects/青岛移动B300项目.md`
- 分析报告：`. VincentVault/00 Agent/Daily/2026-04-12_analysis.md`
