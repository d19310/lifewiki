# LifeWiki 模板目录

本目录包含 LifeWiki 使用的所有模板文件。

## 模板列表

| 模板 | 文件名 | 用途 |
|------|--------|------|
| 日记模板 | `journal-template.md` | 创建新的日记文件 |
| 人脉模板 | `person-template.md` | 创建人物实体档案 |
| 项目模板 | `project-template.md` | 创建项目实体档案 |
| 任务模板 | `task-template.md` | 创建任务实体档案 |
| 物品模板 | `thing-template.md` | 创建物品/工具实体档案 |
| 想法模板 | `idea-template.md` | 创建想法/观点实体档案 |
| 知识模板 | `knowledge-template.md` | 创建知识/文档实体档案 |

## 使用说明

### 日记模板
新建日记文件时使用，文件命名格式：`YYYY-MM-DD.md`

### 实体模板
创建新实体档案时使用，文件命名格式：`实体名称.md`

- 人脉：`People/姓名.md`
- 项目：`Projects/XXXX项目.md`
- 任务：`Projects/XXXX任务.md`
- 物品：`Things/名称.md`
- 想法：`Ideas/名称.md`
- 知识：`Knowledge/标题.md`

## frontmatter 说明

所有模板都包含标准化的 frontmatter：

- `entity_id`: 实体唯一标识符（UUID）
- `entity_type`: 实体类型
- `created_at`: 创建时间
- `created_by`: 创建者（human/ai）
- `confidence`: AI 识别置信度
- `verification_status`: 验证状态
- `title`: 标准名称
- `title_raw`: 原始提及形式
- `aliases`: 别名列表
- `tags`: 标签
- `summary`: 一句话描述
- `related_entities`: 关联实体
- `interactions`: 互动历史
- `metadata`: 类型特定元数据
