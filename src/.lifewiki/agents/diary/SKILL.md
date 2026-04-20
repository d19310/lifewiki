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

**⚠️ 强制执行示例（必须遵循）：**

日记提到"[某甲方]需要给出一个方案"，而"[某甲方]"是已归档的甲方公司。
→ 正确做法：必须先调用 `search_entity` 查找该甲方公司 -> 获得entityId -> 调用 `update_entity` 更新互动记录 -> 才能说"已更新"。

日记提到"[某项目名]有新进展"。
→ 正确做法：必须先调用 `search_entity` 查找该项目 -> 获得entityId -> 调用 `update_entity` 更新状态和互动记录 -> 才能说"已更新"。

**禁止在没有调用工具的情况下声称"已更新"、"已记录"。**

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

### clip_webpage
抓取网页内容并转换为 Markdown 格式。支持普通网站和微信公众号文章。

**输入**:
```json
{
  "url": "https://example.com/article"
}
```

**输出**:
```json
{
  "success": true,
  "title": "文章标题",
  "content": "# Markdown 内容...",
  "author": "作者名称",
  "siteName": "网站名称",
  "url": "https://example.com/article",
  "clippedAt": "2026-04-15T10:00:00Z",
  "truncated": false,
  "preview": "内容前500字符..."
}
```

### summarize_content
使用 AI 总结 Markdown 内容。返回简洁的中文摘要（100-200字）。

**输入**:
```json
{
  "content": "# Markdown 内容...",
  "title": "文章标题（可选）",
  "url": "https://example.com（可选）",
  "author": "作者名称（可选）"
}
```

**输出**:
```json
{
  "success": true,
  "summary": "这是一篇关于XXX的文章，主要讨论了...",
  "originalLength": 5000,
  "title": "文章标题"
}
```

### clip_and_summarize
一站式抓取网页并总结。比单独调用 clip_webpage 和 summarize_content 更高效。

**输入**:
```json
{
  "url": "https://example.com/article"
}
```

**输出**:
```json
{
  "success": true,
  "clipped": true,
  "summarized": true,
  "title": "文章标题",
  "content": "# Markdown 内容...",
  "summary": "这是一篇关于XXX的文章...",
  "url": "https://example.com/article",
  "author": "作者名称",
  "siteName": "网站名称",
  "clippedAt": "2026-04-15T10:00:00Z",
  "originalLength": 5000
}
```
