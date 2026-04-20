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
  "entityType": "person|project|task|thing|idea|knowledge",
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
  "entityType": "person|project|task|thing|idea|knowledge",
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

### update_entity
更新已有实体。元数据更新是重点，包含实体的关键事实信息。**需要用户确认后才能执行**。

**输入**:
```json
{
  "entityId": "xxx",
  "updates": {
    "summary": "新描述",
    "tags": ["标签1"],
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
  "updatedFields": ["summary", "metadata"],
  "newMetadata": {"公司": "新公司名", "职位": "新职位"}
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
建立实体间的双链关系。**需要用户确认后才能执行**。

**输入**:
```json
{
  "entityIdA": "xxx",
  "entityIdB": "yyy",
  "relation": "负责人|成员|株式会社",
  "context": "在XXX项目中担任YYY角色"
}
```

**输出**:
```json
{
  "success": true
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
<function_calls><invoke name="get_diary_entries"><parameter name="startDate">2026-04-01</parameter><parameter name="endDate">2026-04-19</parameter></invoke></function_calls>

错误格式（不要使用）：
```
get_diary_entries({"startDate": "2026-04-01"})
```
