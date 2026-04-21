# LifeWiki Chat Agent 技能

## 技能列表

### get_diary_entries
获取指定日期范围内的日记条目。

**输入**:
```json
{
  "startDate": "2026-04-01",
  "endDate": "2026-04-19",
  "query": "可选的搜索关键词"
}
```

**输出**:
```json
{
  "entries": [
    { "date": "2026-04-19", "content": "日记内容..." }
  ],
  "total": 2
}
```

### search_entity
搜索已归档的实体。

**输入**:
```json
{
  "name": "实体名称"
}
```

**输出**:
```json
{
  "found": true,
  "entity": {
    "id": "xxx",
    "name": "实体名称",
    "type": "person",
    "titleRaw": "原始名称",
    "aliases": ["别名1"],
    "summary": "一句话描述",
    "tags": ["标签1"],
    "metadata": {},
    "recentInteractions": [
      {"timestamp": "2026-04-15", "type": "diary_mention", "content": "讨论了项目进展"}
    ],
    "relatedEntities": [
      {"entityId": "yyy", "relation": "负责人", "context": "项目负责人"}
    ]
  }
}
```

### list_entities
列出某一类型的实体。

**输入**:
```json
{
  "entityType": "person|project|thing|idea|knowledge",
  "status": "active|all"
}
```

**输出**:
```json
{
  "entities": [
    {
      "id": "xxx",
      "name": "实体名称",
      "titleRaw": "原始名称",
      "aliases": ["别名"],
      "summary": "一句话描述",
      "tags": ["标签"],
      "metadata": {"status": "active"},
      "lastInteraction": "最近一次互动内容摘要"
    }
  ]
}
```

### create_entity
创建新实体档案。**需要用户确认后才能执行**。

**输入**:
```json
{
  "entityType": "person|project|thing|idea|knowledge",
  "name": "实体名称",
  "summary": "一句话描述",
  "metadata": {
    "status": "active",
    "source": "chat"
  }
}
```

**输出**:
```json
{
  "success": true,
  "entityId": "xxx",
  "path": "People/实体名称.md"
}
```

### process_entities
批量处理实体操作——创建实体、添加互动记录、关联实体。**需要用户确认后才能执行**。

**输入**:
```json
{
  "entities": [
    {
      "name": "新实体",
      "action": "create",
      "entityType": "person",
      "summary": "实体描述"
    },
    {
      "action": "add_interaction",
      "entityId": "existing-entity-id",
      "content": "讨论了项目进展"
    }
  ]
}
```

**action 类型**:
| action | 说明 | 必填字段 |
|--------|------|---------|
| `create` | 创建新实体 | `name`, `entityType` |
| `add_interaction` | 添加互动记录 | `entityId`, `content` |
| `link` | 关联两个实体 | `entityIdA`, `entityIdB`, `relation` |

**输出**:
```json
{
  "success": true,
  "results": {
    "created": [{"name": "新实体", "entityId": "xxx", "success": true}],
    "interactions": [{"entityId": "yyy", "success": true}],
    "links": [],
    "errors": []
  },
  "summary": {
    "totalCreated": 1,
    "totalInteractionsAdded": 1,
    "totalLinksCreated": 0,
    "totalErrors": 0
  }
}
```

### update_entity
更新已有实体。**需要用户确认后才能执行**。

**输入**:
```json
{
  "entityId": "xxx",
  "updates": {
    "summary": "新描述",
    "metadata": {
      "公司": "新公司名",
      "职位": "新职位"
    }
  }
}
```

**输出**:
```json
{
  "success": true,
  "entity": {
    "id": "xxx",
    "title": "更新后的名称",
    "metadata": {}
  }
}
```

### process_updates
批量更新多个实体的字段信息。**需要用户确认后才能执行**。

**输入**:
```json
{
  "updates": [
    {
      "entityId": "xxx",
      "changes": {
        "metadata": {
          "公司": "新公司"
        }
      },
      "reason": "用户确认更新"
    }
  ]
}
```

**输出**:
```json
{
  "success": true,
  "results": {
    "updated": [{"entityId": "xxx", "success": true}],
    "errors": []
  },
  "summary": {
    "totalUpdated": 1,
    "totalErrors": 0
  }
}
```

### add_interaction
为实体添加互动记录。

**输入**:
```json
{
  "entityId": "xxx",
  "content": "在对话中讨论了XXX项目",
  "sourceBlockId": "chat:global"
}
```

**输出**:
```json
{
  "success": true
}
```

### link_entities
批量建立实体间的双向关联关系。**需要用户确认后才能执行**。

**输入**:
```json
{
  "links": [
    {
      "entityIdA": "xxx",
      "entityIdB": "yyy",
      "relation": "负责人",
      "context": "在XXX项目中担任负责人"
    }
  ]
}
```

**关系类型**:
| 关系 | 说明 | 反向 |
|------|------|------|
| 负责人 | A 是 B 的负责人 | 成员 |
| 成员 | A 是 B 的成员 | 负责人 |
| 相关 | A 与 B 相关 | 相关 |
| 同一项目 | A 和 B 属于同一项目 | 同一项目 |
| 同一任务 | A 和 B 属于同一任务 | 同一任务 |
| 属于 | A 属于 B | 包含 |
| 包含 | A 包含 B | 属于 |
| 对立 | A 与 B 对立 | 对立 |
| 上下游 | A 是 B 的上游/下游 | 上下游 |
| 合作 | A 与 B 合作 | 合作 |
| 替代 | A 可替代 B | 被替代 |
| 组成 | A 是 B 的组成部分 | 的组成部分 |

**输出**:
```json
{
  "success": true,
  "results": {
    "linked": [
      {"entityIdA": "xxx", "entityIdB": "yyy", "relation": "负责人", "success": true}
    ],
    "errors": []
  },
  "summary": {
    "totalLinked": 1,
    "totalErrors": 0
  }
}
```

### detect_conflicts
检测对话内容与实体档案之间的事实冲突。

**输入**:
```json
{
  "entityId": "xxx",
  "diaryContent": "用户提到的最新信息..."
}
```

**冲突类型**:
| 类型 | 说明 |
|------|------|
| value_changed | 值发生变化（公司、职位） |
| status_changed | 状态变更（项目状态） |
| relation_conflict | 关联冲突 |
| metadata_missing | 元数据缺失 |

**输出**:
```json
{
  "success": true,
  "data": {
    "hasConflicts": true,
    "conflicts": [
      {
        "field": "metadata.company",
        "conflictType": "value_changed",
        "oldValue": "旧公司",
        "newValue": "新公司",
        "evidence": {
          "diary": "用户提到在新公司工作",
          "archive": "档案记录在旧公司"
        },
        "severity": "medium"
      }
    ],
    "summary": {
      "totalConflicts": 1,
      "totalUnchanged": 0
    }
  }
}
```

### get_related_entities
获取实体的关联实体列表。

**输入**:
```json
{
  "entityId": "实体ID"
}
```

**输出**:
```json
{
  "entity": { "id": "xxx", "name": "实体名称", "type": "person" },
  "related": [
    { "entity": { "id": "yyy", "name": "关联实体", "type": "project" }, "relation": "负责人", "context": "备注" }
  ]
}
```

### get_entity_history
获取实体的互动历史。

**输入**:
```json
{
  "entityId": "xxx"
}
```

**输出**:
```json
{
  "interactions": [
    {
      "timestamp": "2026-04-15T10:00:00Z",
      "type": "diary_mention",
      "content": "讨论了XXX项目",
      "sourceBlockId": "block-xxx"
    }
  ]
}
```

## 函数调用格式

当需要执行技能时，必须使用以下XML格式：

正确格式：
```xml
<function_calls><invoke name="search_entity"><parameter name="name">华为</parameter></invoke></function_calls>
```

错误格式（不要使用）：
```
search_entity({"name": "华为"})
```
