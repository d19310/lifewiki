import type { AnalysisResult, EntityPreview } from '../entities/types';
import type { BlockMemoryAnalysis } from './types';

export interface LegacyEntityCandidate {
	type: EntityPreview['type'];
	name: string;
	confidence: number;
	context: string;
	isArchived: boolean;
	newEntity?: boolean;
}

/**
 * Compatibility adapter for old LifeWiki 1.x entity-first surfaces.
 *
 * The LifeWiki 2.0 capture path should use BlockMemoryAnalysis directly.
 * This adapter exists so legacy panels, providers, tests, and entity tools can
 * keep running while the product flow moves to memory-first analysis.
 */
export function memoryAnalysisToLegacyAnalysisResult(input: {
	blockId: string;
	memoryAnalysis: BlockMemoryAnalysis;
	entityCandidates?: LegacyEntityCandidate[];
	timestamp?: string;
}): AnalysisResult {
	const previews: AnalysisResult['entities'] = {
		people: [],
		projects: [],
		things: [],
		ideas: [],
		knowledge: []
	};

	for (const entity of input.entityCandidates || []) {
		const preview: EntityPreview = {
			type: entity.type,
			name: entity.name,
			confidence: entity.confidence,
			context: entity.context,
			isArchived: entity.isArchived,
			newEntity: entity.newEntity
		};

		if (entity.type === 'person') previews.people.push(preview);
		if (entity.type === 'project') previews.projects.push(preview);
		if (entity.type === 'thing') previews.things.push(preview);
		if (entity.type === 'idea') previews.ideas.push(preview);
		if (entity.type === 'knowledge') previews.knowledge.push(preview);
	}

	return {
		blockId: input.blockId,
		timestamp: input.timestamp || input.memoryAnalysis.createdAt,
		category: inferLegacyCategory(input.memoryAnalysis.labels),
		areas: input.memoryAnalysis.labels.slice(0, 2),
		entities: previews,
		needsConfirmation: [],
		aiResponse: input.memoryAnalysis.memoryEcho
	};
}

function inferLegacyCategory(labels: string[]): '工作' | '个人' | '待确认' {
	if (labels.includes('工作') || labels.includes('项目管理') || labels.includes('客户沟通')) return '工作';
	if (labels.includes('个人') || labels.includes('生活')) return '个人';
	return '待确认';
}
