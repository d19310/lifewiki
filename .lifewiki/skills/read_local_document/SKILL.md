# read_local_document

## 基本信息

- **名称**: read_local_document
- **功能**: 读取本地文件系统中的 Markdown 文档内容
- **调用时机**: Step 2 实体处理 — 用户提供本地文件路径时读取并创建实体

## 输入参数

```json
{
  "path": "/Users/xxx/Documents/项目笔记.md"
}
```

## 输出格式

```json
{
  "success": true,
  "data": {
    "path": "/Users/xxx/Documents/项目笔记.md",
    "title": "项目笔记",
    "content": "文档正文内容...",
    "frontmatter": { "tags": ["项目"] },
    "extractedAt": "2026-04-21T12:00:00.000Z"
  }
}
```

## 执行流程

1. 接收文件路径 `path`
2. 展开 `~` 为用户主目录路径
3. 使用 Node.js fs 模块读取文件
4. 解析 frontmatter（如有）
5. 提取标题（从 filename 或 frontmatter）
6. 返回格式化结果

## 支持的路径格式

| 格式 | 示例 |
|------|------|
| 绝对路径 | `/Users/xxx/Documents/项目笔记.md` |
| 用户主目录 | `~/Documents/项目笔记.md` |

## 错误处理

- **path 为空**: 返回错误 `file path is required`
- **文件不存在**: 返回错误 `file not found: {path}`
- **文件非 Markdown**: 返回错误 `file is not markdown: {path}`
- **读取失败**: 返回错误 `failed to read file: {error}` 并附带日志

## 禁止虚假声明

**绝对禁止**：在没有调用工具获得成功结果之前，在回复中声称"已读取"。

**正确做法**：必须先调用 read_local_document → 获得成功结果 → 才能在回复中说"已读取"。
