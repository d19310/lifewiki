# Agent Memory 规格

LifeWiki 2.0 用两种形式保存记忆：

1. 面向人类阅读和编辑的 Obsidian Markdown。
2. 面向 OpenClaw 等 Agent 检索和调用的结构化 JSON/JSONL 索引。

## 索引目录

```text
.lifewiki/index/
  events.jsonl
  entities.json
  knowledge-capsules.json
  signals.jsonl
  open-loops.json
  agent-memory.jsonl
```

## 推荐读取顺序

外部 Agent 不需要一开始解析整个 Vault。推荐按以下顺序读取：

1. `agent-memory.jsonl`：轻量入口，适合按任务快速召回。
2. `knowledge-capsules.json`：需要完整知识胶囊字段时读取。
3. `open-loops.json`：需要追踪未完成事项时读取。
4. `signals.jsonl`：需要做周期复盘、情绪/压力/风险趋势时读取。
5. `events.jsonl`：需要还原事件时间线时读取。
6. Markdown 文件：只有需要人类可读上下文或完整证据时再读取。

## 检索契约

Agent 应该可以按以下维度检索记忆：

- 任务领域
- 触发短语
- 关联实体
- 时间范围
- 记忆类型
- 置信度和状态

当 Agent 基于 LifeWiki 记忆给出建议时，应该引用 `evidenceBlockIds` 或来源路径，避免把推断当成无来源事实。

## 过滤策略

Agent 读取记忆时应遵守以下默认过滤规则：

- 优先使用 `status = confirmed` 的知识胶囊。
- `candidate` 只能作为弱上下文，建议用“可能”“看起来”“曾经出现过”表达。
- 不使用 `rejected` 作为建议依据。
- `deprecated` 只能作为历史变化参考。
- `confidence < 0.6` 的记忆默认不进入行动建议，除非用户明确要求探索。
- 对用户产生外部行动影响的建议，例如发邮件、排任务、做承诺，应至少引用一条 confirmed 记忆或明确提示“依据较弱”。

## 任务召回示例

当 OpenClaw 要帮助用户写一封客户需求变更邮件时，可以这样召回：

```text
任务：帮用户回复客户临时需求变更。
检索条件：
- kind = knowledge_capsule
- status in ["confirmed", "candidate"]
- appliesTo 包含 "客户沟通" 或 "项目管理"
- triggers 包含 "需求变更"、"范围模糊"、"客户"
优先级：
1. confirmed 高于 candidate
2. confidence 高的优先
3. updatedAt 更新的优先
```

召回后，Agent 可以这样使用：

```text
根据 LifeWiki 已确认记忆，用户倾向于在客户临时变更需求时先要求书面化范围，再决定是否承诺交付。
证据：evidenceBlockIds = ["block_..."]
```

## Agent Memory Record

`agent-memory.jsonl` 用于轻量检索。

```json
{
  "id": "mem_...",
  "kind": "knowledge_capsule",
  "title": "客户临时变更需求时应先书面化再承诺",
  "content": "当客户突然提出需求变更时，先要求对方写清楚具体变更范围，再判断是否承诺交付。",
  "triggers": ["客户提出临时需求变更"],
  "appliesTo": ["项目管理", "客户沟通"],
  "avoid": ["口头承诺"],
  "relatedEntityIds": ["entity_..."],
  "status": "confirmed",
  "confidence": 0.82,
  "evidenceBlockIds": ["block_..."],
  "updatedAt": "2026-04-24T00:00:00.000Z"
}
```

## 状态语义

- `candidate`：由 AI 萃取，但尚未稳定。
- `confirmed`：用户确认过，或因为重复证据足够多而被系统视为可信。
- `rejected`：用户拒绝。
- `deprecated`：已经不再符合用户当前偏好或上下文。

## Agent 使用原则

- 候选记忆可以作为弱上下文使用。
- 已确认记忆可以影响建议和行动方案。
- 已废弃记忆只能作为历史上下文使用。
- Agent 不应在缺少状态和证据的情况下，把推断记忆表述成确定事实。
- Agent 在执行外部副作用动作前，例如发消息、发邮件、改任务，应把用到的 LifeWiki 记忆展示给用户确认。
