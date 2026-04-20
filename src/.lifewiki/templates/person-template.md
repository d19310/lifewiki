## 基本信息

{{#if metadata.company}}- **公司**: {{metadata.company}}{{/if}}
{{#if metadata.position}}- **职位**: {{metadata.position}}{{/if}}
{{#if metadata.department}}- **部门**: {{metadata.department}}{{/if}}
{{#if metadata.contact_channel}}- **联系方式**: {{metadata.contact_channel}}{{/if}}

## 背景
待补充

## 互动记录
{{#if interactions}}
{{#each interactions}}
- {{timestamp}}: {{content}}
{{/each}}
{{else}}
暂无互动记录
{{/if}}

## 跟进事项
- [ ] 补充公司背景
- [ ] 补充职位详情
