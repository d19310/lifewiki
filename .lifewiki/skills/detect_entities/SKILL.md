# detect_entities

## 基本信息

- **名称**: detect_entities
- **功能**: 高效检测日记中的实体，支持精确匹配、别名匹配、Trie前缀匹配、编辑距离匹配
- **调用时机**: Step 1 实体检测 — Agent 分析日记时调用

## 输入参数

```json
{
  "diaryContent": "今天和张三、李四开会讨论华为项目进展...",
  "options": {
    "enableFuzzyMatch": true,
    "similarityThreshold": 0.8,
    "includeLocalFiles": true,
    "includeWebLinks": true,
    "addInteractionsToArchived": [
      { "entityId": "xxx", "content": "讨论项目进展" }
    ]
  }
}
```

### options.addInteractionsToArchived

可选字段，用于批量为已归档实体添加互动记录。传入数组，每个元素包含：
- `entityId`: 实体 ID
- `content`: 互动内容摘要

## 输出格式

```json
{
  "success": true,
  "data": {
    "archivedMatches": [
      {
        "name": "张三",
        "entityId": "xxx",
        "type": "person",
        "matchType": "exact",
        "confidence": 1.0
      },
      {
        "name": "华为",
        "entityId": "yyy",
        "type": "thing",
        "matchType": "trie",
        "confidence": 0.8
      }
    ],
    "newEntities": [
      {
        "name": "李四",
        "inferredType": "person",
        "confidence": 0.85,
        "autoConfirmed": true,
        "reason": "可能是人名"
      }
    ],
    "localFiles": ["~/documents/项目笔记.md"],
    "webLinks": ["https://example.com/article"],
    "interactionResults": [
      { "entityId": "xxx", "success": true },
      { "entityId": "yyy", "success": false, "error": "entity not found" }
    ],
    "summary": {
      "totalArchivedFound": 2,
      "totalNewFound": 1,
      "totalLocalFiles": 1,
      "totalWebLinks": 1,
      "totalInteractionsAdded": 1
    }
  }
}
```

### newEntities.autoConfirmed 字段

高置信度（>= 0.85）的新实体将标记 `autoConfirmed: true`，表示 AI 可以直接采用这个推断类型，无需用户确认。

| 置信度 | autoConfirmed | 说明 |
|--------|---------------|------|
| >= 0.85 | true | AI 可直接采用，无需用户确认 |
| < 0.85 | false | 需要用户确认类型 |

### interactionResults 字段

当 `options.addInteractionsToArchived` 传入时，返回批量添加互动的结果数组。部分是成功时也返回完整结果，AI 需检查每个结果的 success 字段。

## 执行流程

### 1. 构建实体索引

- 使用 EntityIndex 加载所有已归档实体
- 构建 HashMap（精确匹配）+ Trie（前缀匹配）+ 别名索引

### 2. 提取潜在实体名称

从日记内容中提取：
- 中文姓名（2-4个连续汉字）
- 英文姓名（首字母大写单词）
- 项目/任务名称（带有"项目"、"任务"等关键词）
- 公司/产品名称（可通过 NLP 或规则）

### 3. 批量匹配已归档实体

```
for each detected name:
  1. exact match (HashMap) → O(1)
  2. alias match → O(k)
  3. trie prefix match → O(m)
  4. edit distance match → O(k×n) [only for remaining candidates]
```

### 4. 识别新实体类型（AI Agent 执行）

**注意**：此步骤由 AI Agent 根据以下规则自行推断，executor 仅返回名称列表。

对于 `newEntities` 中的每个名称，AI Agent 参考以下规则推断类型：

#### 判断优先级

| 优先级 | 检测规则 | 推断类型 | 小类 | autoConfirmed |
|--------|---------|---------|------|---------------|
| 1 | 中文姓名（2-4字，常见姓氏如张/李/王等） | people | 人 | true (85%) |
| 2 | 包含"项目"关键词，或上下文提到"规划/推进/阶段性" | project | 项目 | true (90%) |
| 3 | 包含"任务"关键词，或上下文提到"执行/完成/拆分/待办" | project | 任务 | true (85%) |
| 4 | 包含 thing 关键词：手机/电脑/Mac/Pro/Phone/设备/设施/工具/产品/方案 | thing | 产品/设备 | false (75%) |
| 5 | 包含 idea 关键词：想法/灵感/概念/思路/创意/建议/思考 | idea | 想法 | false (75%) |
| 6 | 包含 knowledge 关键词：文章/论文/书籍/报告/文档/新闻/媒体/播客/视频/课程 | knowledge | 文章/文档 | false (80%) |
| 7 | 英文大写开头单词（符合人名格式） | people | 人(英文) | false (60%) |
| 8 | 无法判断 | knowledge | 未分类 | false (30%) |

#### 大类说明

| 大类 | 小类 | 判断标准 | 归档目录 |
|------|------|---------|---------|
| **people** | 人 | 人名检测（2-4字中文名、英文名） | People/ |
| **project** | 项目 | 系统性工作、长期规划、多步骤、需要持续推进、可拆分子事项 | Projects/ |
| **project** | 任务 | 单次行动、立刻能做、做完就结束、简单执行项、可能属于项目的拆分事项 | Projects/ |
| **thing** | 产品/设备/设施/方案 | 根据小类定义结合上下文 | Things/ |
| **idea** | 想法/灵感/新概念 | 根据小类定义结合上下文 | Ideas/ |
| **knowledge** | 文章/论文/书籍/媒体/新闻/文档 | 根据小类定义结合上下文 | Knowledge/ |

#### 新增字段

`newEntities` 中的每个实体现在包含：

```json
{
  "name": "某某项目",
  "inferredType": "project",
  "subType": "项目",
  "confidence": 0.9,
  "autoConfirmed": true,
  "reason": "系统性工作，判断为项目"
}
```

- `subType`: 小类类型（人/项目/任务/产品-设备/想法/文章-文档/未分类）
- `confidence`: 置信度分数
- `autoConfirmed`: 是否可以跳过用户确认（置信度 >= 0.85）
- `reason`: 推断原因的简要说明

### 5. 检测本地文件和链接

使用正则表达式提取：
- 本地文件：`~/xxx.md` 或 `/Users/xxx/xxx.md`
- 网页链接：`https?://...`

### 6. 返回结构化结果

## 匹配优先级

| 优先级 | 匹配类型 | 算法 | 置信度 |
|--------|---------|------|--------|
| 1 | 精确匹配 | HashMap | 1.0 |
| 2 | 别名匹配 | HashMap | 0.95 |
| 3 | 前缀匹配 | Trie | 0.8 |
| 4 | 编辑距离 | Levenshtein | 0.6 |

## 错误处理

- **EntityManager 未初始化**: 返回错误 `entity manager not initialized`
- **索引构建失败**: 返回错误 `failed to build entity index: {error}`
- **提取实体失败**: 返回空结果而非抛出异常

## Token 节省设计

1. **EntityIndexSummary 只传摘要**：不传全部实体字段，只传 `{name, type}`
2. **批量匹配**：一次调用处理多个名称，减少 API 调用次数
3. **候选限制**：Trie 匹配限制返回最多 5 个结果

## 禁止虚假声明

**绝对禁止**：在没有调用工具获得成功结果之前，在回复中声称"已检测到"、"已匹配"。

**正确做法**：必须先调用 detect_entities → 获得成功结果 → 才能在回复中说"检测到"。
