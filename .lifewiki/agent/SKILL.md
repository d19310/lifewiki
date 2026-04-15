# LifeWiki Agent 可用技能

## 技能列表

### search_entity
在已归档实体中搜索匹配项。

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
    "summary": "一句话描述"
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
更新已有实体。

**输入**:
```json
{
  "entityId": "xxx",
  "updates": {
    "title": "新名称",
    "summary": "新描述",
    "tags": ["标签1"]
  }
}
```

**输出**:
```json
{
  "success": true
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
  "relation": "负责人|成员|相关",
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
      "summary": "一句话描述",
      "updatedAt": "2026-04-15"
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
