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
    "name": "实体名称",
    "type": "person",
    "summary": "一句话描述",
    "metadata": {},
    "recentInteractions": []
  }
}
```

### list_entities
列出某一类型的实体。

**输入**:
```json
{
  "entityType": "person|project|task|thing|idea|knowledge"
}
```

**输出**:
```json
{
  "entities": [
    { "name": "实体1", "type": "person", "summary": "..." },
    { "name": "实体2", "type": "project", "summary": "..." }
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
