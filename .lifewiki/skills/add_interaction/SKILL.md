# add_interaction

## 基本信息

- **名称**: add_interaction
- **功能**: 为已有实体添加互动记录
- **调用时机**: Step 2 实体处理 — 已归档实体自动添加互动 / Step 3 关系发现后添加记录

## 输入参数

```json
{
  "entityId": "entity-uuid",
  "content": "互动内容摘要",
  "sourceBlockId": "block-uuid"
}
```

## 输出格式

```json
{
  "success": true,
  "interactionId": "interaction-uuid"
}
```

## 执行流程

1. 验证必填字段 `entityId` 和 `content`
2. 构建互动记录对象（timestamp, type, content, sourceBlockId）
3. 调用 `entityManager.addInteraction()` 添加记录
4. 返回成功结果

## 错误处理

- **entityId 无效或不存在**: 返回错误 `entity not found: {entityId}`
- **content 为空**: 返回错误 `interaction content is required`
- **添加失败**: 返回错误 `failed to add interaction: {error}` 并附带日志

## 禁止虚假声明

**绝对禁止**：在没有调用工具获得成功结果之前，在回复中声称"已更新"、"已记录"。

**正确做法**：必须先调用 add_interaction → 获得成功结果 → 才能在回复中说"已更新"。
