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
	const content = await loadTemplateContent(vault, templatePath);

	if (content === null) {
		console.warn(`[TemplateLoader] Template not found: ${templatePath}, falling back to default`);
		return getDefaultTemplate(templatePath, context);
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
{{#if metadata.company}}- **公司**: {{metadata.company}}{{/if}}
{{#if metadata.position}}- **职位**: {{metadata.position}}{{/if}}

## 关联实体
{{#each relatedEntities}}
- [[{{this.name}}]] - {{this.relation}}
{{/each}}

## 互动历史
{{#each interactions}}
- {{timestamp}}: {{content}}
{{/each}}
`;

		case 'project':
			return `## 项目概述
{{summary}}

## 关联实体

## 项目进展

## 备注
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
{{#if metadata.brand}}- **品牌**: {{metadata.brand}}{{/if}}
{{#if metadata.model}}- **型号**: {{metadata.model}}{{/if}}

## 关联实体

## 使用记录

## 备注
`;

		case 'idea':
			return `## 想法概述
{{summary}}

## 关联实体

## 发展记录

## 备注
`;

		case 'knowledge':
			return `## 摘要
{{summary}}

## 关联实体

## 阅读笔记

## 备注
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
