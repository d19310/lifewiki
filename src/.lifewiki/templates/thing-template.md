## 基本信息
{{#if metadata.thing_kind}}- **类型**: {{metadata.thing_kind}}{{/if}}
{{#if metadata.brand}}- **品牌**: {{metadata.brand}}{{/if}}
{{#if metadata.model}}- **型号**: {{metadata.model}}{{/if}}
{{#if metadata.vendor}}- **供应商**: {{metadata.vendor}}{{/if}}
{{#if metadata.spec}}- **规格**: {{metadata.spec}}{{/if}}
{{#if metadata.price}}- **价格**: {{metadata.price}}{{/if}}

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
暂无相关记录
{{/if}}

## 备注
