# LifeWiki 产品规格文档 V2.0

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

LifeWiki 采用双 Agent 架构，配置文件存放于 Vault 的 `.lifewiki/agents/` 目录：

```
.lifewiki/agents/
├── diary/                    # 日记分析 Agent
│   ├── IDENTITY.md          # 身份定义
│   ├── SOUL.md              # 分析流程规范
│   ├── SKILL.md              # 可用技能
│   └── WIKI.md               # 知识库结构
│
└── chat/                     # 全能对话 Agent
    ├── IDENTITY.md           # 身份定义
    ├── SOUL.md               # 对话流程规范
    ├── SKILL.md              # 可用技能
    └── WIKI.md               # 知识库结构
```

**配置文件说明**：

| 文件 | 作用 |
|------|------|
| `IDENTITY.md` | 角色身份定义（Who） |
| `SOUL.md` | 工作流程规范（How） |
| `SKILL.md` | 工具定义（What） |
| `WIKI.md` | 档案结构规范 |

**System Prompt 构建顺序**：
```
{identity}     ← 我是谁
{soul}         ← 我怎么工作
{skills}       ← 我能用什么工具
{wiki}         ← 档案的格式规范
---
当前会话上下文
已知实体
对话历史
函数调用格式
```

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

#### 3.1.2 SOUL.md — 6阶段×4步骤分析流程

**核心原则**：按顺序自动执行所有阶段，不要询问用户，确认后直接结束。

**执行顺序**：
1. 人脉 (People)
2. 事项 (Projects/Tasks)
3. 物品 (Things)
4. 想法 (Ideas)
5. 知识 (Knowledge)
6. 领域 (Area) — 工作/个人/学习/其他

**每阶段4步骤**：

```
第1步：实体检测
  └─ 调用 list_entities 获取该类别的已归档实体列表
  └─ 在日记内容中检测是否提及这些实体
  └─ 检测是否有新的、未归档的同类实体
  └─ 如果没发现任何实体（已归档或新），直接跳过本阶段

第2步：实体档案创建或更新
  ├─ 发现已归档实体 → 立即调用 add_interaction（无需确认）
  └─ 发现新实体 → 提示用户确认，确认后调用 create_entity

第3步：实体关系发现和更新（自动处理）
  └─ 发现实体间的新关系时，直接调用 link_entities（无需确认）

第4步：事实冲突检测和处理（需用户确认）
  └─ 检测到矛盾 → 确认最新状态 → 用户确认后调用 update_entity
```

**关键规则**：
- 禁止虚假声明：必须先调用工具，再声称"已更新"
- 结束回复格式：在末尾加上 `#工作 #个人` 等标签

#### 3.1.3 SKILL.md — 工具定义

| 工具 | 用途 | 输入 |
|------|------|------|
| `list_entities` | 获取某类别的所有已归档实体 | `{entityType, status}` |
| `search_entity` | 搜索单个实体 | `{name}` |
| `create_entity` | 创建新实体档案 | `{entityType, name, summary, metadata}` |
| `update_entity` | 更新已有实体 | `{entityId, updates}` |
| `add_interaction` | 添加互动记录 | `{entityId, content, sourceBlockId}` |
| `link_entities` | 建立实体间关系 | `{entityIdA, entityIdB, relation, context}` |
| `get_entity_history` | 获取实体互动历史 | `{entityId}` |
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
