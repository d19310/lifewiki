# search_entity

## 基本信息

- **名称**: search_entity
- **功能**: 在已归档实体中搜索与给定名称匹配的单个实体
- **调用时机**: Step 1 实体检测（检测特定名称）/ Step 4 冲突检测（确认已有信息）

## 输入参数

```json
{
  "name": "实体名称"
}
```

## 输出格式

```json
{
  "found": true,
  "entity": {
    "id": "entity-uuid",
    "title": "实体名称",
    "type": "person|project|...",
    "summary": "一句话描述",
    "metadata": { ... }
  }
}
```

## 执行流程

1. 接收搜索名称 `name`
2. 调用 `entityManager.findEntity(name)` 精确匹配
3. 如果未找到，尝试模糊匹配（别名、标题）
4. 返回匹配结果或 `found: false`

## 错误处理

- **name 为空**: 返回错误 `entity name is required`
- **搜索失败**: 返回 `found: false` 而非抛出异常
- **多个匹配**: 返回第一个匹配结果，附带 `warnings: ["multiple matches found"]`
