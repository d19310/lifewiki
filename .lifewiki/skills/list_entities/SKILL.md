# list_entities

## 基本信息

- **名称**: list_entities
- **功能**: 批量获取 vault 中指定类型的所有已归档实体
- **调用时机**: Step 1 实体检测 — 获取已归档实体列表以检测日记中是否提及

## 输入参数

```json
{
  "entityType": "person|project|task|thing|idea|knowledge",
  "status": "active|archived|all"
}
```

## 输出格式

```json
{
  "success": true,
  "entities": [
    {
      "id": "entity-uuid",
      "title": "实体名称",
      "type": "person|project|...",
      "summary": "一句话描述",
      "metadata": { ... }
    }
  ],
  "total": 10
}
```

## 执行流程

1. 根据 `entityType` 确定查询的实体类型
2. 根据 `status` 过滤实体状态（默认 active）
3. 调用 `entityManager.getEntitiesByType()` 获取实体列表
4. 提取实体的 id、title、type、summary、metadata 字段
5. 返回格式化结果

## 错误处理

- **entityType 无效**: 返回错误 `invalid entity type`
- **entityManager 未初始化**: 返回错误 `entity manager not initialized`
- **查询失败**: 返回错误并附带日志 `failed to list entities: {error}`
