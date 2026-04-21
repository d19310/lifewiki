# detect_conflicts

## 基本信息

- **名称**: detect_conflicts
- **功能**: 检测日记内容与已有实体档案之间的事实冲突
- **调用时机**: Step 4 冲突检测和处理 — 分析日记后，检测是否有事实冲突需要用户确认

## 输入参数

```json
{
  "entityId": "entity-uuid",
  "diaryContent": "日记内容...",
  "options": {
    "checkFields": ["公司", "职位", "状态", "项目"],
    "strictMode": false
  }
}
```

### 输入字段

| 字段 | 必填 | 说明 |
|------|------|------|
| entityId | 是 | 要检测冲突的实体 ID |
| diaryContent | 是 | 日记内容（包含新的事实描述） |
| options.checkFields | 否 | 要检查的字段列表，默认全部 |
| options.strictMode | 否 | 严格模式，任何差异都算冲突 |

## 输出格式

```json
{
  "success": true,
  "data": {
    "hasConflicts": true,
    "conflicts": [
      {
        "field": "metadata.company",
        "conflictType": "value_changed",
        "oldValue": "华为科技",
        "newValue": "华为技术有限公司",
        "evidence": {
          "diary": "日记中提到'华为技术有限公司'",
          "archive": "档案中记录公司为'华为科技'"
        },
        "severity": "medium",
        "autoResolved": false
      }
    ],
    "unchanged": [
      {
        "field": "type",
        "archiveValue": "person",
        "diaryImplication": "人",
        "status": "consistent"
      }
    ],
    "summary": {
      "totalConflicts": 1,
      "totalUnchanged": 1,
      "autoResolvedCount": 0
    }
  }
}
```

## 冲突类型分类

| 冲突类型 | 说明 | 示例 |
|---------|------|------|
| `value_changed` | 值发生变化 | 公司从"A"变为"B" |
| `status_changed` | 状态变更 | 项目从"进行中"变为"已完成" |
| `relation_conflict` | 关联冲突 | 某人不再是项目成员 |
| `type_conflict` | 类型冲突 | 原本是"人"但日记描述像"公司" |
| `alias_conflict` | 别名冲突 | 发现新别名与现有别名不符 |
| `metadata_missing` | 元数据缺失 | 日记提到但档案没有记录 |

## 冲突严重程度

| 严重程度 | 说明 | 自动处理 |
|---------|------|---------|
| `high` | 重要事实变更，可能影响分析 | 需要用户确认 |
| `medium` | 中等变更，可能需要更新 | 建议用户确认 |
| `low` | 小幅调整，用户可忽略 | 展示但不强制 |

## 冲突检测规则

AI Agent 根据以下规则检测冲突：

### 1. 公司/职位变更 (company/position)

```typescript
// 日记中提到的公司 ≠ 档案中的公司 → 冲突
if (diaryCompany !== archiveCompany) {
  return { conflictType: 'value_changed', severity: 'medium' }
}
```

### 2. 项目状态变更 (project status)

```typescript
// 日记描述状态 ≠ 档案记录状态 → 冲突
// 例如：日记说"项目已结束"，档案显示"进行中"
```

### 3. 成员关系变更 (member relation)

```typescript
// 日记提到某人是项目成员，但档案中没有记录 → 潜在冲突
// 日记没提到某人，但档案中记录其为成员 → 潜在冲突
```

### 4. 事实一致性检测

```typescript
// 日记事实与档案矛盾
// 例如：档案记录"A是B的负责人"，日记说"C是B的负责人" → 冲突
```

## 冲突证据展示

检测到冲突时，返回详细的证据对比：

```json
{
  "evidence": {
    "diary": "日记中提到：'张三现在在华为技术有限公司工作'",
    "archive": "档案中记录：公司为'华为科技'",
    "diaryQuoted": "华为技术有限公司",
    "archiveQuoted": "华为科技"
  }
}
```

## 自动处理规则

以下情况可自动标记为 `autoResolved: true`：

| 条件 | 说明 |
|------|------|
| 笔误修正 | 日记和档案语义相同，只是表述差异 |
| 同义公司 | "华为科技" vs "华为技术有限公司" → 建议合并 |
| 状态推进 | 项目自然推进（如"规划中"→"进行中"） |

## 执行流程

### Step 4 冲突检测完整流程

1. **获取实体档案** - 从 entityId 获取档案完整信息
2. **提取日记事实** - 从日记内容中提取与该实体相关的关键事实
3. **对比关键字段** - 按冲突类型逐一对比
4. **返回检测结果** - 包含所有冲突和未变化的字段

### 检测步骤

1. 解析日记内容，提取与实体相关的关键信息
2. 对比档案中的可比较字段
3. 生成冲突报告和证据

## 错误处理

- **entityId 无效**: 返回错误 `entity not found`
- **diaryContent 为空**: 返回 `hasConflicts: false`
- **检测失败**: 返回错误详情

## 与 Step 4 配合使用

```
Step 3 完成后 → Step 4 开始
  │
  ├─→ 对每个已确认的实体调用 detect_conflicts
  │     │
  │     ├─→ hasConflicts: false → 直接进入 Step 5
  │     │
  │     └─→ hasConflicts: true → 展示冲突，等待用户确认
  │           │
  │           └─→ 用户确认后，调用 process_updates 批量更新
  │
  └─→ 所有实体检测完成 → 进入 Step 5
```

## 禁止虚假声明

**绝对禁止**：在没有调用工具获得检测结果之前，在回复中声称"检测到冲突"。

**正确做法**：必须先调用 detect_conflicts → 获得结果 → 才能在回复中说"检测到冲突"。
