import { normalizePath } from 'obsidian';
import type { KnowledgeCapsule } from './types';

export function knowledgeCapsulePath(capsule: KnowledgeCapsule): string {
	return normalizePath(`Memory/Capsules/${safeFileName(capsule.title)}.md`);
}

export function renderKnowledgeCapsuleMarkdown(capsule: KnowledgeCapsule): string {
	const evidence = capsule.evidence || [];
	const frontmatter = [
		'---',
		`memory_id: "${capsule.id}"`,
		`memory_type: "knowledge_capsule"`,
		`capsule_type: "${capsule.type}"`,
		`status: "${capsule.status}"`,
		`confidence: ${capsule.confidence}`,
		`created_at: "${capsule.createdAt}"`,
		`updated_at: "${capsule.updatedAt}"`,
		`triggers: [${capsule.triggers.map(quoteYaml).join(', ')}]`,
		`applies_to: [${capsule.appliesTo.map(quoteYaml).join(', ')}]`,
		`related_entity_ids: [${capsule.relatedEntityIds.map(quoteYaml).join(', ')}]`,
		'---'
	].join('\n');

	const lines = [
		frontmatter,
		'',
		`# ${capsule.title}`,
		'',
		'## 内容',
		capsule.content,
		'',
		'## 触发条件',
		...(capsule.triggers.length > 0 ? capsule.triggers.map((item) => `- ${item}`) : ['- 待补充']),
		'',
		'## 适用场景',
		...(capsule.appliesTo.length > 0 ? capsule.appliesTo.map((item) => `- ${item}`) : ['- 待补充'])
	];

	if (capsule.avoid && capsule.avoid.length > 0) {
		lines.push('', '## 避免', ...capsule.avoid.map((item) => `- ${item}`));
	}

	lines.push('', '## 证据');
	if (evidence.length === 0) {
		lines.push('- 暂无');
	} else {
		for (const item of evidence) {
			const source = item.filePath ? `${item.filePath}${item.blockId ? `#${item.blockId}` : ''}` : item.blockId;
			lines.push(`- ${source}${item.timestamp ? ` (${item.timestamp})` : ''}`);
			if (item.quote) {
				lines.push(`  > ${item.quote.replace(/\n/g, ' ')}`);
			}
		}
	}

	return `${lines.join('\n')}\n`;
}

function safeFileName(name: string): string {
	return name
		.replace(/[\\/:*?"<>|#^[\]]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 80) || '未命名知识胶囊';
}

function quoteYaml(value: string): string {
	return `"${value.replace(/"/g, '\\"')}"`;
}
