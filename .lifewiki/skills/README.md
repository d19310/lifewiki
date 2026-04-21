# LifeWiki Skills Index

共享 Skills 目录，所有 Agent 可调用。

## 目录结构

```
.lifewiki/skills/
├── add_interaction/      # 添加互动记录
├── clip_and_summarize/   # 抓取并总结网页
├── create_entity/        # 创建新实体档案
├── link_entities/        # 建立实体间双链关系
├── list_entities/        # 批量获取已归档实体
├── read_local_document/ # 读取本地文件系统中的文档
├── search_entity/        # 搜索单个实体
└── update_entity/        # 更新已有实体
```

## Skills 清单

| Skill | 功能 | 触发时机 |
|-------|------|---------|
| `list_entities` | 批量获取 vault 中指定类型的所有已归档实体 | Step 1 实体检测 |
| `search_entity` | 在已归档实体中搜索与给定名称匹配的单个实体 | Step 1 / Step 4 |
| `create_entity` | 创建新的实体档案并写入 vault | Step 2 实体处理 |
| `add_interaction` | 为已有实体添加互动记录 | Step 2 / Step 3 |
| `link_entities` | 在两个实体之间建立双向关联关系 | Step 3 关系发现 |
| `update_entity` | 更新已有实体的字段信息 | Step 4 冲突处理 |
| `read_local_document` | 读取本地文件系统中的 Markdown 文档内容 | Step 2 处理本地文件 |
| `clip_and_summarize` | 抓取网页内容并生成摘要总结 | Step 2 处理链接 |

## 每个 Skill 的结构

每个 skill 目录包含：

- **SKILL.md** — 技能定义文档
  - 名称、功能、调用时机
  - 输入参数格式（JSON Schema）
  - 输出格式
  - 执行流程
  - 错误处理方式

- **executor.ts** — TypeScript 执行脚本
  - 封装实际逻辑
  - 调用 EntityManager 等核心模块
  - 返回 ToolExecutionResult 格式
