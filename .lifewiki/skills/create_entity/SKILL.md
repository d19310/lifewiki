# create_entity

## 基本信息

- **名称**: create_entity
- **功能**: 创建新的实体档案并写入 vault
- **调用时机**: Step 2 实体处理 — 用户确认新实体类型后创建档案

## 输入参数

```json
{
  "entityType": "person|project|task|thing|idea|knowledge",
  "name": "实体名称",
  "summary": "一句话描述",
  "sourceDocument": "可选：源文档路径",
  "sourceContent": "可选：源文档内容摘要",
  "metadata": {
    "status": "active",
    "source": "diary"
  }
}
```

## 输出格式

```json
{
  "success": true,
  "entityId": "new-entity-uuid",
  "path": "People/实体名称.md"
}
```

## 执行流程

1. 验证必填字段 `entityType` 和 `name`
2. 根据 `entityType` 确定目标目录（People/Projects/Things/Ideas/Knowledge）
3. 构建实体 frontmatter 和内容
4. 调用 `entityManager.createEntity()` 创建实体
5. 返回创建结果（含 entityId 和文件路径）

## 错误处理

- **entityType 无效**: 返回错误 `invalid entity type`
- **name 为空**: 返回错误 `entity name is required`
- **实体已存在**: 返回错误 `entity already exists: {name}`
- **创建失败**: 返回错误 `failed to create entity: {error}` 并附带日志

## 禁止虚假声明

**绝对禁止**：在没有调用工具获得成功结果之前，在回复中声称"已创建"、"已归档"。

**正确做法**：必须先调用 create_entity → 获得成功结果 → 才能在回复中说"已创建"。
