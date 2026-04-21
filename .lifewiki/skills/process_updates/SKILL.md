# process_updates

## 基本信息

- **名称**: process_updates
- **功能**: 批量更新多个实体的字段信息
- **调用时机**: Step 4 冲突检测和处理 — 用户确认冲突后，批量更新实体信息

## 输入参数

```json
{
  "updates": [
    {
      "entityId": "entity-uuid",
      "changes": {
        "summary": "新描述",
        "metadata": {
          "company": "新公司"
        }
      },
      "reason": "用户确认更新"
    }
  ],
  "options": {
    "skipOnError": false
  }
}
```

### 输入字段

| 字段 | 必填 | 说明 |
|------|------|------|
| updates | 是 | 要更新的数组 |
| updates[].entityId | 是 | 要更新的实体 ID |
| updates[].changes | 是 | 要更新的字段（与 update_entity 相同） |
| updates[].reason | 否 | 更新原因（用于互动记录） |
| options.skipOnError | 否 | 遇到错误是否跳过继续（默认 false） |

## 输出格式

```json
{
  "success": true,
  "results": {
    "updated": [
      {
        "entityId": "entity-uuid",
        "success": true,
        "entity": {
          "id": "entity-uuid",
          "title": "更新后的名称",
          "metadata": { ... }
        }
      }
    ],
    "errors": [
      {
        "entityId": "entity-uuid",
        "success": false,
        "error": "entity not found"
      }
    ]
  },
  "summary": {
    "totalUpdated": 1,
    "totalErrors": 1
  }
}
```

## 与 detect_conflicts 配合使用

```
Step 3 完成后 → Step 4 开始
  │
  ├─→ 对每个实体调用 detect_conflicts
  │     │
  │     ├─→ hasConflicts: false → 跳过
  │     │
  │     └─→ hasConflicts: true → 展示冲突，等待用户确认
  │           │
  │           └─→ 用户确认后，收集所有需要更新的实体
  │
  └─→ 调用 process_updates 一次性更新所有确认的冲突
```

### 示例：完整流程

```json
// 1. detect_conflicts 返回的冲突
{
  "hasConflicts": true,
  "conflicts": [
    {
      "field": "metadata.company",
      "oldValue": "华为科技",
      "newValue": "华为技术有限公司",
      "severity": "medium"
    }
  ]
}

// 2. 用户确认后，调用 process_updates
{
  "updates": [
    {
      "entityId": "xxx",
      "changes": {
        "metadata": {
          "company": "华为技术有限公司"
        }
      },
      "reason": "冲突解决：用户确认公司名称变更"
    }
  ]
}
```

## 执行流程

1. 解析 `updates` 数组
2. 对每个更新验证实体存在性
3. 批量执行更新
4. 收集结果和错误
5. 返回结构化响应

## 错误处理

- **entityId 无效**: 返回错误但不中断其他更新
- **字段更新失败**: 返回错误，包含具体原因
- **部分成功**: 继续处理其他更新，返回完整结果

## 禁止虚假声明

**绝对禁止**：在没有调用工具获得成功结果之前，在回复中声称"已更新"。

**正确做法**：必须先调用 process_updates → 获得成功结果 → 才能在回复中说"已更新"。
