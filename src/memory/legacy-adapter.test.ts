import { memoryAnalysisToLegacyAnalysisResult } from './legacy-adapter';
import type { BlockMemoryAnalysis } from './types';

function createMemoryAnalysis(labels: string[] = ['工作', '项目协作']): BlockMemoryAnalysis {
	return {
		blockId: 'block-legacy-1',
		memoryEcho: '这条日记沉淀了一个项目协作模式。#工作',
		labels,
		events: [],
		knowledgeCapsules: [],
		signals: [],
		openLoops: [],
		relatedEntityIds: [],
		createdAt: '2026-04-24T09:00:00.000Z'
	};
}

describe('memoryAnalysisToLegacyAnalysisResult', () => {
	it('adapts memory-first analysis to the legacy entity-first shape', () => {
		const result = memoryAnalysisToLegacyAnalysisResult({
			blockId: 'block-legacy-1',
			memoryAnalysis: createMemoryAnalysis(),
			entityCandidates: [{
				type: 'project',
				name: 'LifeWiki 2.0',
				confidence: 0.9,
				context: '正在重构的项目',
				isArchived: true,
				newEntity: false
			}]
		});

		expect(result).toMatchObject({
			blockId: 'block-legacy-1',
			category: '工作',
			areas: ['工作', '项目协作'],
			needsConfirmation: [],
			aiResponse: '这条日记沉淀了一个项目协作模式。#工作'
		});
		expect(result.entities.projects).toHaveLength(1);
		expect(result.entities.projects[0]).toMatchObject({
			name: 'LifeWiki 2.0',
			isArchived: true
		});
	});

	it('keeps unknown labels in 待确认 for legacy category compatibility', () => {
		const result = memoryAnalysisToLegacyAnalysisResult({
			blockId: 'block-legacy-2',
			memoryAnalysis: createMemoryAnalysis(['注意力', '复盘'])
		});

		expect(result.category).toBe('待确认');
		expect(result.areas).toEqual(['注意力', '复盘']);
	});
});
