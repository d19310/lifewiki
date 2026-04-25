# LifeWiki 产品规格文档 V1.7

## 1. 产品概述

### 1.1 产品定位

LifeWiki 是一款 Obsidian 插件，通过 AI 辅助实现流水账式日记分析，挖掘用户的人脉、项目、物品、想法和知识，形成结构化的 Wiki 知识库。

### 1.2 核心价值

- **更顺滑的日记体验**：区别于 Obsidian 原生日记 UI，提供 Block 输入方式
- **AI 驱动的知识挖掘**：实时分析日记，识别实体并补充元数据
- **双 Agent 架构**：Diary Agent 专注分析，Chat Agent 提供全能对话

### 1.3 目标用户

- Obsidian 重度用户
- 知识管理、Second Brain 实践者
- 需要 AI 辅助分析日记的个人用户

---

## 2. 产品架构

### 2.1 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                    LifeWiki 插件                              │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │   UI Layer  │  │ Agent Layer │  │ Skill Layer │ │
│  │  Block编辑  │◄─┤ DiaryAgent │◄─┤ search_entity│ │
│  │  AI分析面板 │  │ ChatAgent  │  │ create_entity│ │
│  └─────────────┘  └──────┬──────┘  └──────┬──────┘ │
│                          │                  │           │
│                          ▼                  ▼           │
│                   ┌─────────────┐  ┌─────────────┐ │
│                   │ Provider    │  │ Vault       │ │
│                   │ Manager    │  │ (Obsidian)  │ │
│                   └──────┬─────┘  └─────────────┘ │
│                          │                              │
│         ┌───────────────┼───────────────┐            │
│         ▼               ▼               ▼            │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│  │  Provider1  │ │  Provider2  │ │ Default    │ │
│  │  (自定义)   │ │  (自定义)   │ │ Provider   │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 三栏式 UI

```
┌─────────────────────────────────────────────────────────────────┐
│                         Obsidian 主界面                          │
├────────────┬────────────────────────────┬──────────────────────┤
│            │                            │                      │
│  左侧栏    │        中栏                │      右侧栏          │
│  Obsidian │    日记 Block 瀑布流        │    AI 分析面板       │
│  原生文件  │                            │                      │
│            │    ┌──────────────────┐ │    ┌────────────┐  │
│            │    │ Block 1 #工作   │ │    │ AI 分析   │  │
│            │    │ 08:30  内容...   │ │    │            │  │
│            │    └──────────────────┘ │    │ 对话气泡   │  │
│            │           ▼              │    │            │  │
│            │    子Block               │    └────────────┘  │
│            │    ┌──────────────────┐ │                      │
│            │    │ Block 2 #个人   │ │                      │
│            │    └──────────────────┘ │                      │
│            │                            │                      │
│            │    ┌──────────────────┐ │                      │
│            │    │ 输入框 (≤250字)   │ │                      │
│            │    └──────────────────┘ │                      │
└────────────┴────────────────────────────┴──────────────────────┘
```

**UI 说明**：
- 左侧栏：Obsidian 原生文件管理器
- 中栏：LifeWiki 主视图（BlockEditorView），作为独立 tab 打开
- 右侧栏：AI 分析面板（AIAnalysisView），作为 Obsidian 右侧边栏打开

### 2.3 AI Provider 层

支持多 Provider 配置，每个 Provider 是 OpenAI 兼容接口：

| 配置项 | 说明 |
|--------|------|
| `name` | 显示名称 |
| `model` | 模型名称（如 gpt-4、qwen-plus） |
| `baseUrl` | API 地址（如 https://api.openai.com/v1） |
| `apiKey` | API 密钥 |

**设置界面**：
- Section 1：AI Provider 配置 — 添加/删除/测试 Provider
- Section 2：Agent 配置 — Diary Agent 和 Chat Agent 分别绑定到哪个 Provider

### 2.4 Agent 架构

LifeWiki 采用双 Agent 架构，配置文件存放于 Vault 的 `.lifewiki/` 目录：

```
.lifewiki/
├── agents/                    # Agent 配置
│   ├── diary/                 # 日记分析 Agent
│   │   ├── IDENTITY.md        # 身份定义
│   │   ├── SOUL.md            # 分析流程规范
│   │   └── WIKI.md            # 知识库结构
│   └── chat/                   # 全能对话 Agent
│       ├── IDENTITY.md         # 身份定义
│       ├── SOUL.md             # 对话流程规范
│       └── WIKI.md             # 知识库结构
└── skills/                     # 共享技能目录
    ├── list_entities/          # 批量获取已归档实体
    │   ├── SKILL.md            # 技能定义
    │   └── executor.ts          # 执行脚本
    ├── search_entity/          # 搜索单个实体
    ├── create_entity/           # 创建新实体档案
    ├── add_interaction/         # 添加互动记录
    ├── link_entities/           # 建立实体间双链关系
    ├── update_entity/           # 更新已有实体
    ├── read_local_document/     # 读取本地文档
    └── clip_and_summarize/      # 抓取网页内容
```

**配置文件说明**：

| 文件 | 作用 |
|------|------|
| `agents/{agentId}/IDENTITY.md` | 角色身份定义（Who） |
| `agents/{agentId}/SOUL.md` | 工作流程规范（How） |
| `skills/*/SKILL.md` | 技能定义（共享，各 Agent 可用） |
| `agents/{agentId}/WIKI.md` | 档案结构规范 |

**System Prompt 构建顺序**：
```
{identity}           ← 我是谁
{soul}               ← 我怎么工作
{skills}            ← 我能用什么技能（从 skills/ 目录加载）
{wiki}              ← 档案的格式规范
---
当前会话上下文
已知实体
对话历史
函数调用格式
```

**技能目录结构**：所有 Agent 共享的技能定义在 `.lifewiki/skills/` 目录，每个技能包含 SKILL.md（定义）和 executor.ts（实现）。

---

## 3. Agent 详细设计

### 3.1 Diary Agent — 日记分析专家

**定位**：纯日记分析，不处理聊天。只分析用户提供的日记 block，识别实体、创建档案、建立双链、处理事实冲突。

#### 3.1.1 IDENTITY.md — 身份定义

```markdown
# LifeWiki Agent 身份

## 角色

你是一个日记分析助手，专门帮助用户从每日日记中识别和归档实体。

## 能力边界

- ✓ 识别日记中的人脉、项目、任务、物品、想法、知识
- ✓ 创建和更新实体档案
- ✓ 建立实体间的关联关系（双链）
- ✓ 处理事实冲突：发现矛盾信息时，更新实体的 metadata 为最新状态
- ✗ 不主动创作内容，只分析用户提供的日记
- ✗ 不做与日记分析无关的事情（如闲聊、回答与档案无关的问题）

## 基本原则

1. **用户隐私优先**：不泄露用户日记内容
2. **渐进式确认**：每次只处理一个大类实体，完成后再进行下一个
3. **可回溯**：所有操作留有互动记录
4. **实体优先识别**：先确认未归档实体，再发现已有实体关系
5. **立即更新已归档实体**：识别到已归档实体时，必须立即调用 add_interaction 更新互动记录，不要等用户确认
6. **事实冲突处理**：当新信息与已有信息矛盾时，以新信息为准，更新实体 metadata

## 实体分类

| 类型 | 说明 | 目录 |
|------|------|------|
| person | 人脉 | People/ |
| project | 项目 | Projects/ |
| task | 任务 | Projects/ |
| thing | 物品/产品/设备/设施/方案 | Things/ |
| idea | 想法/灵感/新概念 | Ideas/ |
| knowledge | 文章/论文/媒体/新闻/文档/链接 | Knowledge/ |
```

#### 3.1.2 SOUL.md — 5步自动分析流程

**核心原则**：按顺序执行各步骤，某些步骤可能需要多轮对话确认。

**执行顺序**：
1. 实体检测 — 同时检测所有类型实体 + 文件/链接/附件
2. 实体处理 — 多轮对话创建/更新实体
3. 关系发现 — 多轮对话建立实体间关联
4. 冲突检测和处理 — 检测事实冲突并处理
5. 分析总结 — 简短总结 + 领域标签

**执行流程**：

```
Step 1：实体检测
  └─ 调用 list_entities 获取所有已归档实体（按类型批量查询）
  └─ 在日记内容中检测是否提及这些已归档实体
  └─ 检测是否有新的、未归档的实体
  └─ 检测是否有本地文件路径、网页链接、附件
  └─ 如果没有任何发现，直接进入 Step 5

Step 2：实体处理
  ├─ 对每个新实体，询问用户确认类型
  ├─ 用户确认后，调用 create_entity / add_interaction
  ├─ 对已归档实体，直接调用 add_interaction（无需确认）
  ├─ 对本地文件，调用 read_local_document 后创建实体
  └─ 对网页链接，调用 clip_and_summarize 抓取并总结

Step 3：关系发现
  └─ 分析实体之间的潜在关联
  └─ 调用 link_entities 建立实体间双链关系（无需确认）

Step 4：冲突检测和处理
  └─ 检测日记内容与已有档案的事实冲突
  └─ 用户确认后调用 update_entity 更新

Step 5：分析总结
  └─ 用 1-2 句话总结分析结果
  └─ 自动更新该条日记的领域标签到 block 元数据中
```

**关键规则**：
- 禁止虚假声明：必须先调用工具，再声称"已更新"
- 结束回复格式：在末尾加上 #工作 #个人 等标签

#### 3.1.3 SKILL.md — 工具定义

技能定义在共享的 `.lifewiki/skills/` 目录，各 Agent 共享使用：

| 技能 | 用途 | 输入 |
|------|------|------|
| `list_entities` | 批量获取某类型的所有已归档实体 | `{entityType, status}` |
| `search_entity` | 搜索单个实体 | `{name}` |
| `create_entity` | 创建新实体档案 | `{entityType, name, summary, metadata}` |
| `update_entity` | 更新已有实体 | `{entityId, updates}` |
| `add_interaction` | 添加互动记录 | `{entityId, content, sourceBlockId}` |
| `link_entities` | 建立实体间关系 | `{entityIdA, entityIdB, relation, context}` |
| `read_local_document` | 读取本地文件系统中的 Markdown 文档 | `{path}` |
| `clip_and_summarize` | 抓取并总结网页 | `{url}` |

---

### 3.2 Chat Agent — 全能档案管理员

**定位**：全能型对话助手，对 vault 中的档案进行管理（问答、总结、查询、洞察、创建更新）。

#### 3.2.1 IDENTITY.md — 身份定义

```markdown
# LifeWiki Chat Agent 身份

## 角色

你是一个全能型档案管理员和友好助手，帮助用户管理 vault 中的所有实体档案。

## 能力

- ✓ 回答用户问题（基于 vault 中的档案信息）
- ✓ 总结和复盘日记内容
- ✓ 查询已归档的实体信息
- ✓ 洞察实体间的关系
- ✓ 创建和更新实体档案（需要用户确认）
- ✓ 处理事实冲突：发现矛盾信息时，更新实体的 metadata 为最新状态
- ✓ 提供建议和思考

## 对话风格

- 友好，自然，像朋友聊天
- 简洁明了，不啰嗦
- 可以使用表情符号增加亲切感

## 注意事项

- 只在用户明确要求时，才执行实体创建/更新操作
- 不要主动修改已有实体的核心信息，除非用户确认
- 所有实体操作完成后，告知用户
```

#### 3.2.2 SOUL.md — 7场景工作流程

| 场景 | 工具 | 需要确认 |
|------|------|---------|
| 回答问题 | search/list | ❌ |
| 总结复盘日记 | get_diary_entries | ❌ |
| 查询实体 | search_entity | ❌ |
| 洞察关系 | get_related_entities | ❌ |
| 创建实体 | create_entity | ✅ |
| 更新实体 | update_entity | ✅ |
| 处理事实冲突 | search_entity → update_entity | ✅ |

#### 3.2.3 SKILL.md — 工具定义

与 Diary Agent 相同的工具集，但工作流程不同：

| 工具 | 用途 |
|------|------|
| `get_diary_entries` | 获取指定日期范围的日记 |
| `search_entity` | 搜索已归档实体 |
| `list_entities` | 列出某类型的实体 |
| `create_entity` | 创建新实体（需确认） |
| `update_entity` | 更新实体（需确认） |
| `add_interaction` | 添加互动记录 |
| `link_entities` | 建立实体关系（需确认） |
| `get_related_entities` | 获取实体关联列表 |
| `get_entity_history` | 获取实体互动历史 |

---

## 4. 函数调用原理

### 4.1 XML 函数调用格式

AI 输出 XML 格式的函数调用：

```
正确格式：
<function_calls><invoke name="search_entity"><parameter name="name">张三</parameter></invoke></function_calls>

错误格式（不要使用）：
search_entity({"name": "张三"})
```

### 4.2 调用链路

```
用户输入
    ↓
AI 决定调用工具，输出 XML 格式
    ↓
SkillExecutor 解析 XML
    ↓
根据 SKILL.md 中定义的输入格式提取参数
    ↓
调用实际的 skill 函数（JavaScript 实现）
    ↓
返回 JSON 结果
    ↓
AI 收到结果，继续对话
```

---

## 5. 实体分类与元数据

### 5.1 实体分类

| 类型 | 说明 | 目录 |
|------|------|------|
| person | 人脉 | People/ |
| project | 项目 | Projects/ |
| task | 任务 | Projects/ |
| thing | 物品/产品/设备/设施/方案 | Things/ |
| idea | 想法/灵感/新概念 | Ideas/ |
| knowledge | 文章/论文/媒体/新闻/文档/链接 | Knowledge/ |

### 5.2 frontmatter 规范

```yaml
---
entity_id: "uuid-v4"
entity_type: "person|project|task|thing|idea|knowledge"
created_at: "2026-04-15T10:00:00Z"
created_by: "ai|human"
confidence: 0.95
verification_status: "pending|verified|rejected"
last_verified_at: null

title: "实体名称"
title_raw: "原始提及形式"
aliases: ["别名1", "别名2"]
tags: ["标签1", "标签2"]
summary: "一句话描述"

related_entities:
  - entity_id: "xxx"
    name: "关联实体"
    relation: "负责人|成员|..."
    context: "关联上下文"

interactions:
  - timestamp: "2026-04-15T10:00:00Z"
    type: "diary_mention|ai_analysis|user_feedback|update"
    content: "互动内容摘要"
    source_block_id: "block-xxx"

metadata:
  status: "active|archived"
  source: "diary"
---
```

### 5.3 各类型元数据

**人脉 (person)**：
```yaml
metadata:
  company: "公司名称"
  position: "职位"
  contact_channel: "微信|电话|邮件|..."
  importance: "high|medium|low"
```

**项目 (project)**：
```yaml
metadata:
  customer: "客户名称"
  start_date: "2026-04-15"
  status: "active|completed|on_hold"
  priority: "high|medium|low"
  owner: "负责人姓名"
```

---

## 6. 数据存储

### 6.1 Vault 文件结构

```
Vault/
├── Daily/                      # 日记
│   └── 2026-04-12.md
├── People/                    # 人脉实体
│   └── 张三.md
├── Projects/                  # 项目和任务
│   ├── 某项目.md
│   └── 某任务.md
├── Things/                    # 物品
├── Ideas/                     # 想法
├── Knowledge/                 # 知识
└── .lifewiki/                 # LifeWiki 配置
    ├── agents/
    │   ├── diary/
    │   └── chat/
    └── sessions/             # 会话历史
```

### 6.2 Session 管理

| 模式 | Session Key | 说明 |
|------|-------------|------|
| 分析模式 | `block:{blockId}` | 绑定到具体 block |
| 聊天模式 | `chat:global` | 全局通用聊天 |

---

## 7. 设置界面

### Section 1: AI Provider 配置

- 添加 Provider：名称、模型、Base URL、API Key
- 已添加的 Provider 列表，显示名称/模型/URL
- 每个 Provider 有「测试」按钮和「删除」按钮

### Section 2: Agent 配置

- Diary Agent → 下拉框选择 Provider
- Chat Agent → 下拉框选择 Provider

### Section 3: 功能设置

（预留，目前为空）

---

## 8. v1.7 重大更新：优化分析流程与实体索引

### 8.1 背景与问题

**原有问题**：
- 日记分析流程（5步）调用 agent 配置文件（IDENTITY.md/SOUL.md）效果不稳定
- 每次分析需要多次调用 `list_entities`、`search_entity`，效率低
- 大量实体需要传递时，token 消耗大
- MiniMax 等模型不支持 function calling，导致流程无法完整执行

**解决思路**：
- 日记分析模式：使用简化的内嵌 prompt，速度快、效果稳定
- Chat 模式：保留 agent 配置，支持 function calling 等完整能力
- 实体索引：HashMap + Trie 实现 O(1)/O(m) 级别检索
- 操作分类：自动执行 vs 需用户确认

### 8.2 双模式架构

```
┌─────────────────────────────────────────────────────────────┐
│                      LangGraphAgent                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────┐    ┌─────────────────────┐        │
│  │   分析模式           │    │   聊天模式            │        │
│  │   (diary blocks)    │    │   (chat:global)      │        │
│  ├─────────────────────┤    ├─────────────────────┤        │
│  │ buildAnalysisPrompt │    │ buildSystemPrompt   │        │
│  │ (内嵌简化 prompt)    │    │ (加载 MD 配置文件)  │        │
│  │ 无 function calling │    │ 支持 function calling│       │
│  │ 直接文本输出        │    │ XML 格式调用         │        │
│  └─────────────────────┘    └─────────────────────┘        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**分析模式 Prompt** (`buildAnalysisPrompt`):
```
# 日记分析助手

## 对话风格
像朋友聊天一样自然，简洁。不说"检测到"、"发现"，直接说名字。

## 5步分析流程
### Step 1: 快速浏览日记，识别提及的人
### Step 2: 识别提到的项目/任务/想法
### Step 3: 判断领域
### Step 4: 直接回复（末尾带 #工作/#个人 等标签）
```

**聊天模式**：加载 `.lifewiki/agents/chat/` 下的完整配置，支持 skills 调用。

### 8.3 实体索引（Entity Index）

**目的**：优化实体检索性能，从 O(k×n) 降低到 O(k) 或 O(m)。

**索引结构**：
```
EntityIndex
├── nameToEntity: Map<string, Entity>      // O(1) 精确匹配
├── trie: Trie                               // O(m) 前缀匹配
├── aliases: Map<string, Entity>             // 别名反向索引
└── simplifiedNames: Map<string, Entity>     // 简繁转换索引
```

**匹配流程**：
```
检测流程：
1. 精确匹配 (HashMap)     → O(1)
2. 别名匹配 (遍历)         → O(k)
3. 简繁转换匹配            → O(k)
4. Trie 前缀匹配          → O(m)
5. 编辑距离过滤           → O(k×n)，只对候选执行
```

**核心模块**：

`src/ai/langgraph/entity-index.ts`:
```typescript
export class EntityIndex {
  private nameToEntity: Map<string, Entity>;
  private trie: Trie;
  private aliases: Map<string, Entity>;
  private simplifiedNames: Map<string, Entity>;

  buildIndex(entities: Entity[]): void;
  findExact(name: string): Entity | null;
  findExactBatch(names: string[]): Map<string, Entity | null>;
  findByPrefix(prefix: string, limit?: number): Entity[];
  findByEditDistance(name: string, threshold?: number): Entity[];
}
```

`src/ai/langgraph/string-matcher.ts`:
```typescript
export function levenshteinDistance(a: string, b: string): number;
export function stringSimilarity(a: string, b: string): number;
export function simplifiedToTraditional(s: string): string;
export function traditionalToSimplified(s: string): string;
```

### 8.4 操作分类与确认机制

**操作分类**：

| 操作类型 | 说明 | 执行方式 |
|---------|------|---------|
| `add_interaction` | 已归档实体添加互动记录 | **自动执行** |
| `create_entity` | 创建新实体档案 | **需确认** |
| `link_entities` | 建立实体间双链关系 | **需确认** |
| `update_entity` | 更新已有实体（冲突处理） | **需确认** |

**确认触发格式**：

AI 输出确认格式（结构化文本）：
```
【待确认操作】

新增实体：
- 张三（人脉）← "张三" 是新朋友吗？

已归档实体互动：
- 李四：添加到最近互动记录

关联关系：
- 张三 → 华为项目（负责人）

请确认是否执行以上操作。回复"好"执行，"取消"放弃。
```

**用户回复解析**：

| 用户回复 | 解析结果 |
|---------|---------|
| "好" | confirm_all |
| "好，但张三改成客户" | confirm_all + 修改张三类型为"客户" |
| "只创建张三，其他取消" | partial_confirm: [张三] |
| "取消" | cancel_all |

**操作执行器** (`operation-executor.ts`):
```typescript
export interface PendingOperations {
  createEntities: Array<{ name, entityType, summary? }>;
  addInteractions: Array<{ entityId, content, sourceBlockId }>;
  linkRelations: Array<{ entityIdA, entityIdB, relation }>;
}

export async function executeOperations(
  ops: PendingOperations,
  entityManager: EntityManager
): Promise<ExecutionResult>;
```

### 8.5 完整对话流程

```
用户输入日记
    ↓
AI 对话 + 自动 add_interaction
    ↓
检测到需要确认的操作
    ↓
输出【待确认操作】格式
    ↓
用户回复"好"或修改
    ↓
Backend 执行所有操作
    ↓
自动更新 block 元数据（领域标签）
    ↓
对话完成
```

**示例对话**：

```
用户：今天和张三、李四开会讨论华为项目

AI：张三、李四是新面孔，他们是你的同事吗？#工作

用户：是的，张三是客户，李四是同事

AI：张三（客户）、李四（同事）已归档。华为项目是新的吗？

用户：对

AI：好的，华为项目已创建。
张三（客户）→ 华为项目（客户项目）
李四（同事）→ 华为项目（参与）
#工作

用户：好

Backend 执行：
- create_entity: 张三（客户）、李四（同事）、华为项目
- link_entities: 张三→华为、李四→华为
- update_block_metadata: blockId, { areas: ['工作'] }
```

### 8.6 文件结构

**新增文件**：
```
src/ai/langgraph/
├── entity-index.ts        # 实体索引（HashMap + Trie）
├── string-matcher.ts      # 字符串匹配算法
├── operation-executor.ts   # 操作执行器
├── user-reply-parser.ts    # 用户回复解析器
└── confirmation-trigger.ts # 确认触发器
```

**修改文件**：
```
src/ai/langgraph/agent.ts       # 支持双模式
src/ai/langgraph/graph.ts       # 更新工具定义
src/entities/manager.ts         # 添加批量查找方法
```

### 8.7 detect_entities Skill（可选优化）

**目的**：封装实体检测逻辑，AI 只需一次调用完成检测。

**输入**：
```json
{
  "diaryContent": "今天和张三、李四开会讨论华为项目...",
  "entityIndexSummary": [{"name": "张三", "type": "person"}, ...],
  "options": { "enableFuzzyMatch": true, "similarityThreshold": 0.8 }
}
```

**输出**：
```json
{
  "archivedMatches": [
    {"name": "张三", "entityId": "xxx", "type": "person", "matchType": "exact"}
  ],
  "newEntities": [
    {"name": "李四", "inferredType": "person", "confidence": 0.9}
  ],
  "localFiles": ["~/documents/项目笔记.md"],
  "webLinks": ["https://example.com/article"]
}
```

### 8.8 验证方式

1. `npm run build` — 无 TypeScript 错误
2. 性能测试：对比优化前后检测耗时
3. Token 测试：对比优化前后 prompt token 消耗
4. 功能测试：验证别名、简繁、编辑距离匹配正确

### 8.9 实施步骤

**Phase 1: 基础优化**
1. [ ] 创建 `string-matcher.ts`
2. [ ] 创建 `entity-index.ts`
3. [ ] 修改 `EntityManager` 添加 `buildEntityIndex()` 和 `findExactBatch()`

**Phase 2: 确认机制**
4. [ ] 创建 `user-reply-parser.ts`
5. [ ] 创建 `operation-executor.ts`
6. [ ] 创建 `confirmation-trigger.ts`

**Phase 3: Agent 集成**
7. [ ] 更新 `agent.ts` 双模式支持
8. [ ] 更新 `graph.ts` 工具定义
9. [ ] 测试完整流程
