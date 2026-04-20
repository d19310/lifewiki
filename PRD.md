# LifeWiki 产品规格文档 V1.2

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
│  Obsidian  │    日记 Block 瀑布流        │    AI 分析面板       │
│  原生文件  │    流水账式输入              │    实时响应          │
│  管理器    │                            │    (独立侧边栏)      │
│            │    ┌──────────────────┐    │                      │
│            │    │ Block 1 #工作   │    │    ┌────────────┐  │
│            │    │ 08:30  内容...   │    │    │ AI 分析   │  │
│            │    └──────────────────┘    │    │ 人脉识别  │  │
│            │           │               │    │ 项目识别  │  │
│            │           ▼ 子Block        │    │ 对话补充  │  │
│            │    ┌──────────────────┐    │    └────────────┘  │
│            │    │ Block 2 #个人   │    │                      │
│            │    │ 09:15  内容...   │    │                      │
│            │    └──────────────────┘    │                      │
│            │                            │                      │
│            │    ┌──────────────────┐    │                      │
│            │    │ 输入框 (≤250字)  │    │                      │
│            │    └──────────────────┘    │                      │
└────────────┴────────────────────────────┴──────────────────────┘
```

**注意**：
- 左侧栏：Obsidian 原生文件管理器（不受插件控制）
- 中栏：LifeWiki 主视图（BlockEditorView），作为独立 tab 打开
- 右侧栏：AI 分析面板（AIAnalysisView），作为 Obsidian 右侧边栏打开
- 右侧栏可折叠/展开，不影响主视图

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

### 2.5 Agent 架构

LifeWiki 的 AI 分析采用 Agent 架构，将 AI 行为规范固化到配置文件中，便于维护和修改。参考 OpenClaw 的设计理念。

```
.lifewiki/agent/
├── IDENTITY.md      # Agent 身份定义
├── SOUL.md          # 分析流程和行为规范
├── SKILL.md         # 可用技能定义
├── MEMORY.md        # 记忆系统提示
└── WIKI.md          # 知识库结构规范
```

#### 2.5.1 文件结构

| 文件 | 说明 | 作用 |
|------|------|------|
| `IDENTITY.md` | 身份定义 | 定义 Agent 的角色、能力边界、基本原则 |
| `SOUL.md` | 灵魂规范 | 定义分析流程、对话策略、实体识别顺序 |
| `SKILL.md` | 技能定义 | 定义可调用的函数及参数规范 |
| `MEMORY.md` | 记忆提示 | 定义如何构建记忆上下文 |
| `WIKI.md` | 知识库规范 | 定义实体档案的结构和双链规范 |

#### 2.5.2 IDENTITY.md - 身份定义

```markdown
# LifeWiki Agent 身份

## 角色
你是一个日记分析助手，专门帮助用户从日常日记中识别和归档实体。

## 能力边界
- ✓ 识别日记中的人脉、项目、物品、想法、知识
- ✓ 通过对话确认实体信息
- ✓ 创建和更新实体档案
- ✗ 不主动创作内容，只分析用户提供的日记
- ✗ 不做与日记分析无关的事情

## 基本原则
1. **用户隐私优先**：不泄露用户日记内容
2. **渐进式确认**：每次只处理一个大类实体
3. **可回溯**：所有操作留有记录
```

#### 2.5.3 SOUL.md - 灵魂规范

```markdown
# LifeWiki Agent 分析规范

## 实体分析顺序
1. **人脉 (People)** - 第一个分析
2. **事项 (Projects/Tasks)** - 项目和任务
3. **物品 (Things)** - 产品、工具等
4. **想法 (Ideas)** - 观点、想法
5. **知识 (Knowledge)** - 文档、链接等

## 对话策略

### 识别未归档实体
当发现未在已归档实体中找到的名称时：
> 你提到的 **XXX** 我不认识，请问他们是你的同事还是客户？

### 识别已归档实体
当在已归档实体中找到匹配时：
> **XXX** 我认识，他是YYY项目的负责人。更新了和他的互动记录，关于他还有什么需要补充的吗？

### 确认归档
用户确认后：
> 好的，已完成 **XXX** 的人脉归档。还有信息需要补充吗？

### 询问更多信息
如果没有更多信息：
> 今天讨论的 **YYY** 项目，我不了解。请问是一个重要的项目或任务吗？

### 发现关系
发现实体间关系时：
> **XXX** 是 **YYY** 项目的负责人吗？

## 格式要求
- 实体名称用 **加粗** 格式
- 回复简洁，不超过 100 字
- 不确定时主动询问用户
```

#### 2.5.4 SKILL.md - 技能定义

```markdown
# LifeWiki Agent 可用技能

## 技能列表

### search_entity
在已归档实体中搜索匹配项。

```
输入: { "name": "实体名称" }
输出: { "found": true/false, "entity": {...} }
```

### create_entity
创建新实体档案。

```
输入: {
  "entityType": "person|project|task|thing|idea|knowledge",
  "name": "实体名称",
  "summary": "一句话描述",
  "metadata": { ... }
}
输出: { "success": true, "entityId": "xxx" }
```

### update_entity
更新已有实体。

```
输入: {
  "entityId": "xxx",
  "updates": {
    "relatedEntities": [...],
    "interactions": [...]
  }
}
输出: { "success": true }
```

### add_interaction
为实体添加互动记录。

```
输入: {
  "entityId": "xxx",
  "content": "互动内容",
  "sourceBlockId": "block-xxx"
}
输出: { "success": true }
```

### link_entities
建立实体间的双链关系。

```
输入: {
  "entityIdA": "xxx",
  "entityIdB": "yyy",
  "relation": "负责人|成员|相关|..."
}
输出: { "success": true }
```
```

#### 2.5.5 MEMORY.md - 记忆系统提示

```markdown
# 记忆系统提示

## 当前会话上下文
用户正在编辑日期为 {date} 的日记。

## 本次日记内容
{block_content}

## 已确认的实体（本会话中）
- 人脉: {confirmed_people}
- 项目: {confirmed_projects}
- 任务: {confirmed_tasks}
- 物品: {confirmed_things}
- 想法: {confirmed_ideas}
- 知识: {confirmed_knowledge}

## 待处理的实体
{pending_entities}

## 对话历史
{conversation_history}
```

#### 2.5.6 WIKI.md - 知识库结构规范

```markdown
# LifeWiki 知识库规范

## 目录结构

### Vault 目录

```
Vault/
├── .obsidian/
│   └── plugins/lifewiki/           # 插件代码
│
├── .lifewiki/                       # LifeWiki 数据（隐藏）
│   ├── agent/                       # AI Agent 配置
│   │   ├── IDENTITY.md
│   │   ├── SOUL.md
│   │   ├── SKILL.md
│   │   ├── MEMORY.md
│   │   └── WIKI.md
│   ├── sessions/                    # AI 会话历史
│   │   └── {blockId}.json
│   └── templates/                   # 内置模板
│       ├── journal-template.md
│       ├── person-template.md
│       ├── project-template.md
│       ├── task-template.md
│       ├── thing-template.md
│       ├── idea-template.md
│       └── knowledge-template.md
│
├── templates/                      # 用户自定义模板（可选）
│
├── Daily/                         # 日记文件
├── People/                        # 人脉实体
├── Projects/                      # 项目和任务
├── Things/                        # 物品/工具
├── Ideas/                         # 想法/观点
└── Knowledge/                     # 知识/文档
```

## 命名规范
| 类型 | 命名规范 | 示例 |
|------|---------|------|
| 人脉 | 姓名.md | 王五.md |
| 项目 | XXXX项目.md | 某项目.md |
| 任务 | XXXX任务.md | 某项目运营任务.md |
| 物品 | 名称.md | Hermes Agent.md |
| 想法 | 名称.md | 跨平台记忆方案.md |
| 知识 | 名称.md | Hermes Agent文档.md |

## 双链关系
实体间的关系通过 Obsidian 双链 `[[双向链接]]` 关联：

```markdown
## 关联实体
- [[王五]] - 项目负责人
- [[某项目运营项目]] - 所属项目
```

## frontmatter 要求
所有实体必须包含标准化的 frontmatter，详见 3.3 节。
```

#### 2.5.7 配置文件加载流程

```
AI 分析请求
    │
    ▼
加载 .lifewiki/agent/ 下的所有配置
    │
    ├── IDENTITY.md → 系统提示词
    ├── SOUL.md → 分析策略和对话规范
    ├── SKILL.md → 函数定义
    ├── MEMORY.md → 上下文模板
    └── WIKI.md → 知识库结构
    │
    ▼
构建完整的 System Prompt
    │
    ▼
调用 AI Provider 进行分析
    │
    ▼
返回对话内容和执行结果
```

#### 2.5.8 配置文件的热更新

配置文件存放于 Vault 的 `.lifewiki/agent/` 目录：

```
Vault/.lifewiki/agent/
├── IDENTITY.md    # 身份定义
├── SOUL.md        # 分析策略和对话规范
├── SKILL.md       # 函数定义
├── MEMORY.md      # 上下文模板
└── WIKI.md        # 知识库结构
```

修改配置文件后，AI Agent 的行为会相应更新，无需修改代码。

#### 2.5.9 模板系统

内置模板存放于 Vault 的 `.lifewiki/templates/` 目录：

```
Vault/.lifewiki/templates/
├── journal-template.md       # 日记模板
├── person-template.md        # 人脉模板
├── project-template.md       # 项目模板
├── task-template.md          # 任务模板
├── thing-template.md         # 物品模板
├── idea-template.md          # 想法模板
└── knowledge-template.md     # 知识模板
```

**模板加载优先级：**
1. `Vault/templates/` - 用户自定义覆盖（如果存在同名文件）
2. `Vault/.lifewiki/templates/` - 内置默认模板

用户想自定义模板时，可在 Vault 根目录创建 `templates/` 目录，放入同名模板文件即可覆盖内置版本。

### 2.6 Vault 操作

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

### 2.7 数据存储

Vault 文件结构：
```
Vault/
├── Daily/                      # 日记（Obsidian 原生格式）
│   ├── 2026-04-12.md
│   └── 2026-04-12_analysis.md  # AI 每日复盘（LifeWiki 生成）
├── People/                     # 人脉实体
│   ├── 张三.md
│   └── 王五.md
├── Projects/                   # 项目/事
│   └── 某项目.md
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

#### 3.2.1 Per-Block AI Session 设计

每条日记 Block 对应一个独立的 AI 会话上下文：

```
┌─────────────────────────────────────────────────────────────────────┐
│                     AI 分析面板（右侧栏）                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  当前选中 Block: Block #3                                           │
│  ─────────────────────────                                          │
│                                                                     │
│  ┌─────────────────────────────────────────┐                       │
│  │ AI: 你提到的 **张三**、**李四** 我不认识，  │                       │
│  │ 请问他们是你的同事还是客户？                │                       │
│  └─────────────────────────────────────────┘                       │
│                                                                     │
│  ┌─────────────────────────────────────────┐                       │
│  │ 用户: 他们是我的同事                      │                       │
│  └─────────────────────────────────────────┘                       │
│                                                                     │
│  ┌─────────────────────────────────────────┐                       │
│  │ AI: 好的，已完成 **张三**、**李四** 的    │                       │
│  │ 人脉归档。还有信息需要补充吗？              │                       │
│  └─────────────────────────────────────────┘                       │
│                                                                     │
│  ┌─────────────────────────────────────────┐                       │
│  │ AI: 今天你们讨论的某项目的运营问题，   │                       │
│  │ 我不了解。请问是一个重要的项目或任务吗？    │                       │
│  └─────────────────────────────────────────┘                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**核心行为**：
1. **选中 Block** → AI 面板切换到该 Block 的会话历史，清空旧对话
2. **新建 Block** → AI 面板自动切换到新 Block 的空会话
3. **切换 Block** → 保存当前会话上下文，加载目标 Block 的会话
4. **每个会话独立** → 包含该 Block 的完整对话历史 + 分析结果

**数据结构**：

```typescript
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface BlockSession {
  blockId: string;                    // 关联的 Block ID
  messages: ChatMessage[];            // 对话历史
  analysisResult: AnalysisResult | null; // 分析结果
  createdAt: string;                  // 会话创建时间
  updatedAt: string;                  // 最后更新时间
}

interface AnalysisResult {
  blockId: string;
  timestamp: string;
  category: '工作' | '个人' | '待确认';
  entities: {
    people: EntityPreview[];
    projects: EntityPreview[];
    things: EntityPreview[];
    ideas: EntityPreview[];
    knowledge: EntityPreview[];
  };
  needsConfirmation: ConfirmationItem[];
  aiResponse: string;
}
```

**会话管理流程**：

```
用户输入 Block
    │
    ├─── 新建 Block ──→ 创建新 Session（空 messages）
    │                    触发 AI 分析
    │                    AI 面板显示新会话
    │
    └─── 选中已有 Block ──→ 加载该 Block 的 Session
                            显示该 Session 的对话历史
                            用户可继续对话
```

**UI 表现**：
- 右侧 AI 面板始终显示**当前选中 Block** 的会话
- 输入新 Block 后，AI 面板自动切换到新会话（清空旧对话）
- 在不同 Block 间切换时，AI 面板显示对应会话的历史

#### 3.2.2 自然对话交互设计

AI 通过自然对话与用户确认要归档的实体，不在界面上预置分类列表。

**对话交互原则**：

1. **实体加粗高亮**：消息中的实体名称用 `**加粗**` 格式，并在界面上高亮显示
2. **单类别分析**：每次只分析一个人、事、物、想法、知识大类，完成后再进行下一个
3. **分析顺序**：人 → 事（项目/任务）→ 物 → 想法 → 知识
4. **不认识 = 未归档**：AI 回复"不认识"、"不了解"、"不知道"表示在已归档实体中检索不到
5. **认识 = 已归档**：AI 回复"更新了和 XXX 的互动记录"表示该实体已存在

**实体分类体系**：

```
### 大类（对应存储目录）
- 人脉 (People) → People/目录
- 事项 (Projects) → Projects/目录，包含"项目"和"任务"两种小类
- 物品 (Things) → Things/目录，包含"产品"、"工具"、"框架"、"软件"、"商品"、"设备"等小类
- 想法 (Ideas) → Ideas/目录，包含"观点"和"想法"两种小类
- 知识 (Knowledge) → Knowledge/目录，包含"网页链接"和"文档"两种小类

### 小类（用于询问用户确认）
- 人脉小类：同事、客户、朋友、领导...
- 事项小类：项目、任务
- 物品小类：产品、工具、框架、软件、商品、设备
- 想法小类：观点、想法
- 知识小类：网页链接、文档
```

**结构化标记参考**：

AI 回复中必须包含结构化数据标记，供系统解析：

| 标记 | 用途 | 示例 |
|------|------|------|
| `[ENTITY:]` | 未归档实体发现，询问用户确认小类 | `[ENTITY:{"status":"unknown","entities":[{"name":"张三","inferred_type":"person","small_type":"待确认","reason":"姓名"}]}]` |
| `[ARCHIVE:]` | 用户确认后，执行归档操作 | `[ARCHIVE:{"entities":[{"name":"张三","type":"person","small_type":"同事","context":"日记中提及"}]}]` |
| `[UPDATE:]` | 更新已有实体 | `[UPDATE:{"entity_id":"xxx","updates":[{"field":"metadata.role","value":"项目负责人"},{"field":"interactions","content":"在日记中被提及"}]}]` |
| `[RELATION:]` | 发现实体间关系 | `[RELATION:{"from":"张三","to":"项目A","relation":"负责人"}]` |
| `[STATUS:]` | 分析阶段完成 | `[STATUS:{"phase":"complete"}]` |

**实体类型推断规则**：

- 姓名 → 人脉
- 包含"项目"、"任务"、"运营" → 事项
- 包含"产品"、"工具"、"框架"、"软件"、"商品"、"设备" → 物品
- 观点、想法、建议 → 想法
- 包含URL、链接、文档 → 知识

**对话示例**：

```
用户输入：今天和张三、李四讨论了某项目的运营问题，还提到了Hermes Agent框架

AI 分析后回复（第一轮 - 人脉）：
你提到的 **张三**、**李四** 我不认识，请问他们是你的同事还是客户？

用户回复：他们是我的同事

AI 回复（确认归档）：
好的，已完成 **张三**、**李四** 的人脉归档。还有信息需要补充吗？

用户回复：没有了

AI 分析后回复（第二轮 - 事项）：
今天你们讨论的某项目的运营问题，我不了解。请问是一个重要的项目或任务吗？如果是，可以回复项目名称或任务名称，我帮你建立档案持续跟踪。

用户回复：这是一个项目，叫某项目运营项目

AI 回复（确认归档）：
好的，已建立 **某项目运营项目** 档案。还有信息需要补充吗？

用户回复：张三是这个项目的负责人

AI 回复（更新实体）：
已更新 **张三** 的档案，关联到 **某项目运营项目**，关系是项目负责人。还有信息需要补充吗？

用户回复：没有

AI 分析后回复（第三轮 - 物品）：
你提到的 Hermes Agent 框架，我了解到它是一个 Agent 框架。请问你需要将它归档为物品/工具吗？

用户回复：是的

AI 回复（确认归档）：
好的，已归档 **Hermes Agent** 到物品类别。
```

**实体已存在的对话示例**：

```
AI 回复：
**王五** 我认识，他是某项目的对接人。更新了和他的互动记录，关于他还有什么需要补充的吗？
```

**实体关系发现的对话示例**：

```
AI 回复：
你提到的 **李四** 是 **某项目运营项目** 的负责人吗？
```

**对话流程图**：

```
Block 输入
    │
    ▼
AI 分析日记，识别人脉实体
    │
    ├─── 有未归档人脉 ──→ 询问用户确认
    │                      │
    │                      ▼
    │                  用户确认类型（如：同事/客户）
    │                      │
    │                      ▼
    │                  创建人脉实体档案
    │                      │
    │                      ▼
    │                  更新互动记录
    │                      │
    │                      ▼
    │                  询问是否还有补充
    │
    └─── 有人脉已归档 ──→ 更新互动记录
                            询问是否需要补充
```

**完整分析 Phase 流程**：

```
┌──────────────────────────────────────────────────────────────┐
│  Phase 1: 初始分析 & Vault 检索                              │
├──────────────────────────────────────────────────────────────┤
│  1. 用户输入 Block，触发 AI 分析                              │
│  2. AI 识别人脉/事项/物品/想法/知识实体                        │
│  3. 对每个实体在 vault 中检索是否已归档                         │
│     - 检索结果传给 AI 作为上下文                               │
│                                                              │
│  Phase 2a: 未归档实体处理                                    │
│  1. AI 发现未归档实体 → 自然询问用户确认小类                     │
│     例："你提到的 **张三** 我不认识，请问是同事还是客户？"      │
│  2. 用户确认小类（如"同事"）                                  │
│  3. AI 输出 [ARCHIVE:...] 标记                               │
│  4. 系统创建实体文档，更新元数据                                │
│  5. 询问是否还有补充 → 继续或进入下一 Phase                      │
│                                                              │
│  Phase 2b: 已归档实体处理                                    │
│  1. AI 发现已归档实体 → 更新互动记录                            │
│  2. 发现新信息 → 询问是否更新                                  │
│     例："**王五** 我认识，他是项目负责人，要更新档案吗？"         │
│  3. 用户确认后 → AI 输出 [UPDATE:...] 标记                     │
│  4. 系统更新实体文档                                          │
│                                                              │
│  Phase 3: 关系发现                                          │
│  1. AI 发现实体间关系 → 询问用户确认                            │
│     例："**李四** 是 **某项目项目** 的负责人吗？"       │
│  2. 用户确认 → AI 输出 [RELATION:...] 标记                    │
│  3. 系统建立实体间关系                                        │
│                                                              │
│  Phase 4-7: 物品/想法/知识 分析（同 Phase 2a/2b 流程）          │
└──────────────────────────────────────────────────────────────┘
```

**多轮对话顺序**：

```
┌──────────────────────────────────────────────────────────────┐
│  Block 分析流程                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Round 1: 人脉分析                                           │
│    ├─ 识别所有未归档人脉实体                                  │
│    ├─ 第一条：我不认识 XXX，请确认类型                       │
│    ├─ 用户回复后 → 创建档案                                 │
│    ├─ 第二条（如有）：我不认识 YYY，请确认类型                │
│    └─ 所有未归档人脉处理完                                   │
│                                                              │
│  Round 2: 事项分析（项目/任务）                               │
│    ├─ 识别所有未归档事项实体                                  │
│    ├─ 第一条：我不了解 ZZZ，请确认是项目还是任务              │
│    └─ ...                                                    │
│                                                              │
│  Round 3: 物品分析                                           │
│    ├─ 识别所有未归档物品实体                                  │
│    └─ ...                                                    │
│                                                              │
│  Round 4: 想法分析                                           │
│    └─ ...                                                    │
│                                                              │
│  Round 5: 知识分析                                           │
│    └─ ...                                                    │
│                                                              │
│  关系发现（任意时刻）：                                        │
│    └─ 发现实体间关系 → 询问用户确认 → 更新关联                 │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**归档文件命名规范**：

| 实体类型 | 目录 | 文件命名规范 | 示例 |
|---------|------|------------|------|
| 人脉 | People/ | 姓名.md | 王五.md |
| 项目 | Projects/ | XXXX项目.md | 某项目.md |
| 任务 | Projects/ | XXXX任务.md | 某项目运营任务.md |
| 物品 | Things/ | 名称.md | Hermes Agent.md |
| 想法 | Ideas/ | 名称.md | 跨平台记忆方案.md |
| 知识 | Knowledge/ | 名称.md | Hermes Agent文档.md |

**UI 不显示预置分类**：右侧 AI 分析面板不再显示人脉/项目/物品/想法/知识的分类列表，仅通过对话方式进行交互确认。

#### 3.2.3 触发时机

每条 Block 输入后**立即触发** AI 分析。

### 3.2.4 Per-Block 会话持久化

#### 3.2.4.1 设计目标

每个 Block 的 AI 对话会话独立保存，点击 Block 时加载历史会话，用户可继续对话。

#### 3.2.4.2 存储位置

```
Vault/
└── .lifewiki/                    # LifeWiki 私有数据（隐藏）
    ├── agent/                     # AI Agent 配置
    ├── sessions/                  # Per-block 会话目录
    │   ├── {blockId-1}.json      # Block 1 的会话
    │   ├── {blockId-2}.json      # Block 2 的会话
    │   └── {blockId-N}.json      # Block N 的会话
    └── templates/                 # 内置模板
```

#### 3.2.4.3 会话数据结构

```typescript
interface ChatMessage {
  role: 'user' | 'assistant';    // 消息角色
  content: string;                 // 消息内容
  timestamp: string;               // ISO 8601 时间戳
}

interface BlockSession {
  blockId: string;                // 关联的 Block ID（UUID）
  content: string;                // Block 原始内容
  messages: ChatMessage[];         // 对话历史（按时间顺序）
  analysisResult: AnalysisResult | null;  // 分析结果快照
  currentPhase: AnalysisPhase;     // 当前分析阶段
  createdAt: string;              // 会话创建时间
  updatedAt: string;              // 最后更新时间
}

type AnalysisPhase = 'people' | 'projects' | 'things' | 'ideas' | 'knowledge' | 'complete';
```

**JSON 文件示例** (`{blockId}.json`):

```json
{
  "blockId": "4afaafa9-9aaa-4942-a837-2fd8a506be96",
  "content": "今天和张三、李四讨论了某项目运营问题",
  "messages": [
    {
      "role": "assistant",
      "content": "你提到的 **张三**、**李四** 我不认识，请问他们是同事还是客户？",
      "timestamp": "2026-04-17T08:30:00Z"
    },
    {
      "role": "user",
      "content": "他们是我的同事",
      "timestamp": "2026-04-17T08:30:15Z"
    },
    {
      "role": "assistant",
      "content": "好的，已完成 **张三**、**李四** 的人脉归档。",
      "timestamp": "2026-04-17T08:30:20Z"
    }
  ],
  "analysisResult": null,
  "currentPhase": "projects",
  "createdAt": "2026-04-17T08:30:00Z",
  "updatedAt": "2026-04-17T08:30:20Z"
}
```

#### 3.2.4.4 会话管理流程

```
┌─────────────────────────────────────────────────────────────────────┐
│                        会话管理流程                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  场景1: 新建 Block                                                  │
│  ─────────────────                                                  │
│  用户输入 Block 内容                                                 │
│       │                                                            │
│       ▼                                                            │
│  创建新 Session（blockId, 空 messages）                            │
│       │                                                            │
│       ▼                                                            │
│  触发 AI 分析，生成 initialResponse                                  │
│       │                                                            │
│       ▼                                                            │
│  保存 initialResponse 到 messages                                   │
│       │                                                            │
│       ▼                                                            │
│  AI 面板显示新会话                                                  │
│                                                                     │
│  场景2: 选中已有 Block                                              │
│  ─────────────────────────                                          │
│  用户点击 Block                                                     │
│       │                                                            │
│       ▼                                                            │
│  检查是否存在该 Block 的会话文件                                     │
│       │                                                            │
│       ├─── 存在 ──→ 加载会话文件到内存                               │
│       │              显示对话历史                                      │
│       │              用户可继续对话                                   │
│       │                                                            │
│       └─── 不存在 ──→ 创建新 Session                                │
│                                                                     │
│  场景3: 用户发送消息                                                │
│  ─────────────────────                                              │
│  用户在输入框发送消息                                                │
│       │                                                            │
│       ▼                                                            │
│  保存用户消息到 messages                                            │
│       │                                                            │
│       ▼                                                            │
│  显示用户消息气泡                                                    │
│       │                                                            │
│       ▼                                                            │
│  调用 AI继续分析                                                    │
│       │                                                            │
│       ▼                                                            │
│  AI 返回响应 → 保存到 messages                                      │
│       │                                                            │
│       ▼                                                            │
│  显示 AI 消息气泡                                                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### 3.2.4.5 SessionManager 核心 API

```typescript
class SessionManager {
  private sessions: Map<string, BlockSession> = new Map();
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /** 初始化 - 加载所有会话文件到内存 */
  async initialize(): Promise<void>;

  /** 获取或创建会话 */
  getOrCreateSession(blockId: string): BlockSession;

  /** 添加消息 */
  addMessage(blockId: string, message: ChatMessage): void;

  /** 设置分析结果 */
  setAnalysisResult(blockId: string, result: AnalysisResult): void;

  /** 设置分析阶段 */
  updatePhase(blockId: string, phase: AnalysisPhase): void;

  /** 清空会话 */
  clearSession(blockId: string): Promise<void>;

  /** 清空所有会话 */
  clearAllSessions(): Promise<void>;
}
```

#### 3.2.4.6 持久化策略

| 操作 | 持久化时机 | 实现方式 |
|------|-----------|---------|
| 创建会话 | 首次 `getOrCreateSession` | `vault.adapter.write` 原子创建 |
| 添加消息 | `addMessage` 后立即 | `vault.adapter.write` 覆盖文件 |
| 更新阶段 | `updatePhase` 后立即 | `vault.adapter.write` 覆盖文件 |
| 清空会话 | `clearSession` 后 | `vault.delete` 删除文件 |

**关键实现**：
- 使用 `vault.adapter.write` 而非 `vault.create/vault.modify`，避免"文件已存在"错误
- 每次保存先 `JSON.parse(JSON.stringify(session))` 深拷贝，避免引用问题
- 会话文件命名：`{blockId}.json`，blockId 使用 UUID

#### 3.2.4.7 与 AI 分析面板的交互

```
BlockEditor                    AIAnalysisPanel              SessionManager
     │                             │                             │
     │  用户点击 Block              │                             │
     │─────────────────────────────>│                             │
     │                             │                             │
     │                             │  setActiveBlock(blockId)    │
     │                             │─────────────────────────────>│
     │                             │                             │
     │                             │  getOrCreateSession(blockId) │
     │                             │  返回 BlockSession           │
     │                             │<─────────────────────────────│
     │                             │                             │
     │                             │  renderSession(session)       │
     │  显示历史对话                │                             │
     │<─────────────────────────────│                             │
     │                             │                             │
     │  用户发送消息                │                             │
     │─────────────────────────────>│                             │
     │                             │                             │
     │                             │  addMessage(blockId, msg)    │
     │                             │─────────────────────────────>│
     │                             │  保存到文件                  │
     │                             │<─────────────────────────────│
     │                             │                             │
```

#### 3.2.4.8 LangGraph 集成

当 `useLangGraph: true` 时，使用 LangGraph Agent 处理对话：

```typescript
class LangGraphAgent {
  async startBlockAnalysis(blockId: string, content: string): Promise<ConversationResult>;
  async continueAnalysis(blockId: string, userMessage: string): Promise<ConversationResult>;
}
```

LangGraph Agent 内部也会调用 SessionManager 保存消息，确保 SessionManager 是唯一的会话数据源。

#### 3.2.4.9 错误处理

| 错误场景 | 处理方式 |
|---------|---------|
| `app.vault` undefined | 确保 SessionManager 构造时传入 app 实例 |
| 文件已存在 | 使用 `adapter.write` 而非 `create` |
| 会话不存在 | `getOrCreateSession` 自动创建 |
| JSON 解析失败 | 跳过损坏的文件，记录日志 |

### 3.2.5 AI 分析面板 UI

右侧 AI 分析面板支持两种模式：**分析模式**和**聊天模式**。

#### 3.2.5.1 分析模式

```
┌─────────────────────────────────────────────────────────┐
│  AI 洞察                                              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  你提到的 **张三**、**李四**                           │
│  我不认识，请问他们是你的同事还是客户？                   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 他们是我的同事                                  │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  好的，已完成 **张三**、**李四** 的人脉归档。        │
│  还有信息需要补充吗？                                   │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌───────────────────────────┐    ⬆                   │
│  │ 输入你的回复...            │    │                   │
│  └───────────────────────────┘    │   发送箭头          │
│                                    │   (有文字时深色)    │
│  [聊天]                            │                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**分析模式特点**：
- 标题显示"AI 洞察"
- 右上角无按钮
- 输入框 placeholder："输入你的回复..."
- 底部输入框左侧显示"聊天"按钮，点击切换到聊天模式

#### 3.2.5.2 聊天模式

```
┌─────────────────────────────────────────────────────────┐
│  AI 聊天                                        [🗑️]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  帮我复盘一下今天的日记                                   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  | 今天的主要收获是...                                |   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [继续对话...]                                          │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌───────────────────────────┐    ⬆                   │
│  │ 说点什么...               │    │                   │
│  └───────────────────────────┘    │   发送箭头          │
│                                    │   (有文字时深色)    │
│  [聊天] [分析]                                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**聊天模式特点**：
- 标题显示"AI 聊天"
- 右上角显示"🗑️清空"按钮，点击清空聊天上下文
- 输入框 placeholder："说点什么..."
- 底部输入框左侧显示"聊天"和"分析"两个按钮，点击"分析"切换回分析模式

#### 3.2.5.3 模式切换规则

| 触发 | 动作 |
|------|------|
| 点击 block | 自动切换到分析模式 |
| 点击日记输入框 | 自动切换到分析模式 |
| 点击底部"聊天"按钮 | 切换到聊天模式 |
| 点击底部"分析"按钮 | 切换到分析模式 |
| 点击右上角"🗑️" | 清空聊天上下文（仅聊天模式） |

#### 3.2.5.4 Session 管理

| 模式 | Session Key | 说明 |
|------|-------------|------|
| 分析模式 | `block:{blockId}` | 绑定到具体 block |
| 聊天模式 | `chat:global` | 全局通用聊天 session |

聊天模式下，AI 支持调用 `get_diary_entries` 等工具获取日记内容进行复盘等操作。

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

title: "王五"
title_raw: "王五"
aliases: []
tags: ["同事", "商务"]
summary: "某项目对接人"

related_entities:
  - entity_id: "550e8400-e29b-41d4-a716-446655440002"
    relation: "part_of"
    context: "某项目负责人"

interactions:
  - timestamp: "2026-04-12T08:25:00Z"
    type: "diary_mention"
    content: "和王五聊了某项目的情况"
    source_block_id: "block-abc123"

metadata:
  status: "active"
  company: "某公司"
  position: "项目经理"
  first_contact: "2026-04-12"
  contact_channel: "Discord"
  importance: "high"
---

# 王五

## 基本信息
- **公司**: 某公司
- **职位**: 项目经理
- **首次接触**: 2026-04-12
- **渠道**: Discord

## 背景
待补充

## 互动记录
- 2026-04-12: 讨论某项目 → [[2026-04-12]]

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

title: "某项目"
title_raw: "某项目"
aliases: ["青岛B300", "QDB300"]
tags: ["算力", "B300", "某公司"]
summary: "某公司B300服务器采购项目"

related_entities:
  - entity_id: "550e8400-e29b-41d4-a716-446655440001"
    relation: "mentioned_in"
    context: "王五是项目对接人"

interactions:
  - timestamp: "2026-04-12T08:25:00Z"
    type: "diary_mention"
    content: "和王五聊了某项目的情况"
    source_block_id: "block-abc123"

metadata:
  status: "active"
  priority: "high"
  customer: "某公司"
  start_date: "2026-04-12"
  owner: "王五"
  project_type: "B300采购"

milestones:
  - title: "需求确认"
    status: "pending"
    due_date: null
  - title: "方案交付"
    status: "pending"
    due_date: null
---

# 某项目

## 项目信息
和王五聊了某项目的情况

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

- [x] Things 物品类别
- [x] Ideas 想法类别
- [ ] Claude Provider 支持
- [ ] 探索模式
- [ ] 每日复盘报告生成

### 5.3 V1.2 新增功能

#### 5.3.1 本地 .md 文档识别与归档

**功能描述**：
当用户在日记中提及本地 .md 文件路径时，AI 能够识别并读取该文件内容，根据内容类型自动识别实体类型（人物/项目/物品/想法/知识），然后引导用户确认是否归档为实体。

**使用场景**：
- 用户在日记中提及：`今天看了 ~/Documents/读书笔记/认知心理学.md`
- AI 识别到本地路径，读取文件内容
- 分析内容类型，识别人物/项目/知识等
- 询问用户：「检测到您阅读了认知心理学相关文档，要归档为知识吗？」

**技术实现**：

| 组件 | 文件 | 功能 |
|------|------|------|
| `read_local_document` 工具 | `entity-tools.ts` | 读取本地 .md 文件，支持 ~ 路径扩展 |
| `summarize_document` 工具 | `entity-tools.ts` | 根据实体类型提取关键信息 |
| 路径安全验证 | `isValidLocalPath()` | 防止路径遍历攻击 |
| Frontmatter 解析 | - | 提取 YAML 元数据 |

**工具定义**：

```
read_local_document(path: string, options?: { maxLines?: number })
  → { content: string, metadata: { title?, tags?, uid? }, success: boolean, error?: string }

summarize_document(path: string, entityType: EntityType)
  → { summary: string, keyInfo: Record<string, any>, suggestedMetadata: object }
```

**安全限制**：
- 仅允许读取 `~` 开头的绝对路径
- 限制读取文件大小（最大 100KB）
- 防止 `../` 路径遍历

#### 5.3.2 日历视图

**功能描述**：
在 Obsidian 右侧边栏显示日历视图，支持月份导航，点击日期可直接跳转到对应日期的日记。

**产品形态**：
- 独立 Tab，与 AI 分析面板并列
- 顶部：月份导航（‹ 上月 | 2026年4月 | 下月 ›）
- 点击月份标题回到今天
- 主体：6×7 日历网格
- 日期圆点标记：该日有日记

**交互逻辑**：

| 操作 | 行为 |
|------|------|
| 点击日期 | 打开 BlockEditor 并加载该日期日记 |
| 点击月份标题 | 回到当月 |
| 点击 ‹ › | 导航上一月/下一月 |
| 日记存在 | 日期右下角显示蓝点 |

**技术实现**：

| 组件 | 文件 | 功能 |
|------|------|------|
| CalendarView | `calendar-view.ts` | ItemView 子类，渲染日历 UI |
| getMonthDays() | `calendar-view.ts` | 计算 42 天日历网格 |
| diaryExistsForDate() | `calendar-view.ts` | 检查 Daily/YYYY-MM-DD.md 是否存在 |
| setOnDateClick() | `calendar-view.ts` | 日期点击回调 |
| setCurrentDate() | `block-editor.ts` | 导航到指定日期 |
| navigateToDate() | `main.ts` | 协调日历点击→日记导航 |

**UI 布局**：

```
┌─────────────────────────────────────────┐
│  日历视图                          □ × │
├─────────────────────────────────────────┤
│      ‹   2026年4月   ›                   │
│  日  一  二  三  四  五  六              │
│                          1  2  3  4      │
│   5  6  7  8  9 10 11  •                │
│  12 13 14 15 16 17 18                   │
│  19 20 21 22 23 24 25  •                │
│  26 27 28 29 30                          │
└─────────────────────────────────────────┘
         • = 该日有日记
```

**打开方式**：
- Ribbon 图标（日历图标）
- 命令面板：`Open Calendar`

### 5.4 后续版本 (V2.0+)

- [ ] 向量语义搜索
- [ ] Agent Skill HTTP 接口（供外部调用）
- [ ] 同步工具集成（Syncthing）
- [ ] 思维导图/头脑风暴可视化

---

## 6. 技术实现

### 6.1 技术栈

- **插件框架**：Obsidian API (TypeScript)
- **AI 接入**：OpenClaw diaryagent (WebSocket) + 可配置其他 Provider
- **存储**：Obsidian Vault (Markdown)
- **本地 Server**：Express.js / Hono.js（Node.js child process）
- **实体索引**：SQLite FTS5（可选升级）

### 6.2 Vault 同步策略

用户自行选择同步方式：
- **iCloud/OneDrive**：原生支持
- **Syncthing**：跨设备同步
- **Git**：通过 obsidian-git 插件

### 6.3 文件变化监听

```typescript
// Obsidian API
this.vault.on('modify', (file) => {
  // 触发实体索引更新
});
```

### 6.4 CSS 样式加载策略

**问题背景**：
Obsidian v1.12+ (Electron v39 / Chromium 139) 对插件 CSS 加载有更严格的资源隔离策略：
- Shadow DOM 广泛应用于表格、Canvas、Block 编辑器
- 全局 CSS（main.css）可能被安全策略拦截或被 Shadow DOM 隔离
- `manifest.json` 中声明的 `styles` 字段可能无法正常加载

**解决方案**：
采用 JavaScript 动态注入 `<style>` 元素方式，在组件的 `addStyles()` 方法中创建并追加样式：

```typescript
private addStyles() {
    const styleEl = document.createElement('style');
    styleEl.textContent = `
        .lifewiki-ai-panel {
            height: 100%;
            display: flex;
            flex-direction: column;
            background: var(--surface-container-low);
            /* ... 其他样式 */
        }
    `;
    this.containerEl.appendChild(styleEl);
}
```

**优势**：
- 绕过 Obsidian CSS 加载机制，100% 可靠
- 直接注入到组件容器，不受 Shadow DOM 影响
- 优先级高于外部 CSS 和第三方主题覆盖

**适用场景**：
- AI 分析面板（`ai-analysis-panel.ts`）
- 日记编辑器（`block-editor.ts`）

**注意**：
- 所有 UI 组件样式均通过 `addStyles()` 动态注入
- `main.css` 文件保留作为样式文档参考，不依赖其被加载
- 当前方案为固定外观设计，不随 Obsidian 主题切换变化

---

---

## 7. V1.1 功能规划：多 Agent 架构 + 自定义 Provider

### 7.1 背景与目标

当前 V0.1 使用单一 `LangGraphAgent` 处理所有模式（分析/聊天），通过 `blockId` 硬编码判断。V1.1 重构为多 Agent 架构，支持：

- **多 Agent 专业分工**：Diary Agent（分析）、Chat Agent（聊天）
- **自定义 AI Provider**：支持 OpenAI、Anthropic、自定义 Endpoint
- **Agent-Provider 映射**：不同 Agent 可使用不同 AI 服务
- **配置驱动**：Agent 行为由配置文件定义，易于扩展

### 7.2 目标架构

```
.lifewiki/agents/                    # Agent 配置
├── diary/                           # 日记分析 Agent
│   ├── IDENTITY.md                 # 身份定义
│   ├── SOUL.md                     # 分析规范
│   ├── SKILL.md                    # 技能定义
│   └── WIKI.md                     # 知识库规范
└── chat/                           # 聊天 Agent
    ├── IDENTITY.md
    ├── SOUL.md
    └── SKILL.md

src/ai/
├── providers/                       # AI Provider 相关
│   ├── interfaces.ts               # Provider 接口
│   ├── provider-manager.ts         # Provider 管理器
│   ├── openai-provider.ts          # OpenAI 实现
│   ├── anthropic-provider.ts       # Anthropic 实现
│   └── custom-provider.ts          # 自定义 Provider 实现
├── agents/                         # Agent 相关
│   ├── interfaces.ts               # Agent 接口
│   ├── base-agent.ts              # 抽象类
│   ├── agent-registry.ts          # Agent 注册表
│   ├── diary-agent.ts              # 日记分析 Agent
│   └── chat-agent.ts               # 聊天 Agent
└── main.ts                        # 入口（修改）
```

### 7.3 核心接口设计

#### 6.3.1 Provider 接口

```typescript
// src/ai/providers/interfaces.ts
export interface AIProvider {
  readonly id: string;
  readonly name: string;
  readonly type: 'openai' | 'anthropic' | 'custom';

  chat(messages: ChatMessage[]): Promise<ChatResponse>;
  isReady(): boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
```

#### 6.3.2 自定义 Provider 配置

```typescript
// src/ai/providers/types.ts
export interface CustomProviderConfig {
  id: string;
  name: string;
  type: 'custom';
  endpoint: string;           // API Endpoint URL
  apiKey?: string;            // API Key (加密存储)
  model: string;              // 模型名称
  extraParams?: Record<string, any>;
}

export interface ProviderSettings {
  defaultProvider: string;
  providers: (PresetProviderConfig | CustomProviderConfig)[];
}
```

#### 6.3.3 Agent 接口

```typescript
// src/ai/agents/interfaces.ts
export interface AgentContext {
  blockId: string;
  content?: string;
  parentId?: string | null;
  siblingBlocks?: Array<{ id: string; content: string }>;
}

export interface AgentResult {
  response: string;
  session: BlockSession;
  entities?: DiscoveredEntity[];
  error?: string;
}

export interface Agent {
  readonly id: string;
  readonly name: string;

  initialize(): Promise<void>;
  start(ctx: AgentContext): Promise<AgentResult>;
  continue(ctx: AgentContext, message: string): Promise<AgentResult>;
}
```

#### 6.3.4 Agent 注册表

```typescript
// src/ai/agents/agent-registry.ts
export class AgentRegistry {
  private agents: Map<string, Agent> = new Map();
  private providerManager: ProviderManager;

  constructor(providerManager: ProviderManager) {
    this.providerManager = providerManager;
  }

  registerAgent(agent: Agent): void;
  getAgent(id: string): Agent | undefined;
  resolveAgent(blockId: string): Agent {
    // chat:global → Chat Agent
    // block:* → Diary Agent
  }
}
```

### 7.4 工具集对比

| 工具 | Diary Agent | Chat Agent |
|------|-------------|------------|
| search_entity | ✓ | ✓ |
| create_entity | ✓ | ✗ |
| add_interaction | ✓ | ✗ |
| list_entities | ✓ | ✓ |
| link_entities | ✓ | ✗ |
| get_diary_entries | ✗ | ✓ |
| get_entity_history | ✓ | ✓ |

### 7.5 设置页面设计

```
┌──────────────────────────────────────────────────────────┐
│ ⚙️ LifeWiki 设置                                          │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 🤖 AI Provider 设置                                 │ │
│  ├────────────────────────────────────────────────────┤ │
│  │                                                     │ │
│  │ 默认 Provider: [OpenAI                        ▼]  │ │
│  │                                                     │ │
│  │ ┌─ OpenAI ──────────────────────────────────────┐ │ │
│  │ │ Endpoint: https://api.openai.com/v1         │ │ │
│  │ │ API Key:  [••••••••••••••••••••••••]       │ │ │
│  │ │ Model:    [gpt-4o                          ▼] │ │ │
│  │ └───────────────────────────────────────────────┘ │ │
│  │                                                     │ │
│  │ ┌─ Anthropic ──────────────────────────────────┐ │ │
│  │ │ Endpoint: https://api.anthropic.com         │ │ │
│  │ │ API Key:  [••••••••••••••••••••••••]       │ │ │
│  │ │ Model:    [claude-3-5-sonnet-20241022  ▼]   │ │ │
│  │ └───────────────────────────────────────────────┘ │ │
│  │                                                     │ │
│  │ ┌─ 自定义 #1 ───────────────────────────────────┐ │ │
│  │ │ Name: [本地 Ollama            ]               │ │ │
│  │ │ Endpoint: [http://localhost:11434/v1]        │ │ │
│  │ │ API Key:  [                          ] (可选) │ │ │
│  │ │ Model:    [llama3                       ]   │ │ │
│  │ │ [删除]                                         │ │ │
│  │ └───────────────────────────────────────────────┘ │ │
│  │                                                     │ │
│  │ [+ 添加自定义 Provider]                              │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 📋 Agent 配置                                       │ │
│  ├────────────────────────────────────────────────────┤ │
│  │                                                     │ │
│  │ [Diary Agent]        使用: [OpenAI           ▼]   │ │
│  │ 分析日记、识别实体                                    │ │
│  │                                                     │ │
│  │ [Chat Agent]         使用: [Anthropic       ▼]   │ │
│  │ 自由对话、日记总结                                    │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 7.6 实施步骤

#### Phase 0: 准备（功能开关）
1. 梳理现有 `LangGraphAgent` 调用链
2. 添加 `useNewAgentArchitecture` 功能开关

#### Phase 1: Provider 基础架构
1. 创建 Provider 接口 (`interfaces.ts`)
2. 创建 ProviderManager (`provider-manager.ts`)
3. 封装现有 Provider 为 `DefaultAIProvider`

#### Phase 2: 自定义 Provider 支持
1. 定义 `CustomProviderConfig` 类型
2. 实现 `CustomProvider` 类
3. ProviderManager 添加 `addCustomProvider()` 方法

#### Phase 3: Agent 基础架构
1. 定义 Agent 接口 (`interfaces.ts`)
2. 创建 `BaseAgent` 抽象类
3. 创建 `AgentRegistry` 注册表

#### Phase 4: 实现 DiaryAgent
1. 创建 `DiaryAgent` 类（复用现有 `BlockAnalysisMachine`）
2. 注册到 AgentRegistry
3. 验证分析功能正常

#### Phase 5: 实现 ChatAgent
1. 创建 `ChatAgent` 类
2. 实现 `get_diary_entries` 工具
3. 验证聊天模式正常

#### Phase 6: 功能开关集成
1. 修改 `AIAnalysisPanelView` 桥接层
2. 添加功能开关到设置页面
3. 验证两侧功能正常

#### Phase 7: 设置页面 UI
1. Provider 配置 UI
2. 自定义 Provider 添加/编辑/删除
3. Agent-Provider 映射 UI

#### Phase 8: 清理（可选）
1. 移除功能开关
2. 删除旧架构代码

### 7.7 验证清单

| Step | 验证项 | 预期结果 |
|------|--------|----------|
| 0.2 | Plugin 加载 | 无错误 |
| 1.1-1.3 | ProviderManager 构建 | `npm run build` 通过 |
| 2.1-2.3 | 自定义 Provider | 可调用自定义 endpoint |
| 3.1-3.3 | Agent 接口定义 | 代码编译通过 |
| 4.1-4.3 | DiaryAgent | 分析功能正常 |
| 5.1-5.3 | ChatAgent | 聊天模式正常 |
| 6.1-6.3 | 功能开关 | 两侧功能正常 |
| 7.1-7.3 | Provider UI | 可配置 Provider |
| 8.1-8.3 | Agent-Provider 映射 | 可为不同 Agent 选择不同 Provider |

### 7.8 风险与缓解

| 风险 | 级别 | 缓解措施 |
|------|------|----------|
| 重构破坏现有功能 | 中 | 功能开关保护，随时可回滚 |
| Provider 配置复杂 | 低 | 先实现预设 Provider，再实现自定义 |
| Agent 间状态冲突 | 低 | SessionManager 按 blockId 隔离 |

---

## 8. 风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| AI 分析质量 | 高 | 人工复核流程必须 |
| Vault 文件冲突 | 中 | 使用 `.lifewiki/` 隔离 LifeWiki 数据 |
| 插件审核周期 | 中 | 提前准备文档，预期 2-4 周 |
| 多设备同步冲突 | 中 | 建议 Syncthing 等确定性同步工具 |

---

## 9. 未来演进

### 8.1 搜索优化路径

```
V1.0: Obsidian 内置搜索
  ↓
V1.1: 多 Agent 架构 + 自定义 Provider
  ↓
V2.0: SQLite FTS5 索引（别名、标签优先）
  ↓
V3.0: 向量嵌入语义搜索（Ollama 本地模型）
```

### 8.2 Agent 集成深化

```
V1.0: Skill HTTP 接口
  ↓
V1.1: 多 Agent 架构 + 自定义 Provider
  ↓
V2.0: 双向读写、上下文注入
  ↓
V3.0: OpenClaw Native Memory Adapter
```

---

## 10. 附录

### 8.1 参考模板

日记模板见：`/Users/user/Vault/Template/日记模板V2-for Lifewiki.md`

### 8.2 现有实体参考

- 人脉格式：`. SampleVault/00 Agent/People/张三.md`
- 项目格式：`. SampleVault/00 Agent/Projects/某项目.md`
- 分析报告：`. SampleVault/00 Agent/Daily/2026-04-12_analysis.md`
