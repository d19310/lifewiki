# LifeWiki

**日记是 AI 时代人生最大的复利！**

LifeWiki 是一个 Obsidian 插件，将你的日记从简单的文字记录升级为 AI 驱动的个人知识管理和人生复利系统。

## 核心功能

### 1. AI 日记分析
- 自动分析日记内容，提取人物、项目、想法、事物等实体
- 智能标签归类，构建你的个人知识图谱
- 支持多 AI 提供者：Claude、DashScope、Ollama 等

### 2. Web 剪藏
- 一键剪藏网页内容为 Markdown
- 智能识别微信文章并提取正文
- 自动归类到对应文件夹

### 3. AI 对话助手
- 在 Obsidian 内直接与 AI 对话
- 基于你的日记和笔记上下文
- 辅助写作、总结、思考

### 4. 实体管理
- 自动追踪日记中的人物、项目、想法
- 展示实体之间的关系
- 发现知识盲区

## 系统要求

- macOS
- Obsidian 1.5.0+
- Node.js（用于构建）

## 安装

### 一键安装（推荐）

```bash
git clone https://github.com/d19310/lifewiki.git
cd lifewiki
bash install.sh
```

安装脚本会自动：
1. 检查并安装 Homebrew（如需要）
2. 安装/升级 Obsidian（如需要）
3. 安装 Node.js（如需要）
4. 创建 Vault 和目录结构
5. 安装 LifeWiki 插件

### 手动安装

1. 克隆仓库：
   ```bash
   git clone https://github.com/d19310/lifewiki.git
   cd lifewiki
   ```

2. 安装依赖：
   ```bash
   npm install
   ```

3. 构建插件：
   ```bash
   npm run build
   ```

4. 复制到 Obsidian 插件目录：
   ```bash
   cp main.js main.css manifest.json ~/Library/Application\ Support/obsidian/plugins/lifewiki/
   ```

5. 在 Obsidian 中启用插件：`设置 → 社区插件 → 启用 LifeWiki`

## 使用

1. 打开 Obsidian，选择 LifeWiki Vault
2. 在左侧边栏找到 LifeWiki 面板
3. 开始写日记，AI 会自动分析
4. 使用 AI 助手辅助写作和思考

## 项目结构

```
lifewiki/
├── src/
│   ├── ai/           # AI 相关功能
│   ├── entities/     # 实体提取
│   ├── views/        # Obsidian 视图
│   ├── vault/        # 笔记管理
│   ├── utils/        # 工具函数
│   └── .lifewiki/
│       └── templates/ # 内置模板
├── install.sh        # 安装脚本
└── manifest.json     # 插件配置
```

## Vault 目录结构

插件安装后，Vault 目录结构如下：

```
用户 Vault/
│
├── 📁 .obsidian/
│   └── 📁 plugins/
│       └── 📁 lifewiki/              # 插件代码
│
├── 📁 .lifewiki/                     # LifeWiki 数据目录
│   ├── 📁 agents/                    # AI Agent 配置
│   │   └── 📁 chat/                  # 聊天 Agent
│   │       └── DIARY_REVIEW_SKILL.md  # 日记复盘 Skill
│   │
│   ├── 📁 sessions/                 # AI 会话历史
│   │   └── {blockId}.json
│   │
│   └── 📁 templates/                 # 内置模板
│       ├── journal-template.md       # 日记模板
│       ├── person-template.md        # 人脉模板
│       ├── project-template.md        # 项目模板
│       ├── task-template.md          # 任务模板
│       ├── thing-template.md         # 物品模板
│       ├── idea-template.md          # 想法模板
│       └── knowledge-template.md     # 知识模板
│
├── 📁 templates/                     # 用户自定义模板（可选）
│   └── journal-template.md           # 存在则覆盖内置模板
│
├── 📁 Daily/                        # 日记文件
│   └── 2026-04-19.md
│
├── 📁 People/                        # 人脉实体
├── 📁 Projects/                      # 项目实体
├── 📁 Things/                        # 物品实体
├── 📁 Ideas/                         # 想法实体
└── 📁 Knowledge/                     # 知识实体
```

**说明：**
- `.lifewiki/` 目录包含所有 LifeWiki 数据，随 Vault 备份
- `templates/` 目录可放置同名模板文件覆盖内置版本
- 插件升级不影响 `.lifewiki/` 中的数据

## 技术栈

- TypeScript
- Obsidian API
- LangChain.js
- Turndown（HTML 转 Markdown）
- jsdom

## License

MIT
