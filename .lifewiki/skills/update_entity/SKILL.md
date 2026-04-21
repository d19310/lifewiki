# update_entity

## 基本信息

- **名称**: update_entity
- **功能**: 更新已有实体的字段信息
- **调用时机**: Step 4 冲突检测和处理 — 用户确认最新状态后更新 / 场景6更新实体

## 输入参数

```json
{
  "entityId": "entity-uuid",
  "updates": {
    "title": "新名称",
    "summary": "新描述",
    "tags": ["标签1"],
    "metadata": { ... }
  }
}
```

## 输出格式

```json
{
  "success": true,
  "entity": {
    "id": "entity-uuid",
    "title": "更新后的名称",
    ...
  }
}
```

## 执行流程

1. 验证必填字段 `entityId`
2. 确认实体存在
3. 合并 `updates` 到现有实体
4. 调用 `entityManager.updateEntity()` 更新
5. 返回更新后的实体完整信息

## 错误处理

- **entityId 无效或不存在**: 返回错误 `entity not found: {entityId}`
- **updates 为空**: 返回错误 `no updates provided`
- **更新失败**: 返回错误 `failed to update entity: {error}` 并附带日志

## 禁止虚假声明

**绝对禁止**：在没有调用工具获得成功结果之前，在回复中声称"已更新"。

**正确做法**：必须先调用 update_entity → 获得成功结果 → 才能在回复中说"已更新"。
