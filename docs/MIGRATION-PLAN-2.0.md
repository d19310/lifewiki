# LifeWiki 2.0 迁移计划

## Phase 0：项目拆分

- [x] 创建独立的 `~/lifewiki2.0` 目录。
- [x] 复制 LifeWiki 1.x 源码作为迁移基线。
- [x] 开发期曾使用 `lifewiki2` 与 1.x 并存；正式 v2.0 发布时插件身份改回 `lifewiki`。
- [x] 新增 LifeWiki 2.0 PRD 和记忆模型类型。

## Phase 1：记忆模型基础

- [x] 新增 `src/memory/types.ts`。
- [x] 新增记忆索引读写服务 `src/memory/index-store.ts`。
- [x] 新增记忆索引读取方法，供右侧面板和外部 Agent 复用。
- [x] 新增 events、signals、agent memory 的 JSONL 写入能力。
- [x] 新增 knowledge capsules、open loops 的 JSON 写入/合并能力。
- [x] 新增知识胶囊 Markdown 渲染器。
- [x] 确认知识胶囊时写入 `Memory/Capsules/`。
- [x] 新增记忆序列化和稳定 ID 测试。

## Phase 2：Capture Analyzer 采集分析器

- [x] 将插件内 block 分析主链路替换为 `BlockMemoryAnalysis`。
- [x] 新增轻量 `CaptureAnalyzer`，用 `provider.chat + Zod schema` 输出结构化结果。
- [x] 生成“记忆回声”作为主要用户可见反馈。
- [x] 萃取候选事件、知识胶囊、信号和开放循环。
- [x] 保留已知实体互动记录的自动后台更新。
- [x] 避免为了低风险候选记忆打断用户。
- [x] 让 `BlockSession`、`SessionManager` 和右侧 AI 面板原生保存并渲染 `BlockMemoryAnalysis`。
- [x] 将 `BlockMemoryAnalysis -> AnalysisResult` 的旧兼容转换集中到 `src/memory/legacy-adapter.ts`，旧 provider、历史测试和实体工具仅作为兼容层保留。

## Phase 3：候选记忆 UX

- [x] 在右侧面板增加“今日候选记忆”区域。
- [x] 为知识胶囊增加确认/拒绝控制。
- [x] 按重复触发条件或标题聚合候选记忆。
- [x] 增加候选记忆来源 block 的证据预览。
- [x] 增加从证据预览点击跳转到来源 block。

## Phase 4：Agent 可读记忆层

- [x] 写入 `.lifewiki/index/events.jsonl`。
- [x] 写入 `.lifewiki/index/knowledge-capsules.json`。
- [x] 写入 `.lifewiki/index/signals.jsonl`。
- [x] 写入 `.lifewiki/index/open-loops.json`。
- [x] 写入 `.lifewiki/index/agent-memory.jsonl`。
- [x] 补充 OpenClaw 读取契约文档和示例。

## Phase 5：OpenClaw 周期复盘集成

- [ ] 定义每周复盘输入包。
- [ ] 定义周期洞察笔记的输出格式。
- [ ] 增加供 OpenClaw 使用的命令或索引导出入口。
- [ ] 明确 LifeWiki 负责记忆底座，不负责全部复盘智能。

## 第一阶段非目标

- 不重做整个前端。
- 不强迫所有实体都变成已确认 Wiki 页面。
- 不把 function-calling 链路作为单条日记分析的必要条件。
- 不要求所有 AI 模型都支持原生工具调用。
