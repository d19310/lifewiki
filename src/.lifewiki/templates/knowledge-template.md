## 摘要
{{summary}}

{{#if metadata.url}}
## 链接
{{metadata.url}}
{{/if}}

## 核心内容
{{metadata.content}}

## 相关引用
{{#if relatedEntities}}
{{#each relatedEntities}}
- [[{{this.name}}]]
{{/each}}
{{/if}}
