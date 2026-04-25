import { MemoryIndexStore } from './index-store';
import type { BlockMemoryAnalysis, KnowledgeCapsule } from './types';

class MemoryVault {
	files = new Map<string, string>();
	folders = new Set<string>();
	adapter = {
		read: jest.fn(async (path: string) => this.files.get(path) || ''),
		write: jest.fn(async (path: string, content: string) => {
			this.files.set(path, content);
		})
	};

	getAbstractFileByPath = jest.fn((path: string) => {
		if (this.files.has(path) || this.folders.has(path)) {
			return { path };
		}
		return null;
	});

	read = jest.fn(async (file: { path: string }) => this.files.get(file.path) || '');

	create = jest.fn(async (path: string, content: string) => {
		this.files.set(path, content);
		return { path };
	});

	modify = jest.fn(async (file: { path: string }, content: string) => {
		this.files.set(file.path, content);
	});

	createFolder = jest.fn(async (path: string) => {
		this.folders.add(path);
	});
}

function createStore() {
	const vault = new MemoryVault();
	const app = { vault } as any;
	return { store: new MemoryIndexStore(app), vault };
}

function createCapsule(overrides: Partial<KnowledgeCapsule> = {}): KnowledgeCapsule {
	return {
		id: 'capsule_block-1_review-pattern_0',
		type: 'pattern',
		title: '评审前先收敛上下文',
		content: '复杂评审前先把目标、约束和证据收敛成一个短清单。',
		triggers: ['代码评审开始前'],
		appliesTo: ['项目协作', '需求澄清'],
		avoid: ['直接进入细节争论'],
		relatedEntityIds: ['entity-project-1'],
		evidence: [{
			blockId: 'block-1',
			filePath: 'Daily/2026-04-24.md',
			quote: '今天发现评审前先收敛上下文会更稳。',
			timestamp: '2026-04-24T09:00:00.000Z'
		}],
		status: 'candidate',
		confidence: 0.86,
		createdAt: '2026-04-24T09:00:00.000Z',
		updatedAt: '2026-04-24T09:00:00.000Z',
		...overrides
	};
}

function createAnalysis(overrides: Partial<BlockMemoryAnalysis> = {}): BlockMemoryAnalysis {
	const capsule = createCapsule();
	return {
		blockId: 'block-1',
		memoryEcho: '这条日记沉淀了一个协作前置收敛的工作模式。#项目协作',
		labels: ['工作', '项目协作'],
		events: [{
			id: 'event_block-1_review_0',
			title: '完成项目评审',
			summary: '在项目评审中发现前置上下文收敛能降低沟通成本。',
			source: 'diary',
			sourceBlockIds: ['block-1'],
			relatedEntityIds: ['entity-project-1'],
			occurredAt: '2026-04-24T09:00:00.000Z',
			createdAt: '2026-04-24T09:00:00.000Z',
			confidence: 0.8
		}],
		knowledgeCapsules: [capsule],
		signals: [{
			id: 'signal_block-1_attention_0',
			type: 'attention',
			value: '上下文收敛',
			intensity: 'medium',
			summary: '用户注意到评审前置收敛带来的效率提升。',
			relatedEntityIds: ['entity-project-1'],
			evidence: capsule.evidence,
			occurredAt: '2026-04-24T09:00:00.000Z',
			confidence: 0.75
		}],
		openLoops: [{
			id: 'open_loop_block-1_template_0',
			type: 'follow_up',
			title: '整理评审前置清单模板',
			context: '这条模式可以进一步沉淀成评审模板。',
			nextStep: '写一个三项清单模板',
			relatedEntityIds: ['entity-project-1'],
			evidence: capsule.evidence,
			status: 'open',
			confidence: 0.72,
			createdAt: '2026-04-24T09:00:00.000Z',
			updatedAt: '2026-04-24T09:00:00.000Z'
		}],
		relatedEntityIds: ['entity-project-1'],
		createdAt: '2026-04-24T09:00:00.000Z',
		...overrides
	};
}

describe('MemoryIndexStore', () => {
	it('serializes block analysis into memory indexes and reads it back', async () => {
		const { store, vault } = createStore();
		const analysis = createAnalysis();

		await store.appendBlockAnalysis(analysis);

		expect(vault.createFolder).toHaveBeenCalledWith('.lifewiki');
		expect(vault.createFolder).toHaveBeenCalledWith('.lifewiki/index');
		expect(await store.readEvents()).toEqual(analysis.events);
		expect(await store.readKnowledgeCapsules()).toEqual(analysis.knowledgeCapsules);
		expect(await store.readSignals()).toEqual(analysis.signals);
		expect(await store.readOpenLoops()).toEqual(analysis.openLoops);

		const agentMemory = await store.readAgentMemory();
		expect(agentMemory).toHaveLength(4);
		expect(agentMemory.map((item) => item.kind)).toEqual([
			'event',
			'knowledge_capsule',
			'signal',
			'open_loop'
		]);
		expect(agentMemory[1]).toMatchObject({
			id: analysis.knowledgeCapsules[0].id,
			status: 'candidate',
			evidenceBlockIds: ['block-1']
		});
	});

	it('treats an already-existing index folder race as success', async () => {
		const { store, vault } = createStore();
		vault.createFolder.mockRejectedValueOnce(new Error('Folder already exists.'));

		await expect(store.appendBlockAnalysis(createAnalysis())).resolves.toBeUndefined();
		expect(await store.readEvents()).toHaveLength(1);
	});

	it('appends jsonl when file creation races with an existing file', async () => {
		const { store, vault } = createStore();
		const analysis = createAnalysis();
		vault.files.set('.lifewiki/index/events.jsonl', `${JSON.stringify({
			...analysis.events[0],
			id: 'event-existing'
		})}\n`);
		vault.getAbstractFileByPath.mockImplementation((path: string) => {
			if (path === '.lifewiki/index/events.jsonl') return null;
			if (vault.files.has(path) || vault.folders.has(path)) return { path };
			return null;
		});
		vault.create.mockImplementationOnce(async () => {
			throw new Error('File already exists.');
		});

		await store.appendEvents(analysis.events);

		const events = await store.readEvents();
		expect(events.map((event) => event.id)).toEqual(['event-existing', analysis.events[0].id]);
	});

	it('merges array records when file creation races with an existing file', async () => {
		const { store, vault } = createStore();
		const original = createCapsule({ content: '旧内容' });
		const updated = createCapsule({ content: '新内容' });
		vault.files.set('.lifewiki/index/knowledge-capsules.json', `${JSON.stringify([original], null, 2)}\n`);
		vault.getAbstractFileByPath.mockImplementation((path: string) => {
			if (path === '.lifewiki/index/knowledge-capsules.json') return null;
			if (vault.files.has(path) || vault.folders.has(path)) return { path };
			return null;
		});
		vault.create.mockImplementationOnce(async () => {
			throw new Error('File already exists.');
		});

		await store.upsertKnowledgeCapsules([updated]);

		const capsules = await store.readKnowledgeCapsules();
		expect(capsules).toHaveLength(1);
		expect(capsules[0].content).toBe('新内容');
	});

	it('upserts array-backed records by stable id instead of duplicating them', async () => {
		const { store } = createStore();
		const original = createCapsule({ content: '旧内容', confidence: 0.6 });
		const updated = createCapsule({ content: '新内容', confidence: 0.9 });

		await store.upsertKnowledgeCapsules([original]);
		await store.upsertKnowledgeCapsules([updated]);

		const capsules = await store.readKnowledgeCapsules();
		expect(capsules).toHaveLength(1);
		expect(capsules[0]).toMatchObject({
			id: original.id,
			content: '新内容',
			confidence: 0.9
		});
	});

	it('writes confirmed knowledge capsules as markdown notes', async () => {
		const { store, vault } = createStore();
		const capsule = createCapsule();
		await store.upsertKnowledgeCapsules([capsule]);

		const updated = await store.updateKnowledgeCapsuleStatus(capsule.id, 'confirmed');

		expect(updated?.status).toBe('confirmed');
		expect(vault.files.has('Memory/Capsules/评审前先收敛上下文.md')).toBe(true);
		const markdown = vault.files.get('Memory/Capsules/评审前先收敛上下文.md') || '';
		expect(markdown).toContain('memory_id: "capsule_block-1_review-pattern_0"');
		expect(markdown).toContain('status: "confirmed"');
		expect(markdown).toContain('## 证据');
		expect(markdown).toContain('Daily/2026-04-24.md#block-1');

		const agentMemory = await store.readAgentMemory();
		expect(agentMemory.some((item) => item.id === capsule.id && item.status === 'confirmed')).toBe(true);
	});

	it('ignores malformed jsonl lines when reading indexes', async () => {
		const { store, vault } = createStore();
		vault.files.set('.lifewiki/index/events.jsonl', [
			JSON.stringify(createAnalysis().events[0]),
			'not-json',
			''
		].join('\n'));

		const events = await store.readEvents();
		expect(events).toHaveLength(1);
		expect(events[0].id).toBe('event_block-1_review_0');
	});
});
