# LifeWiki

LifeWiki v2.0 是一个 Obsidian 个人记忆插件。它让用户继续用低摩擦的日记 block 记录生活和工作，同时用 AI 把日记里的实体、关系、事实、互动记录和可复用隐形知识沉淀为 Obsidian vault 中的人类可读档案，也沉淀为 Agent 可读的个人记忆索引。

v2.0 的产品重点不是“让用户整理日记”，而是让日记逐渐变成一个能被自己和 AI Agent 使用的个人记忆层。

## 核心能力

- **日记 Block 编辑器**：按天记录，可追加子 block，适合流水账式工作日志和生活日记。
- **AI 分析模式**：对每条日记生成确认卡片，辅助用户归档实体、事实、背景信息、互动记录和关系。
- **实体档案**：自动维护 `People/`、`Projects/`、`Things/`、`Ideas/`、`Knowledge/` 下的 Markdown 档案。
- **双链关系**：在互动记录和实体档案中使用 Obsidian `[[双链]]` 连接人、项目、知识和物品。
- **今日洞察**：只聚焦当天真正值得跟进的开放事项和高价值信号，减少噪音。
- **聊天模式**：通过自然语言让 AI 查询 vault、总结日记、发现关系、创建或更新档案。
- **多 Provider 支持**：支持 OpenAI-compatible 自定义服务商，包括 MiniMax、DeepSeek、OpenAI 兼容网关等。
- **思考模式配置**：Provider 可配置 `thinking` 和 `reasoning_effort`，默认关闭。

## Vault 结构

LifeWiki v2.0 默认使用以下目录：

```text
Vault/
├── Daily/                    # 日记
├── People/                   # 人、人脉、组织联系人
├── Projects/                 # 项目和任务
├── Things/                   # 物品、产品、工具、方案
├── Ideas/                    # 想法、原则、观点、概念
├── Knowledge/                # 文章、文档、资料、知识来源
├── Memory/
│   ├── Capsules/             # 记忆胶囊
│   ├── Patterns/             # 长期模式
│   └── OpenLoops/            # 待跟进事项
└── .lifewiki/
    ├── index/                # Agent 可读索引
    ├── sessions/             # 日记 block 分析会话
    ├── agents/               # Agent 提示词配置
    ├── skills/               # 工具说明
    └── templates/            # 模板
```

## 安装

### 普通用户安装

```bash
curl -fsSL https://github.com/d19310/lifewiki/releases/download/v2.0/install.sh | bash
```

指定 vault 路径：

```bash
curl -fsSL https://github.com/d19310/lifewiki/releases/download/v2.0/install.sh | bash -s -- -v "$HOME/Documents/LifeWiki"
```

安装脚本会：

1. 创建或复用指定 Obsidian vault。
2. 初始化 LifeWiki v2.0 目录结构。
3. 从 GitHub Release 下载插件文件到 `.obsidian/plugins/lifewiki`。
4. 为新 vault 预启用 LifeWiki 插件。

如果 vault 已经有社区插件配置，脚本不会强行改写，请在 Obsidian 中手动启用 LifeWiki。

### 本地开发安装

```bash
npm install
npm run build
cp main.css styles.css
./install.sh -l -v "$HOME/test-lifewiki-vault"
```

## 配置 AI Provider

打开 Obsidian 后进入：

```text
设置 → 第三方插件 → LifeWiki → 选项
```

添加 Provider：

- 名称：例如 `DeepSeek V4`
- 模型：服务商提供的模型名
- Base URL：OpenAI-compatible 地址，例如 `https://api.deepseek.com/v1`
- API Key：服务商密钥
- 思考模式：默认关闭
- Reasoning Effort：默认不发送，可选 `high` / `max`

然后分别为：

- `Diary Agent`
- `Chat Agent`

选择对应 Provider。

## 开发

```bash
npm install
npm run build
npm test
```

发布前建议至少运行：

```bash
npm run build
npx jest src/ai/capture-analyzer.test.ts src/memory/legacy-adapter.test.ts src/memory/index-store.test.ts --runInBand
```

## 发布文件

GitHub Release 需要包含：

- `main.js`
- `manifest.json`
- `styles.css`

当前正式插件 ID 是 `lifewiki`，版本为 `2.0.0`。

## 文档

- [PRD](./PRD.md)
- [LifeWiki 2.0 产品规格](./docs/PRD-2.0.md)
- [Agent Memory Spec](./docs/AGENT-MEMORY-SPEC.md)
- [OpenClaw Integration](./docs/OPENCLAW-INTEGRATION.md)
