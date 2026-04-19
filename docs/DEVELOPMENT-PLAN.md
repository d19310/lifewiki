# 开发计划：日记块编辑器功能

## 概览

| 项目 | 说明 |
|------|------|
| 预估工时 | 7-10 小时 |
| 复杂度 | MEDIUM |
| 影响文件 | 4-5 个核心文件 |

---

## Phase 1: 追加日记模式

### 1.1 状态管理
- [ ] 添加 `isAppendMode: boolean` 状态
- [ ] 添加 `appendModeBlockId: string | null` 状态
- [ ] 添加 `isEditMode: boolean` 状态
- [ ] 添加 `editModeBlockId: string | null` 状态

### 1.2 Block 选中样式
- [ ] 修改 `renderBlock()` CSS：边框高亮 + 浅灰背景
- [ ] 位置：block-editor.ts ~Line 810

### 1.3 输入框追加模式 UI
- [ ] 添加输入框高亮状态样式
- [ ] 左下角文字区域
- [ ] 右下角"追加日记"按钮 + X 按钮
- [ ] 样式位置：addStyles() 方法

### 1.4 取消追加模式
- [ ] 点击 X 按钮 → `cancelAppendMode()`
- [ ] 点击 Block 外部 → 全局点击监听检测
- [ ] 清除 `isAppendMode` 和 `appendModeBlockId`

### 1.5 提交追加
- [ ] 点击"追加日记" → `submitChildBlock()`
- [ ] 复用现有 `appendChildToBlock()` 方法
- [ ] 追加成功后清除追加模式

### 1.6 移除旧代码
- [ ] 删除 `showChildInput()` 方法
- [ ] 删除渲染区的旧子 block 输入 UI

---

## Phase 2: 编辑模式

### 2.1 进入编辑模式
- [ ] 双击事件监听 → `startEditMode(blockId)`
- [ ] 设置 `isEditMode = true`
- [ ] Block 样式：边框高亮 + 浅紫背景

### 2.2 编辑界面
- [ ] 正文转为 `<textarea>`
- [ ] #标签转为 `<input>`
- [ ] 时间戳保持为纯文本（不可编辑）

### 2.3 退出编辑模式
- [ ] 点击 Block 外部 → `exitEditMode()`
- [ ] 按 Enter → 保存并退出
- [ ] 按 Escape → 取消编辑

### 2.4 保存编辑
- [ ] 更新 Block 的 `content` 和 `category`
- [ ] 调用 `saveBlockToFile()` 持久化

---

## Phase 3: 领域系统

### 3.1 类型定义
- [x] 在 `entities/types.ts` 中添加 `Area` 类型
- [x] 在 `Block` 接口中添加 `areas: string[]`

### 3.2 配置扩展
- [x] 在 `settings.ts` 中添加 `areas: string[]` 配置
- [x] 默认值：`['工作', '个人', '学习']`

### 3.3 AI 自动判断
- [x] 在 `analyzer.ts` 中实现领域判断逻辑
- [x] AI 分析后返回 1-2 个领域标签
- [x] 更新日记文件中 Block 的 #标签

### 3.4 实体档案更新
- [x] 在 `Entity` 接口的 `metadata` 中添加 `areas` 字段
- [x] AI 分析时同步更新实体档案的领域

---

## Phase 3.5: 子Block会话继承

### 3.5.1 会话归属判定
- [x] 修改 `session-manager.ts` 的 `getSession()` 方法
- [x] 判断 block 是否有 `parentId`
- [x] 有父ID则使用父Block的会话文件

### 3.5.2 子Block分析上下文构建
- [x] 在 `conversation-flow.ts` 中新增 `buildChildBlockContext()` 方法
- [x] 构建包含父Block内容 + 父会话历史 + 其他子Block内容的上下文

### 3.5.3 AI分析请求修改
- [x] 修改 `startBlockAnalysis()` 支持parentId和siblingBlocks参数
- [x] 将完整上下文作为 content 传给 AI

### 3.5.4 会话历史显示
- [x] 修改 `startAIAnalysis()` 逻辑
- [x] 子Block点击时加载父Block的会话

### 3.5.5 子Block ID存储
- [x] 定义 `ChildBlock` 接口
- [x] 修改 `ParsedBlock.children` 类型从 `string[]` 改为 `ChildBlock[]`
- [x] 修改解析逻辑解析子Block ID
- [x] 修改追加逻辑生成并存储子Block ID

### 3.5.6 子Block点击处理
- [x] 添加子Block点击事件处理
- [x] `selectChildBlock()` 方法：加载父Block会话
- [x] AI面板 `setActiveBlock()` 支持 parentId 参数

---

## Phase 3.6: LangGraph Only 架构（v2.0+）

### 3.6.1 架构简化
- [x] 移除 `useLangGraph` 开关设置
- [x] 移除 `settings.ts` 中的 `useLangGraph` 接口和默认值
- [x] 移除 `main.ts` 中的条件初始化逻辑，始终使用 LangGraphAgent

### 3.6.2 LangGraphAgent 接口增强
- [x] `startBlockAnalysis()` 支持 `parentId` 和 `siblingBlocks` 参数
- [x] `startBlockAnalysis()` 返回 `areas` 数组
- [x] 添加 `parseAreasFromResponse()` 解析 `#标签` 格式
- [x] 添加 `parseAreas()` 验证并规范化领域列表

### 3.6.3 领域标签解析
- [x] 支持 `#工作`、`#个人`、`#学习`、`#其他` 等标签格式
- [x] AI 在回复末尾输出领域标签，如 `好的，今天加油！#个人`
- [x] `block-editor.ts` 自动从 AI 回复中提取 `areas` 并更新 block category

### 3.6.4 SOUL.md 对话策略更新
- [x] 定义"对话策略：全自动连续分析"
- [x] 6阶段执行顺序：人脉 → 项目/任务 → 物品 → 想法 → 知识 → 领域
- [x] 每阶段连续执行，不询问用户
- [x] 发现已归档实体立即 `add_interaction`
- [x] 发现新实体简短确认后继续
- [x] 全部完成后以 `#标签` 格式输出领域

### 3.6.5 相关文件修改
- [x] `src/views/block-editor.ts` - 移除 ConversationFlow 条件分支
- [x] `src/views/ai-analysis-panel.ts` - 移除 ConversationFlow 条件分支
- [x] `src/main.ts` - 移除 `useLangGraph` 条件判断
- [x] `src/settings.ts` - 移除 `useLangGraph` 开关 UI
- [x] `src/ai/langgraph/agent.ts` - 增强接口支持

---

## Phase 4: 测试与修复

### 4.1 功能测试
- [ ] 单击选中 Block → 追加模式正常
- [ ] 点击 X → 取消追加模式
- [ ] 点击 Block 外部 → 取消追加模式
- [ ] 提交子 Block → 追加成功
- [ ] 双击 Block → 编辑模式正常
- [ ] Enter 保存 → 编辑保存成功
- [ ] Escape 取消 → 取消编辑
- [ ] 关闭重开 → 会话历史正常加载
- [ ] AI 分析后 → 领域标签自动更新

### 4.2 子Block会话继承测试
- [ ] 点击子Block → 加载父Block的会话历史
- [ ] 提交子Block分析 → AI收到父Block上下文
- [ ] 父Block会话历史包含所有子Block的对话

### 4.2 边界测试
- [ ] 空内容提交 → 禁止
- [ ] 多余标签（>2）→ 取前2个
- [ ] Block 不存在 → 忽略

---

## 文件清单

| 文件 | 修改内容 |
|------|----------|
| `src/views/block-editor.ts` | 追加/编辑模式核心逻辑、LangGraph Only |
| `src/views/ai-analysis-panel.ts` | LangGraph Only |
| `src/entities/types.ts` | Area 类型、Block 接口更新 |
| `src/settings.ts` | Areas 配置、移除 useLangGraph |
| `src/main.ts` | LangGraph 始终初始化 |
| `src/ai/langgraph/agent.ts` | 唯一 AI 引擎、增强接口支持 |
| `src/ai/langgraph/graph.ts` | 状态机实现 |
| `src/ai/langgraph/adapter.ts` | AIProvider → LangChain 适配器 |
| `src/ai/langgraph/tools/entity-tools.ts` | 实体操作工具 |
| `src/ai/session-manager.ts` | 子Block会话继承逻辑 |
| `src/ai/conversation-flow.ts` | 已废弃（保留备选） |
| `src/ai/agent-config.ts` | SOUL/SKILL 配置加载 |
| `src/styles/block-editor.css` | 样式文件 |

---

## 依赖关系

```
Phase 1 (追加模式)
    ↓
Phase 2 (编辑模式)     Phase 3 (领域系统)
    ↓                        ↓
    └────────────────────────┘
              ↓
    Phase 3.5 (子Block会话继承)
              ↓
        Phase 4 (测试)
```

---

## 预估工时

| Phase | 工时 |
|-------|------|
| Phase 1: 追加模式 | 2-3 小时 |
| Phase 2: 编辑模式 | 1.5-2 小时 |
| Phase 3: 领域系统 | 1.5-2 小时 |
| Phase 3.5: 子Block会话继承 | 1-1.5 小时 |
| Phase 4: 测试修复 | 1-1.5 小时 |
| **总计** | **7-10 小时** |
