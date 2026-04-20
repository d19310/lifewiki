## 任务详情
{{summary}}

## 基本属性
- **状态**: {{metadata.status}}
- **优先级**: {{metadata.priority}}
{{#if metadata.deadline}}- **截止日期**: {{metadata.deadline}}{{/if}}
{{#if metadata.assignee}}- **负责人**: {{metadata.assignee}}{{/if}}

## 所属项目
{{#if metadata.project_name}}- **项目名称**: {{metadata.project_name}}{{/if}}
{{#if metadata.project_id}}- **项目ID**: {{metadata.project_id}}{{/if}}

## 任务描述
{{metadata.description}}

## 子任务
{{#if metadata.subtasks}}
{{#each metadata.subtasks}}
- {{#if this.completed}}[x]{{else}}[ ]{{/if}} {{this.title}}
{{/each}}
{{else}}
- [ ] 子任务1
- [ ] 子任务2
{{/if}}

## 进度记录
{{#if interactions}}
{{#each interactions}}
- {{timestamp}}: {{content}}
{{/each}}
{{else}}
暂无相关记录
{{/if}}

## 备注
{{metadata.notes}}
