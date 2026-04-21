# clip_and_summarize

## 基本信息

- **名称**: clip_and_summarize
- **功能**: 抓取网页内容并生成摘要总结
- **调用时机**: Step 2 实体处理 — 用户提供网页链接时抓取并归档为知识

## 输入参数

```json
{
  "url": "https://example.com/article"
}
```

## 输出格式

```json
{
  "success": true,
  "data": {
    "url": "https://example.com/article",
    "title": "文章标题",
    "content": "文章正文内容...",
    "summary": "文章摘要...",
    "extractedAt": "2026-04-21T12:00:00.000Z"
  }
}
```

## 执行流程

1. 接收网页 URL `url`
2. 发送 HTTP GET 请求获取网页内容
3. 解析 HTML，提取正文内容（去除广告、导航等）
4. 生成简短摘要（使用 AI 或启发式方法）
5. 返回格式化结果（含 title、content、summary）

## 错误处理

- **url 为空**: 返回错误 `url is required`
- **url 格式无效**: 返回错误 `invalid url format`
- **请求超时**: 返回错误 `request timeout: {url}`
- **HTTP 错误**: 返回错误 `http error: {status}` (如 404, 500)
- **抓取失败**: 返回错误 `failed to fetch url: {error}` 并附带日志

## 禁止虚假声明

**绝对禁止**：在没有调用工具获得成功结果之前，在回复中声称"已抓取"、"已归档"。

**正确做法**：必须先调用 clip_and_summarize → 获得成功结果 → 才能在回复中说"已抓取"。
