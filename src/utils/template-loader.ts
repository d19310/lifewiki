/**
 * Template Loader
 * Loads templates from vault directory and renders with variable substitution
 *
 * Template loading order:
 * 1. vault/templates/ - user override (user can customize)
 * 2. vault/.lifewiki/templates/ - built-in defaults
 */

import { Vault, TFile, TFolder } from 'obsidian';
import { Entity } from '../entities/types';
import { ParsedBlock } from '../views/block-editor';

export interface TemplateContext {
	entity?: Entity;
	block?: ParsedBlock;
	date?: string;
	time?: string;
	content?: string;
	uid?: string;
	[key: string]: any;
}

const BUILT_IN_TEMPLATES_PATH = '.lifewiki/templates';

/**
 * Load template content from vault directory
 */
async function loadTemplateContent(
	vault: Vault,
	templatePath: string
): Promise<string | null> {
	// 1. Try vault's templates folder first (user override)
	const userOverridePath = `templates/${templatePath}`;
	let file = vault.getAbstractFileByPath(userOverridePath);
	if (file instanceof TFile) {
		return await vault.read(file);
	}

	// 2. Fall back to vault's built-in templates
	const builtInPath = `${BUILT_IN_TEMPLATES_PATH}/${templatePath}`;
	file = vault.getAbstractFileByPath(builtInPath);
	if (file instanceof TFile) {
		return await vault.read(file);
	}

	return null;
}

/**
 * Get nested property value using dot notation
 */
function getNestedValue(obj: any, path: string): any {
	return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Render a template with conditional block
 * Handles {{#if variable}}...{{/if}} and {{#each array}}...{{/each}}
 */
function renderConditionals(template: string, context: TemplateContext): string {
	let result = template;

	// Handle {{#if variable}}...{{/if}} conditionals
	const ifRegex = /\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
	result = result.replace(ifRegex, (match, path, content) => {
		const value = getNestedValue(context, path.trim());
		// Handle {{else}} within if blocks
		if (!value) {
			const elseParts = content.split(/\{\{else\}\}/);
			return elseParts.length > 1 ? elseParts[1].trim() : '';
		}
		const elseParts = content.split(/\{\{else\}\}/);
		return elseParts[0].trim();
	});

	// Handle {{#each array}}...{{/each}} loops
	const eachRegex = /\{\{#each\s+([^}]+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
	result = result.replace(eachRegex, (match, path, content) => {
		const array = getNestedValue(context, path.trim());
		if (!Array.isArray(array) || array.length === 0) {
			return '';
		}
		return array.map((item: any) => {
			let itemContent = content;
			// Replace {{this.property}} within each block with item values
			itemContent = itemContent.replace(/\{\{this\.([^}]+)\}\}/g, (m, itemPath) => {
				return getNestedValue(item, itemPath.trim()) ?? '';
			});
			itemContent = itemContent.replace(/\{\{([^#\/][^}]*?)\}\}/g, (m, itemPath) => {
				const path = itemPath.trim();
				if (path === 'this') return String(item);
				return getNestedValue(item, path) ?? '';
			});
			// Also handle direct {{property}} references to the item itself
			if (typeof item === 'string' || typeof item === 'number') {
				itemContent = itemContent.replace(/\{\{this\}\}/g, String(item));
			}
			return itemContent;
		}).join('');
	});

	return result;
}

/**
 * Render template with variable substitutions
 * Handles {{variable}} and {{nested.property}} syntax
 */
function renderVariables(template: string, context: TemplateContext): string {
	let result = template;

	// Replace simple variables and nested properties
	const varRegex = /\{\{([^#\/][^}]*?)\}\}/g;
	result = result.replace(varRegex, (match, path) => {
		const trimmedPath = path.trim();
		const value = getNestedValue(context, trimmedPath);
		if (value === undefined || value === null) {
			return '';
		}
		if (typeof value === 'object') {
			return JSON.stringify(value);
		}
		return String(value);
	});

	return result;
}

/**
 * Load and render a template with the given context
 *
 * @param vault - Obsidian vault
 * @param templatePath - Template file name (e.g., 'person-template.md')
 * @param context - Variables to substitute into the template
 * @returns Rendered template string
 */
export async function loadTemplate(
	vault: Vault,
	templatePath: string,
	context: TemplateContext
): Promise<string> {
	let content = await loadTemplateContent(vault, templatePath);

	if (content === null) {
		console.warn(`[TemplateLoader] Template not found: ${templatePath}, falling back to default`);
		content = getDefaultTemplate(templatePath, context);
	}

	// Render in order: conditionals first, then variables
	let result = renderConditionals(content, context);
	result = renderVariables(result, context);

	return result;
}

/**
 * Get default template content when file is not found
 */
function getDefaultTemplate(templatePath: string, context: TemplateContext): string {
	const type = templatePath.replace('-template.md', '');

	switch (type) {
		case 'journal':
			return `# ${context.date || 'Untitled'}

> [!NOTE] 日记是AI时代人生最大的复利

## Flow of Today：
`;

		case 'person':
			return `## 基本信息
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
`;

		case 'project':
			return `## 基本信息
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
- [ ] 需求确认
- [ ] 方案交付
- [ ] 项目验收

## 跟进事项
- [ ] 补充下一步动作
`;

		case 'task':
			return `## 任务详情
{{summary}}

## 基本属性
- **状态**: {{metadata.status}}
- **优先级**: {{metadata.priority}}

## 进度记录

## 备注
`;

		case 'thing':
			return `## 基本信息
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
暂无互动记录
{{/if}}

## 跟进事项
- [ ] 补充下一步动作
`;

		case 'idea':
			return `## 基本信息
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
暂无互动记录
{{/if}}

## 备注
`;

		case 'knowledge':
			return `## 摘要
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
`;

		default:
			return `{{content}}`;
	}
}

/**
 * Load template and return as array of lines
 */
export async function loadTemplateLines(
	vault: Vault,
	templatePath: string,
	context: TemplateContext
): Promise<string[]> {
	const content = await loadTemplate(vault, templatePath, context);
	return content.split('\n');
}
