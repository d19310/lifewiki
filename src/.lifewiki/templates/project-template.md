## 基本信息
{{#if metadata.project_kind}}- **类型**: {{metadata.project_kind}}{{/if}}
{{#if metadata.client}}- **客户/需求方**: {{metadata.client}}{{/if}}
{{#if metadata.owner}}- **负责人**: {{metadata.owner}}{{/if}}
{{#if metadata.stage}}- **阶段**: {{metadata.stage}}{{/if}}
{{#if metadata.priority}}- **优先级**: {{metadata.priority}}{{/if}}
{{#if metadata.amount}}- **金额**: {{metadata.amount}}{{/if}}
{{#if metadata.start_date}}- **开始时间**: {{metadata.start_date}}{{/if}}
{{#if metadata.due_date}}- **截止时间**: {{metadata.due_date}}{{/if}}

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

## 关键里程碑
{{#if metadata.milestones}}
{{#each metadata.milestones}}
- {{#if this.completed}}[x]{{else}}[ ]{{/if}} {{this.title}}
{{/each}}
{{else}}
- [ ] 需求确认
- [ ] 方案交付
- [ ] 项目验收
{{/if}}

## 跟进事项
- [ ] 补充下一步动作
