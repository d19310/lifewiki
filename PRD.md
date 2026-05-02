# LifeWiki v2.1.4 PRD

## 1. 产品定位

LifeWiki v2.1.4 是一个基于 Obsidian 的个人记忆系统。它把用户自然写下的日记 block 转化为可归档、可回溯、可被 AI Agent 使用的个人记忆。

LifeWiki 不要求用户一开始就结构化生活。用户只需要继续写日记，AI 在右侧分析栏中用确认卡片帮助用户沉淀：

- 人、公司、项目、物品、想法、知识来源等实体
- 实体背景信息和事实
- 人与项目、人与公司、项目与知识之间的关系
- 与实体相关的互动记录
- 值得长期观察的信号和待跟进事项

## 2. 版本目标

v2.1.4 聚焦实体检索精度和性能优化，解决 v2.1.x 中已归档实体在日记分析和聊天模式下被误识别的问题：

### 2.1 问题背景

- **问题一**：AI 日记分析时，已归档的实体被当作新实体处理。用户已在 vault 中维护了”曹晓东”的档案，但日记中提到”曹老师”时，系统无法匹配到已有实体。
- **问题二**：聊天模式下修改实体档案时，AI 回复找不到该实体。

### 2.2 根因分析

- `CaptureAnalyzer`（日记分析主路径）和 `search_entity` 工具各自使用简陋的精确字符串匹配，没有使用 `EntityIndex` 的分层匹配能力。
- AI 输出的实体名（日记原文中的自然名称）和 vault 中存储的实体名存在差异（别名、简称、错别字等），事后匹配失败。
- 注入 AI prompt 的实体上下文只有名称和类型，缺少公司、职位等关键元数据，AI 无法判断实体是否已有。

### 2.3 解决方案

1. **Aho-Corasick 多模式字符串匹配**：在 `EntityIndex` 中扩展 Trie 增加 failure links，实现单次 O(M) 扫描找出日记中所有已归档实体提及，替代 O(N×M) 的子串遍历。
2. **统一匹配逻辑**：`CaptureAnalyzer` 和 `search_entity` 统一使用 `EntityIndex.findBestMatch()`，替换各自的精确匹配实现。
3. **实体上下文增强**：注入 AI prompt 时附带公司、职位、关系等元数据，让 AI 在生成阶段就能识别已有实体。

### 2.4 技术设计

**Aho-Corasick 自动机**：
- 纯 TypeScript 实现，无外部依赖
- 不依赖分词，实体名和别名本身就是匹配模式
- 随用随建，每次分析时从 `entityCache` 重建，确保数据最新
- 最小模式长度 ≥ 2，防止单字符假阳性
- 重叠匹配去重（保留最长匹配）

**匹配策略分层**：
1. AC 自动机扫描 → 找出日记中实际出现的已有实体
2. `findBestMatch()` → 精确匹配 → 别名匹配 → 前缀匹配 → 编辑距离
3. AI prompt 中注入已有实体的完整上下文（名称 + 别名 + 关键 metadata）

## 3. 核心体验

### 3.1 日记主视图

- 用户按日期记录日记 block。
- 每个 block 可以追加子记录。
- AI 根据日记内容生成领域标签，标签位于日记 block 底部。
- 标签是较粗粒度的领域 areas，例如”工作””个人””学习””项目管理”，避免过细分类。

### 3.2 右侧分析模式

分析模式只用卡片和用户交互，不混杂自由聊天消息。

卡片类型包括：

- 实体确认卡片
- 背景信息确认卡片
- 事实更新卡片
- 关系确认卡片
- 互动记录确认卡片

用户可以：

- 确认归档
- 拒绝
- 在卡片中补充信息

用户补充的信息应进入正确字段。例如：

- “临港算力总经理，我的同事、领导。别名罗总”
- 应分别写入 `company`、`relationship_to_user`、`aliases`

### 3.3 今日洞察

今日洞察是分析模式下的独立 tab，只显示当天内容。

它用于承载跨 block 的高价值洞察，不嵌入单条日记会话中。

内容包括：

- 高门槛待跟进事项
- 高价值今日信号
- 未确认但值得用户处理的候选记忆

待跟进事项提供”跟进”按钮，点击后主视图定位到对应 block，并进入追加日记模式。

### 3.4 聊天模式

聊天模式是独立模式。用户可以通过自然语言让 Agent：

- 查询 vault 中的实体和互动记录
- 总结一段时间的日记
- 新建或更新实体档案
- 发现实体关系
- 回顾项目、人脉、知识线索

聊天模式支持流式输出，并使用配置的 AI Provider。

## 4. Vault 结构

```text
Vault/
├── Daily/
├── People/
├── Projects/
├── Things/
├── Ideas/
├── Knowledge/
├── Memory/
│   ├── Capsules/
│   ├── Patterns/
│   └── OpenLoops/
└── .lifewiki/
    ├── index/
    ├── sessions/
    ├── agents/
    ├── skills/
    └── templates/
```

## 5. 实体元数据原则

元数据必须对 Obsidian Base 和 AI Agent 友好：

- 字段少而稳定
- 字段名使用英文 snake_case
- 重要事实放 frontmatter
- 事件过程和互动记录放正文
- 双链关系使用 `[[实体名]]`

### 5.1 Person

推荐字段：

- `type`
- `status`
- `aliases`
- `company`
- `role`
- `relationship_to_user`
- `tags`
- `created_at`
- `updated_at`

### 5.2 Project

推荐字段：

- `type`
- `status`
- `aliases`
- `owner`
- `participants`
- `stage`
- `priority`
- `tags`
- `created_at`
- `updated_at`

### 5.3 Thing / Idea / Knowledge

根据实体类型保留少量高价值字段，例如：

- `type`
- `status`
- `aliases`
- `source`
- `url`
- `domain`
- `related_projects`
- `tags`
- `created_at`
- `updated_at`

## 6. AI Provider

LifeWiki v2.1.4 支持 OpenAI-compatible 自定义 Provider。

设置项：

- Provider 名称
- Base URL
- API Key
- Model
- Thinking 开关，默认关闭
- Reasoning Effort，可选 `high` / `max`

请求体支持：

```json
{“thinking”: {“type”: “enabled”}}
```

以及：

```json
{“reasoning_effort”: “high”}
```

## 7. 实体检索架构（v2.1.4 新增）

### 7.1 EntityIndex 能力

`EntityIndex` 是统一的实体检索引擎，组合多种匹配策略：

| 匹配方式 | 复杂度 | 置信度 |
|----------|--------|--------|
| HashMap 精确匹配 | O(1) | 1.0 |
| HashMap 别名匹配 | O(k) | 0.95 |
| Trie 前缀匹配 | O(m) | 0.8 |
| Aho-Corasick 多模式扫描 | O(M) | - |
| Levenshtein 编辑距离 | O(k×n) | 0.7 |

### 7.2 Aho-Corasick 扫描

- 在 `EntityIndex.buildIndex()` 中构建 Trie + failure links
- `scanContent(content)` 单次扫描返回所有实体命中
- 最小模式长度 ≥ 2，防止假阳性
- 重叠匹配保留最长匹配
- 随用随建，不依赖持久化存储

### 7.3 各组件统一使用 EntityIndex

- `CaptureAnalyzer`：AC 扫描选择注入 prompt 的实体上下文
- `search_entity`：`findBestMatch()` 替代精确匹配
- `detect_entities`：已有实现保持不变

## 8. 安装和发布

正式插件信息：

- 插件名：LifeWiki
- 插件 ID：`lifewiki`
- 当前版本：`2.1.4`
- Release tag：`v2.1.4`

GitHub Release 必须包含：

- `main.js`
- `manifest.json`
- `styles.css`
- `install.sh`

安装脚本会把插件安装到：

```text
.obsidian/plugins/lifewiki/
```

## 9. 后续方向

v2.1.4 之后可以继续增强：

- 更完整的记忆胶囊确认流程
- 周期复盘 Agent
- OpenClaw 读取 `.lifewiki/index` 的正式协议
- Obsidian Base 视图模板
- HACS/BRAT/社区插件发布支持
- 向量检索用于语义相似实体匹配（探索性）
