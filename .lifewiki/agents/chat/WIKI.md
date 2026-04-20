# LifeWiki 知识库规范

## 目录结构

```
Vault/
├── Daily/                      # 日记（Obsidian 原生格式）
│   ├── 2026-04-12.md
│   └── 2026-04-12_analysis.md  # AI 每日复盘
├── People/                     # 人脉实体
│   ├── 张三.md
│   └── 李四.md
├── Projects/                   # 项目和任务
│   ├── 某项目.md
│   ├── 某运营项目.md
│   └── 某运营任务.md
├── Things/                     # 物品/工具
│   └── Hermes Agent.md
├── Ideas/                      # 想法/观点
│   └── 跨平台记忆方案.md
└── Knowledge/                  # 知识/文档
    └── Hermes Agent文档.md
```

## 命名规范

| 类型 | 命名规范 | 示例 |
|------|---------|------|
| 人脉 | 姓名.md | 王五.md |
| 项目 | XXXX项目.md | 某项目.md |
| 任务 | XXXX任务.md | 某任务.md |
| 物品 | 名称.md | Hermes Agent.md |
| 想法 | 名称.md | 跨平台记忆方案.md |
| 知识 | 名称.md | Hermes Agent文档.md |

## 双链关系规范

实体间的关系通过 Obsidian 双链 `[[双向链接]]` 关联。

### 在实体文件中添加关联

```markdown
## 关联实体
- [[王五]] - 项目负责人
- [[某运营项目]] - 所属项目
- [[张三]] - 团队成员
```

### 在 frontmatter 中记录关系

```yaml
related_entities:
  - entity_id: "xxx"
    name: "王五"
    relation: "负责人"
    context: "某项目对接人"
  - entity_id: "yyy"
    name: "某运营项目"
    relation: "所属项目"
    context: "张三是该项目负责人"
```

## frontmatter 规范

所有实体必须包含标准化 frontmatter：

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
    relation: "负责人|成员|所属项目|..."
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

## 实体类型特定字段

### 人脉 (person)

```yaml
metadata:
  company: "公司名称"
  position: "职位"
  contact_channel: "微信|电话|邮件|..."
  importance: "high|medium|low"
  first_contact: "2026-04-15"
```

### 项目 (project)

```yaml
metadata:
  customer: "客户名称"
  start_date: "2026-04-15"
  status: "active|completed|on_hold"
  priority: "high|medium|low"
  owner: "负责人姓名"
```

### 任务 (task)

任务归类在 Projects 目录，文件名为 XXXX任务.md

```yaml
metadata:
  status: "pending|in_progress|completed|cancelled"
  priority: "high|medium|low"
  deadline: "2026-04-20"
  assignee: "负责人姓名"
  project_name: "所属项目名称"
  project_id: "所属项目ID"
  description: "任务详细描述"
  notes: "备注信息"
```

## 互动记录类型

| type | 说明 |
|------|------|
| `diary_mention` | 在日记中被提及 |
| `ai_analysis` | AI 分析时发现 |
| `user_feedback` | 用户反馈确认 |
| `update` | 信息更新 |

## 更新规则

1. **frontmatter 中的字段**：由 AI 维护，每次互动后更新
2. **正文内容**：可以由用户手动编辑，AI 不会覆盖
3. **关联实体**：通过双链 `[[名称]]` 和 frontmatter 中的 `related_entities` 双重记录
