## 基本信息
{{#if metadata.idea_kind}}- **类型**: {{metadata.idea_kind}}{{/if}}
{{#if metadata.stage}}- **阶段**: {{metadata.stage}}{{/if}}
{{#if metadata.impact}}- **影响**: {{metadata.impact}}{{/if}}
{{#if metadata.applies_to}}- **适用场景**: {{metadata.applies_to}}{{/if}}

## 想法概述
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
暂无相关记录
{{/if}}

## 备注
