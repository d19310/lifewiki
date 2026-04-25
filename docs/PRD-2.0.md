# LifeWiki 2.0 产品规格文档

## 1. 产品定位

LifeWiki 2.0 是一个基于 Obsidian 的个人记忆系统。它通过 AI 从日常日记 block 中萃取事件、实体、隐形知识、偏好、原则和长期模式，并同时沉淀为人类可读的 Wiki 笔记和 Agent 可读的记忆索引。

日记是采集入口。真正的产品是一个会随着用户持续书写而变得越来越有用的个人记忆层。

## 2. 从 1.x 到 2.0 的产品转向

LifeWiki 1.x 是实体优先：

```text
日记 block -> 检测实体 -> 创建/更新 Wiki 页面 -> 建立实体关系 -> 总结
```

LifeWiki 2.0 是隐形知识优先：

```text
日记 block -> 理解事件 -> 萃取可复用知识 -> 锚定到实体 -> 存入候选记忆 -> 服务未来 Agent
```

实体仍然重要，但实体不再是主要价值本身，而是可复用记忆的锚点。

## 3. 核心价值

- **低摩擦记录**：用户继续自然地写流水账，不需要提前把生活结构化。
- **隐形知识萃取**：AI 从日常事件中识别经验、原则、偏好、约束、流程、决策、开放问题和反复模式。
- **渐进式记忆整理**：低置信度记忆先作为候选保存，等出现重复证据或用户确认后再提升为稳定记忆。
- **Agent 可读上下文**：OpenClaw、Chat Agent 和未来的通用 Agent 可以在行动前检索相关记忆。
- **外部 Agent 周期复盘**：LifeWiki 负责提供干净的记忆底座，让其他 Agent 做每日、每周、每月洞察。

## 4. 目标用户

- 已经使用 Obsidian 写笔记、日记或工作日志的用户。
- 希望把日常工作经验沉淀成可复用判断的知识工作者。
- 正在尝试通用 AI Agent 和个人记忆系统的用户。
- 希望 AI 系统在不需要大量手动配置的情况下理解自己偏好、约束和工作方式的人。

## 5. 核心对象

### 5.1 事件 Event

事件表示一个或多个日记 block 中发生的事情。

示例：

- “和张三讨论了华为项目范围。”
- “因为项目边界不清晰，晚上没有推进方案。”
- “读了一篇文章，改变了用户对 local-first 软件的判断。”

### 5.2 实体 Entity

实体是记忆锚点：

- person：人
- project：项目
- task：任务
- thing：物品/产品/工具
- idea：想法
- knowledge：文章、文档、资料、链接等知识来源

实体不应该打断用户写日记。新实体默认先进入候选状态，除非用户明确进入整理模式。

### 5.3 知识胶囊 Knowledge Capsule

知识胶囊是从事件中萃取出来的可复用隐形知识。

类型：

- `lesson`：经验教训，尤其是踩坑或需要避免的做法。
- `principle`：个人原则或判断准则。
- `preference`：用户偏好或偏好的工作方式。
- `workflow`：可重复执行的流程。
- `decision`：决策及其理由。
- `pattern`：反复出现的行为、情境或关系模式。
- `constraint`：硬性或软性约束。
- `open_question`：值得回头看的未解问题。

示例：

```yaml
type: lesson
title: 客户临时变更需求时应先书面化再承诺
content: 当客户突然提出需求变更时，先要求对方写清楚具体变更范围，再判断是否承诺交付。
triggers:
  - 客户提出临时需求变更
  - 项目范围开始模糊
applies_to:
  - 项目管理
  - 客户沟通
avoid:
  - 口头承诺
  - 把模糊需求直接转给开发
related_entities:
  - 华为项目
evidence_blocks:
  - Daily/2026-04-24.md#block-xxx
status: candidate
confidence: 0.78
```

### 5.4 信号 Signal

信号记录那些短期看似轻微、长期可能很重要的状态：

- emotion：情绪
- energy：精力
- stress：压力
- attention：注意力
- risk：风险
- relationship_shift：关系变化
- recurring_theme：反复主题

信号应该保持轻量，用于之后的周期复盘。

### 5.5 开放循环 Open Loop

开放循环表示尚未关闭的事项：

- follow_up：需要跟进
- unanswered_question：未回答的问题
- pending_decision：待决策
- commitment：承诺
- unclear_boundary：边界不清
- blocked_task：被阻塞的任务

开放循环可以在未来由 Chat Agent 或 OpenClaw 重新提醒。

## 6. 用户体验

### 6.1 单条日记分析

用户写下一条 block 后，AI 应该给出一条简短、自然的“记忆回声”，指出这条记录里最有价值的含义。

不理想：

```text
检测到张三和华为项目。是否创建实体？
```

更理想：

```text
这条值得沉淀成一条项目管理经验：当范围开始模糊时，先要求对方把变更写清楚，再决定是否承诺。我先把它放进候选记忆。#工作 #项目管理
```

### 6.2 确认原则

系统不应该把写日记变成数据录入。

可以自动执行：

- 为已知实体追加互动记录。
- 保存候选事件。
- 保存候选信号。
- 保存候选知识胶囊。
- 更新 block 标签。

需要确认：

- 将候选记忆提升为确认记忆。
- 创建重要的新实体页面。
- 合并实体。
- 覆盖已有事实 metadata。
- 将某条偏好或原则标记为稳定。

### 6.3 今日视图

右侧面板应该逐步从 AI 聊天面板演化为“今日记忆驾驶舱”：

- 今日事件
- 候选记忆
- 开放循环
- 今日触达的已知实体
- 值得追踪的信号

### 6.4 周期复盘

OpenClaw 或其他通用 Agent 可以读取 LifeWiki 索引并生成：

- 每日总结
- 每周模式回顾
- 每月个人操作手册更新
- 未关闭开放循环提醒
- 关系和项目变化报告

LifeWiki 应该准备干净的数据底座，但不需要自己承担全部复盘智能。

## 7. 架构

### 7.1 三类智能角色

- **Capture Analyzer 采集分析器**：快速、稳定地分析每条 block，输出结构化结果，不依赖复杂工具链。
- **Memory Curator 记忆整理器**：后台或用户触发，负责提升、合并、修正候选记忆。
- **Reflection Agent 复盘 Agent**：负责周期性回顾，可委托给 OpenClaw。

### 7.2 存储结构

人类可读文件：

```text
Daily/
People/
Projects/
Things/
Ideas/
Knowledge/
Memory/
  Capsules/
  Patterns/
  OpenLoops/
```

Agent 可读索引：

```text
.lifewiki/index/
  events.jsonl
  entities.json
  knowledge-capsules.json
  signals.jsonl
  open-loops.json
  agent-memory.jsonl
```

## 8. MVP 范围

LifeWiki 2.0 MVP 应该保留现有 block 编辑器和 AI 面板，然后把“实体优先分析”替换为：

1. 结构化 block 分析结果。
2. 记忆回声。
3. 候选知识胶囊萃取。
4. 信号和开放循环萃取。
5. 已知实体互动记录自动更新。
6. Agent 可读 JSONL 索引。

第一阶段不要从复杂多轮确认开始。候选记忆可以之后通过批量整理提升。

## 9. 成功标准

当用户在未来一次 Agent 交互中能说出下面这句话，LifeWiki 2.0 就是成功的：

> 这个 Agent 之所以帮得更好，是因为它知道我之前随手写在日记里的东西。

短期指标：

- 用户写日记时不会被过多确认打断。
- 每天至少产生一条有用的记忆回声或候选记忆。
- 每周复盘可以引用 evidence block，并发现有意义的重复模式。
- OpenClaw 不需要解析整个 Vault，就能检索 LifeWiki 记忆。
