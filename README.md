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
│   └── utils/        # 工具函数
├── install.sh        # 安装脚本
└── manifest.json     # 插件配置
```

## 技术栈

- TypeScript
- Obsidian API
- LangChain.js
- Turndown（HTML 转 Markdown）
- jsdom

## License

MIT
