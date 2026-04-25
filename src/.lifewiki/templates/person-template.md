## 基本信息

{{#if metadata.company}}- **所属公司**: {{metadata.company}}{{/if}}
{{#if metadata.department}}- **部门**: {{metadata.department}}{{/if}}
{{#if metadata.position}}- **职位**: {{metadata.position}}{{/if}}
{{#if metadata.relationship_to_user}}- **与我关系**: {{metadata.relationship_to_user}}{{/if}}
{{#if metadata.person_kind}}- **类型**: {{metadata.person_kind}}{{/if}}
{{#if metadata.contact_channel}}- **联系方式**: {{metadata.contact_channel}}{{/if}}

## 背景
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

## 跟进事项
- [ ] 补充关键背景
