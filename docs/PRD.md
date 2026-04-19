# LifeWiki 日记块编辑器 PRD

## 1. 概述

LifeWiki 是一款 AI 增强的日记工具，深度集成 Obsidian，通过实体提取和领域分析帮助用户构建个人知识网络。本文档定义日记块编辑器的核心功能需求。

---

## 2. 核心概念

### 2.1 Block（日记块）

日记文件中的每个 `### HH:mm [source] #category <!-- blockId -->` 构成一个 Block。

- **唯一 ID**：以 HTML 注释形式存储在日记文件中
- **结构**：
  ```
  ### HH:mm [source] #category <!-- blockId -->
  正文内容
  - HH:mm 子Block内容1 <!-- childBlockId -->
  - HH:mm 子Block内容2 <!-- childBlockId -->
  ```

#### 2.1.1 子Block与会话继承

子Block（Child Block）是指追加到父Block下方的缩进内容。

- **独立 ID**：子Block也有自己的 ID（`<!-- childBlockId -->`）
- **无独立会话**：子Block 不创建独立的 AI 会话文件
- **继承父Block会话**：子Block 的所有 AI 对话都挂在父Block的会话历史下
- **共享上下文**：分析子Block时，AI 会收到：
  1. 父Block的原始内容
  2. 父Block的会话历史
  3. 其他所有子Block的内容（作为上下文背景）
- **会话归属**：点击任意子Block调出的历史会话实际是父Block的会话

### 2.2 Areas（领域）

领域标签标识日记所属的知识/生活领域。

- **预设领域**：`#工作`、`#个人`、`#学习`
- **多标签支持**：每条日记最多 2 个领域标签
- **用户扩展**：可在 agent 配置文件中增加领域标签
- **AI 自动判断**：分析后自动更新，无需用户确认

### 2.3 会话历史

每个 Block 与 AI 对话的历史会话保存在 `.lifewiki/sessions/{blockId}.json`。

### 2.4 AI 架构

LifeWiki 采用 **LangGraph Agent** 作为唯一的 AI 分析引擎。

#### 2.4.1 架构演进
- **旧架构**：存在 `ConversationFlow` 和 `LangGraphAgent` 两套并行方案，通过 `useLangGraph` 开关切换
- **新架构**（v2.0+）：仅使用 `LangGraphAgent`，移除所有条件分支

#### 2.4.2 LangGraphAgent 职责
- 管理 Block 分析状态机
- 处理人脉、项目、物品、想法、知识 5 大类实体的识别
- 自主判断日记所属领域（工作/个人/学习/其他）
- 通过 `EntityTools` 调用底层技能（list_entities、create_entity、add_interaction 等）
- 解析 AI 回复中的 `#标签` 格式，提取领域信息

#### 2.4.3 领域标签格式
AI 在分析完成后，会在回复末尾包含领域标签：
```
好的，这条日记只记录了运动。今天加油！#个人
```

系统会自动解析 `#` 后缀的标签，提取领域信息并更新日记。

#### 2.4.4 全自动连续分析
Agent 按照 SOUL.md 中规定的"对话策略：全自动连续分析"执行：
1. 人脉 → 2. 项目/任务 → 3. 物品 → 4. 想法 → 5. 知识 → 6. 领域
- 每个阶段连续执行，不询问用户
- 发现已归档实体立即调用 `add_interaction` 更新
- 发现新实体简短确认后继续下一阶段
- 全部完成后以自然语言回复并输出领域标签

---

## 3. 功能需求

### 3.1 追加日记模式（Append Mode）

#### 3.1.1 触发条件
- **单击**选中父 Block

#### 3.1.2 视觉表现
| 元素 | 状态 |
|------|------|
| Block 边框 | 高亮（紫色/品牌色） |
| Block 背景 | 浅灰色（`--surface-container-high`） |
| 日记输入框边框 | 高亮 |
| 输入框左下角 | 文字：`"将在[HH:mm]该条日记下追加记录"` |
| 输入框右下角 | "追加日记"按钮（高亮）+ X 取消按钮 |

#### 3.1.3 交互行为
| 操作 | 结果 |
|------|------|
| 点击 X 按钮 | 取消追加模式，恢复正常 |
| 点击 Block 外部 | 取消追加模式，恢复正常 |
| 点击"追加日记" | 提交子 Block，清除追加模式 |
| 按 Enter | 不提交，直接换行 |

#### 3.1.4 子Block的AI分析上下文

提交子Block后，AI分析会携带以下上下文：

```
【父Block内容】
父Block的原始正文内容

【会话历史】
父Block与AI的对话历史（完整）

【其他子Block】
- 子Block 1的内容
- 子Block 2的内容
...

【当前子Block】
刚刚提交的子Block内容（待分析）
```

**注意**：AI分析子Block时，使用的是父Block的会话文件，而非新建会话。

---

### 3.2 编辑模式（Edit Mode）

#### 3.2.1 触发条件
- **双击** Block

#### 3.2.2 视觉表现
| 元素 | 状态 |
|------|------|
| Block 边框 | 高亮 |
| Block 背景 | 浅紫色 |
| 编辑字段 | 正文（textarea）、#标签（input） |
| 时间戳 | 不可编辑（显示为主文本） |

#### 3.2.3 交互行为
| 操作 | 结果 |
|------|------|
| 双击 Block 外部 | 退出编辑模式 |
| 按 Enter | 退出编辑模式 |
| 按 Escape | 取消编辑，恢复原内容 |

#### 3.2.4 可编辑字段
| 字段 | 可编辑 |
|------|--------|
| 正文内容 | 是 |
| #标签 | 是（支持1-2个） |
| 时间戳 | 否 |
| 来源 source | 否 |

#### 3.2.5 数据变更
- 编辑完成后更新 Block 的 `content` 和 `category`
- 变更持久化到日记文件

---

### 3.3 领域系统（Areas）

#### 3.3.1 预设领域
```
#工作 → 工作相关日记
#个人 → 个人生活日记
#学习 → 学习提升日记
```

#### 3.3.2 用户扩展
在 agent 配置文件中定义：
```yaml
areas:
  - 工作
  - 个人
  - 学习
  - 健康      # 用户新增
  - 财务      # 用户新增
```

#### 3.3.3 AI 自动判断
- AI 分析日记内容后，自主决定 1-2 个合适的领域标签
- **无需用户确认**，直接更新到日记文件

#### 3.3.4 实体档案关联
- 所有实体档案的 `metadata` 中增加 `areas` 字段
- 示例：
  ```json
  {
    "id": "entity-uuid",
    "type": "person",
    "title": "张三",
    "metadata": {
      "areas": ["工作", "学习"]
    }
  }
  ```

---

## 4. 技术实现

### 4.1 Block ID 存储

日记文件中的 Block ID 以 HTML 注释嵌入：
```
### 09:00 [Lifewiki] #工作 <!-- 8a7b6c5d-4e3f-... -->
```

### 4.2 会话历史存储

会话文件路径：`.lifewiki/sessions/{blockId}.json`

**只有父Block拥有会话文件**，子Block不独立存储会话。

结构：
```json
{
  "blockId": "8a7b6c5d-...",
  "parentBlockId": null,
  "content": "父Block原始内容",
  "messages": [...],
  "analysisResult": {...},
  "createdAt": "...",
  "updatedAt": "..."
}
```

**父子关联**：
- 父Block的 `parentBlockId` 为 `null`
- 子Block虽然有 `blockId` 用于文件内标识，但不生成独立会话文件
- 所有子Block的AI对话都追加到父Block的会话中

### 4.3 子Block点击行为

当用户点击子Block时：
1. 查找子Block的父Block（通过父Block ID关联）
2. 加载父Block的会话历史文件
3. 在AI面板中显示父Block的完整会话历史

**会话历史来源判定**：
```
if (block.parentId === null) {
  // 是父Block，使用自己的blockId查会话
  sessionFile = `.lifewiki/sessions/${block.id}.json`
} else {
  // 是子Block，使用父Block的ID查会话
  sessionFile = `.lifewiki/sessions/${block.parentId}.json`
}
```

### 4.4 文件组织

```
src/
├── views/
│   └── block-editor.ts       # 日记编辑器视图
├── entities/
│   └── types.ts              # 类型定义（Block, ParsedBlock, Area）
├── ai/
│   ├── provider/             # AI Provider 接口
│   │   ├── index.ts
│   │   ├── dashscope.ts      # 阿里百炼 provider
│   │   ├── openai-provider.ts
│   │   ├── claude-provider.ts
│   │   ├── ollama.ts
│   │   └── minimax.ts
│   ├── langgraph/            # LangGraph Agent（唯一 AI 引擎）
│   │   ├── agent.ts         # Agent 入口
│   │   ├── graph.ts         # 状态机实现
│   │   ├── adapter.ts       # AIProvider → LangChain 适配器
│   │   ├── tools/           # 实体操作工具
│   │   │   └── entity-tools.ts
│   │   └── types.ts
│   ├── conversation-flow.ts  # 已废弃（v2.0+）
│   ├── agent-config.ts      # SOUL/SKILL 配置加载
│   └── session-manager.ts    # 会话管理
├── entities/
│   └── manager.ts          # 实体管理器
├── settings.ts              # 设置面板
└── main.ts                  # 插件入口
```

**注意**：`conversation-flow.ts` 在 v2.0+ 已废弃，仅保留以备回退。

---

## 5. UI/UX 规格

### 5.1 颜色规范

| 用途 | 颜色 |
|------|------|
| 品牌色 | `#5c28b8` |
| 追加模式背景 | `--surface-container-high` (`#e8e8e8`) |
| 编辑模式背景 | 浅紫色（`#eadcff` 或自定义） |
| 高亮边框 | 品牌色 + 2px |
| 输入框高亮边框 | 品牌色 + 聚焦阴影 |

### 5.2 交互规格

| 交互 | 反馈延迟 |
|------|----------|
| 单击选中 | 即时 |
| 双击编辑 | 即时 |
| 追加提交 | < 100ms |
| 编辑保存 | < 100ms |

---

## 6. 边缘情况

| 场景 | 处理 |
|------|------|
| 空内容提交 | 禁止提交 |
| 多余标签（>2） | 取前2个 |
| 无效标签 | 忽略，使用默认 |
| Block 不存在 | 忽略操作 |
| 会话加载失败 | 降级：创建空会话 |

---

## 7. 未来扩展

- [ ] 支持拖拽调整 Block 顺序
- [ ] 支持 Block 之间移动
- [ ] 支持 Block 合并/拆分
- [ ] 领域标签自动补全
- [ ] 多语言支持
