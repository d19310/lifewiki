# process_entities

## 基本信息

- **名称**: process_entities
- **功能**: 批量处理实体操作——创建实体、添加互动记录、批量更新
- **调用时机**: Step 2 实体处理 — 一次调用完成多个实体的创建和更新

## 输入参数

```json
{
  "entities": [
    {
      "name": "张三",
      "action": "create",
      "entityType": "person",
      "subType": "人",
      "summary": "项目经理",
      "sourceDiaryContent": "今天和张三、李四开会讨论华为项目进展..."
    },
    {
      "name": "李四",
      "action": "add_interaction",
      "entityId": "existing-entity-id",
      "content": "今天的日记提到讨论项目进展"
    }
  ],
  "options": {
    "skipOnConflict": false
  }
}
```

### action 类型

| action | 说明 | 必填字段 | 可选字段 |
|--------|------|---------|---------|
| `create` | 创建新实体 | `name`, `entityType` | `subType`, `summary`, `sourceDiaryContent`, `metadata` |
| `add_interaction` | 为已存在实体添加互动 | `entityId`, `content` | - |
| `link` | 关联两个实体 | `entityIdA`, `entityIdB`, `relation` | `context` |

### create 新增字段

| 字段 | 说明 |
|------|------|
| `subType` | 子类型（如"人"、"项目"、"任务"），会写入 metadata |
| `sourceDiaryContent` | 来源日记内容，会创建为初始互动记录（自动截取前 200 字） |

## 输出格式

```json
{
  "success": true,
  "results": {
    "created": [
      {
        "name": "张三",
        "entityId": "new-entity-id",
        "path": "People/张三.md",
        "success": true
      }
    ],
    "interactions": [
      {
        "entityId": "existing-entity-id",
        "success": true
      }
    ],
    "links": [],
    "errors": [
      {
        "name": "王五",
        "action": "create",
        "error": "entity already exists"
      }
    ]
  },
  "summary": {
    "totalCreated": 1,
    "totalInteractionsAdded": 1,
    "totalLinksCreated": 0,
    "totalErrors": 1
  }
}
```

## 执行流程

### Phase 2 优化说明

传统的 Step 2 实体处理需要逐个调用 `create_entity` 或 `add_interaction`，每次都要等待 AI 回复确认。

使用 `process_entities` 可以一次处理多个实体：

1. **AI 分析检测结果** → 确定需要处理的实体列表
2. **构建操作请求** → 一次传入所有创建/更新操作
3. **批量执行** → 返回每个操作的详细结果
4. **AI 汇总报告** → 根据结果生成用户友好的总结

### 执行流程

1. 解析 `entities` 数组
2. 对每个元素根据 `action` 类型执行对应操作：
   - `create`: 调用 `entityManager.createEntity()`
   - `add_interaction`: 调用 `entityManager.addInteraction()`
   - `link`: 调用 `entityManager.updateEntity()` 添加关联
3. 收集结果和错误
4. 返回结构化响应

## 错误处理

- **entityId 无效**: 返回错误但不中断其他操作
- **实体已存在**: 返回错误，标记 `alreadyExists: true`
- **创建失败**: 返回错误，包含具体原因
- **部分成功**: 继续处理其他实体，最终返回完整结果

## 禁止虚假声明

**绝对禁止**：在没有调用工具获得成功结果之前，在回复中声称"已创建"、"已更新"。

**正确做法**：必须先调用 process_entities → 获得成功结果 → 才能在回复中说"已创建"。

## 与 detect_entities 配合使用

```
Step 1: detect_entities
  → 获取检测结果（包含 newEntities 和 archivedMatches）

Step 2: process_entities
  → 传入 entities 数组，一次完成所有创建/更新
  → high confidence 的 newEntities 可直接设置 action: "create" 跳过确认
```

### 示例：high confidence 自动创建

```json
// detect_entities 返回的 newEntities 中
{
  "name": "李四",
  "inferredType": "person",
  "confidence": 0.85,
  "autoConfirmed": true
}

// process_entities 输入
{
  "entities": [
    {
      "name": "李四",
      "action": "create",
      "entityType": "person",
      "summary": "新发现的联系人"
    }
  ]
}
```