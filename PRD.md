# LifeWiki v2.0 PRD

## 1. 产品定位

LifeWiki v2.0 是一个基于 Obsidian 的个人记忆系统。它把用户自然写下的日记 block 转化为可归档、可回溯、可被 AI Agent 使用的个人记忆。

LifeWiki 不要求用户一开始就结构化生活。用户只需要继续写日记，AI 在右侧分析栏中用确认卡片帮助用户沉淀：

- 人、公司、项目、物品、想法、知识来源等实体
- 实体背景信息和事实
- 人与项目、人与公司、项目与知识之间的关系
- 与实体相关的互动记录
- 值得长期观察的信号和待跟进事项

## 2. 版本目标

v2.0 的目标是让 LifeWiki 从 1.x 的“实体优先日记分析”升级为“个人记忆层”：

```text
日记 block
  -> AI 理解事件
  -> 生成确认卡片
  -> 用户低压力确认/补充
  -> 更新 Obsidian 实体档案和双链关系
  -> 形成可被 Chat Agent / OpenClaw 使用的个人记忆
```

## 3. 核心体验

### 3.1 日记主视图

- 用户按日期记录日记 block。
- 每个 block 可以追加子记录。
- AI 根据日记内容生成领域标签，标签位于日记 block 底部。
- 标签是较粗粒度的领域 areas，例如“工作”“个人”“学习”“项目管理”，避免过细分类。

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

待跟进事项提供“跟进”按钮，点击后主视图定位到对应 block，并进入追加日记模式。

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

LifeWiki v2.0 支持 OpenAI-compatible 自定义 Provider。

设置项：

- Provider 名称
- Base URL
- API Key
- Model
- Thinking 开关，默认关闭
- Reasoning Effort，可选 `high` / `max`

请求体支持：

```json
{"thinking": {"type": "enabled"}}
```

以及：

```json
{"reasoning_effort": "high"}
```

## 7. 安装和发布

正式插件信息：

- 插件名：LifeWiki
- 插件 ID：`lifewiki`
- 当前版本：`2.0.0`
- Release tag：`v2.0`

GitHub Release 必须包含：

- `main.js`
- `manifest.json`
- `styles.css`

安装脚本会把插件安装到：

```text
.obsidian/plugins/lifewiki/
```

## 8. 后续方向

v2.0 之后可以继续增强：

- 更完整的记忆胶囊确认流程
- 周期复盘 Agent
- OpenClaw 读取 `.lifewiki/index` 的正式协议
- Obsidian Base 视图模板
- HACS/BRAT/社区插件发布支持
