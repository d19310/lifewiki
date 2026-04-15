# LifeWiki AI Proxy - 部署指南

## 方案概述

Cloudflare Workers 代理为 Obsidian 插件提供安全的 AI API 转发能力，解决浏览器的 CORS 限制问题。

```
Obsidian 插件 → Cloudflare Worker (全球边缘) → AI API (DashScope/OpenAI/Anthropic)
```

## 优势

- **全球低延迟** - 边缘节点遍布全球
- **无需服务器** - Serverless，按请求计费
- **免费额度大** - 每月 100,000 请求
- **安全** - API Key 存储在 Worker secrets，不暴露给前端

## 部署步骤

### 1. 前置要求

- Cloudflare 账号（免费）
- Node.js 环境
- AI API Key（DashScope/OpenAI/Anthropic）

### 2. 安装 Wrangler CLI

```bash
npm install -g wrangler
```

### 3. 登录 Cloudflare

```bash
wrangler login
```

### 4. 配置 API Key

```bash
# 进入 Worker 目录
cd cloudflare-worker

# 设置你的 API Key (DashScope 为例)
wrangler secret put API_KEY
# 输入你的 DashScope API Key

# 可选：设置默认 provider
wrangler secret put API_PROVIDER
# 输入: dashscope, openai, 或 anthropic
```

### 5. 部署

```bash
wrangler deploy
```

部署成功后会返回 Worker URL，例如：
```
https://lifewiki-proxy.your-account.workers.dev
```

### 6. 自定义域名（可选）

如果你有自己的域名：

```bash
wrangler route create --zone yourdomain.com --pattern api.yourdomain.com
```

## 插件配置

在 Obsidian LifeWiki 插件设置中：

1. **API Provider**: Custom
2. **Base URL**: 你的 Worker URL (例如 `https://lifewiki-proxy.your-account.workers.dev`)
3. **Model**: 根据你的需求设置（DashScope 默认 `qwen-plus`）
4. **API Key**: 可以留空（因为已在 Worker 端配置）

## 成本估算

- **Cloudflare Workers 免费额度**: 每月 100,000 请求
- **超出部分**: $5/百万请求
- **带宽**: 免费

对于个人用户，每月 100,000 请求完全足够。

## 支持的 API

| Provider | API Key 获取 |
|----------|-------------|
| DashScope (阿里百炼) | https://dashscope.console.aliyun.com/ |
| OpenAI | https://platform.openai.com/api-keys |
| Anthropic | https://console.anthropic.com/settings/keys |

## 安全说明

1. API Key 只存储在 Cloudflare Workers secrets 中
2. 前端只发送 messages，不包含敏感信息
3. Worker 验证 Origin，只允许 Obsidian 客户端
4. 建议启用 Cloudflare WAF 防护
