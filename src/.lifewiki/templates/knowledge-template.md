## 摘要
{{summary}}

## 基本信息
{{#if metadata.source_type}}- **来源类型**: {{metadata.source_type}}{{/if}}
{{#if metadata.topic}}- **主题**: {{metadata.topic}}{{/if}}
{{#if metadata.author}}- **作者**: {{metadata.author}}{{/if}}
{{#if metadata.published_at}}- **发布时间**: {{metadata.published_at}}{{/if}}
{{#if metadata.accessed_date}}- **访问时间**: {{metadata.accessed_date}}{{/if}}

{{#if metadata.url}}
## 链接
{{metadata.url}}
{{/if}}

{{#if metadata.source_path}}
## 原文路径
{{metadata.source_path}}
{{/if}}

## 核心内容
{{summary}}

## 关联实体
{{#if relatedEntityLinks}}
{{relatedEntityLinks}}
{{else}}
暂无关联实体
{{/if}}

## 互动记录
{{#if interactions}}
{{#each interactions}}
- {{timestamp}} | {{type}} | {{content}}
{{/each}}
{{else}}
暂无互动记录
{{/if}}
