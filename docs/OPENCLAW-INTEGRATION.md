# OpenClaw 集成说明

本文档定义 OpenClaw 或其他通用 Agent 如何读取 LifeWiki 2.0 记忆，并用于周期复盘、任务辅助和个人上下文召回。

## 1. 集成目标

LifeWiki 2.0 负责从日记中沉淀个人记忆。OpenClaw 负责在需要时读取这些记忆，帮助用户完成更高层的任务：

- 每日/每周/每月复盘。
- 根据用户偏好和原则辅助写邮件、排任务、做计划。
- 识别长期模式、风险和开放循环。
- 在行动前召回相关个人经验。

LifeWiki 不要求 OpenClaw 解析整个 Obsidian Vault。优先读取 `.lifewiki/index/` 中的结构化索引。

## 2. 文件读取入口

推荐入口：

```text
.lifewiki/index/agent-memory.jsonl
```

补充入口：

```text
.lifewiki/index/knowledge-capsules.json
.lifewiki/index/open-loops.json
.lifewiki/index/signals.jsonl
.lifewiki/index/events.jsonl
Memory/Capsules/*.md
```

## 3. 典型读取流程

### 3.1 任务辅助

适用于：写邮件、回复客户、制定计划、拆任务、做沟通建议。

```text
1. 读取 agent-memory.jsonl。
2. 按任务关键词匹配 title/content/triggers/appliesTo。
3. 优先选择 status = confirmed 的 knowledge_capsule。
4. 若只有 candidate，必须在回复中标注为弱依据。
5. 输出建议时引用 evidenceBlockIds。
```

### 3.2 周期复盘

适用于：每日总结、周报、月度回顾。

```text
1. 读取 events.jsonl，按时间窗口过滤。
2. 读取 signals.jsonl，统计压力、精力、风险、关系变化、反复主题。
3. 读取 open-loops.json，筛选 status = open。
4. 读取 knowledge-capsules.json，筛选本周期新增或确认的胶囊。
5. 输出复盘报告，并引用 evidenceBlockIds。
```

### 3.3 开放循环提醒

适用于：提醒用户未完成事项、待澄清边界、未决问题。

```text
1. 读取 open-loops.json。
2. 筛选 status = open。
3. 按 dueAt、updatedAt、confidence 排序。
4. 与最近 events/signals 交叉判断是否仍然相关。
5. 只提醒少量高价值开放循环，避免打扰。
```

## 4. OpenClaw Prompt 模板

### 4.1 任务辅助 Prompt

```text
你正在帮助用户完成一个具体任务。你可以读取 LifeWiki 2.0 的 agent-memory.jsonl 作为用户个人记忆。

使用规则：
- 优先使用 confirmed 记忆。
- candidate 只能作为弱上下文，必须说明不确定。
- rejected 不可作为建议依据。
- deprecated 只能作为历史参考。
- 当建议涉及对外承诺、沟通、发送消息或更改任务时，必须引用使用到的 memory id 和 evidenceBlockIds。

用户任务：
{{task}}

相关 LifeWiki 记忆：
{{retrieved_memories}}

请给出建议或草稿。
```

### 4.2 周期复盘 Prompt

```text
你正在为用户生成 LifeWiki 周期复盘。请基于 LifeWiki 结构化索引，而不是凭空总结。

复盘范围：
{{start_date}} 至 {{end_date}}

输入：
- events: {{events}}
- signals: {{signals}}
- openLoops: {{open_loops}}
- knowledgeCapsules: {{knowledge_capsules}}

输出要求：
1. 本周期发生了什么。
2. 反复出现的主题。
3. 新增或强化的个人经验。
4. 值得注意的压力、风险或关系变化。
5. 仍未关闭的开放循环。
6. 每个重要判断都引用 evidenceBlockIds。
```

## 5. 周期复盘输出格式

建议输出到：

```text
Memory/Reviews/YYYY-MM-DD-weekly-review.md
Memory/Reviews/YYYY-MM-monthly-review.md
```

Markdown 模板：

```markdown
# LifeWiki 周期复盘：{{date_range}}

## 摘要

{{summary}}

## 反复出现的主题

- {{theme}}  
  证据：{{evidenceBlockIds}}

## 新增经验

- {{knowledge_capsule_title}}  
  状态：{{status}}  
  证据：{{evidenceBlockIds}}

## 压力 / 风险 / 精力信号

- {{signal_summary}}  
  证据：{{evidenceBlockIds}}

## 开放循环

- {{open_loop_title}}  
  下一步：{{next_step}}  
  证据：{{evidenceBlockIds}}

## 建议

{{recommendations}}
```

## 6. 安全边界

- OpenClaw 不应自动修改 LifeWiki 记忆状态，除非用户明确授权。
- OpenClaw 可以生成复盘笔记，但不要自动删除或覆盖原始日记。
- 对外沟通、转账、下单、发送邮件等副作用动作，必须先向用户展示引用的 LifeWiki 记忆和待执行内容。
- LifeWiki 记忆是个人上下文，不是绝对事实。Agent 应保留不确定性表达。

## 7. 最小可用集成

第一版只需要做到：

1. 读取 `agent-memory.jsonl`。
2. 过滤 confirmed knowledge capsules。
3. 根据用户任务关键词召回相关记忆。
4. 在建议中引用 `id` 和 `evidenceBlockIds`。
5. 生成一份周复盘 Markdown，但不自动修改原始记忆。
