## 基本信息
{{#if metadata.brand}}- **品牌**: {{metadata.brand}}{{/if}}
{{#if metadata.model}}- **型号**: {{metadata.model}}{{/if}}
{{#if metadata.price}}- **价格**: {{metadata.price}}{{/if}}
{{#if metadata.purchase_channel}}- **购买渠道**: {{metadata.purchase_channel}}{{/if}}

{{#if metadata.why_interesting}}
## 为什么关注
{{metadata.why_interesting}}
{{/if}}

## 关联实体

## 使用记录
{{#if interactions}}
{{#each interactions}}
- {{timestamp}}: {{content}}
{{/each}}
{{else}}
暂无相关记录
{{/if}}

## 备注
