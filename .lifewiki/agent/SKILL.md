# LifeWiki Agent 可用技能

## 技能列表

### search_entity
在已归档实体中搜索匹配项。返回完整的实体信息供 AI 理解背景。

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
    "type": "person",
    "name": "实体名称",
    "titleRaw": "原始名称",
    "aliases": ["别名1"],
    "summary": "一句话描述",
    "tags": ["标签1"],
    "metadata": {
      "status": "active",
      "公司": "xxx公司",
      "职位": "总经理"
    },
    "recentInteractions": [
      {"timestamp": "2026-04-15", "type": "diary_mention", "content": "讨论了项目进展"}
    ],
    "relatedEntities": [
      {"entityId": "yyy", "relation": "负责人", "context": "项目负责人"}
    ]
  }
}
```

### create_entity
创建新实体档案。

**输入**:
```json
{
  "entityType": "person|project|task|thing|idea|knowledge",
  "name": "实体名称",
  "summary": "一句话描述",
  "metadata": {
    "status": "active",
    "source": "diary"
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
更新已有实体。**元数据更新是重点**，包含实体的关键事实信息。

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
  "content": "在日记中讨论了XXX项目",
  "sourceBlockId": "block-xxx"
}
```

**输出**:
```json
{
  "success": true
}
```

### link_entities
建立实体间的双链关系。

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
