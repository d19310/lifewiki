import { App, TFile, normalizePath } from 'obsidian';
import type {
	AgentMemoryRecord,
	BlockMemoryAnalysis,
	EventMemory,
	KnowledgeCapsule,
	OpenLoopMemory,
	SignalMemory
} from './types';
import { knowledgeCapsulePath, renderKnowledgeCapsuleMarkdown } from './markdown-renderer';

const INDEX_DIR = '.lifewiki/index';

function isTFile(file: unknown): file is TFile {
	return file !== null && typeof file === 'object' && 'path' in file;
}

function toJsonLine(record: unknown): string {
	return `${JSON.stringify(record)}\n`;
}

function isFolderExistsError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /folder already exists/i.test(message);
}

function isFileExistsError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /file already exists/i.test(message);
}

/**
 * Persists LifeWiki 2.0 memory indexes in an agent-readable shape.
 *
 * This service intentionally writes plain JSON/JSONL files under `.lifewiki`
 * so external agents can consume memory without parsing every Markdown note.
 */
export class MemoryIndexStore {
	constructor(private readonly app: App, private readonly indexDir = INDEX_DIR) {}

	async appendBlockAnalysis(analysis: BlockMemoryAnalysis): Promise<void> {
		await this.ensureIndexDir();

		await this.appendJsonl('events.jsonl', analysis.events);
		await this.appendJsonl('signals.jsonl', analysis.signals);
		await this.writeMergedArray('knowledge-capsules.json', analysis.knowledgeCapsules);
		await this.writeMergedArray('open-loops.json', analysis.openLoops);
		await this.appendJsonl('agent-memory.jsonl', this.toAgentMemoryRecords(analysis));
	}

	async readEvents(): Promise<EventMemory[]> {
		return this.readJsonl<EventMemory>('events.jsonl');
	}

	async readKnowledgeCapsules(): Promise<KnowledgeCapsule[]> {
		return this.readArray<KnowledgeCapsule>('knowledge-capsules.json');
	}

	async readSignals(): Promise<SignalMemory[]> {
		return this.readJsonl<SignalMemory>('signals.jsonl');
	}

	async readOpenLoops(): Promise<OpenLoopMemory[]> {
		return this.readArray<OpenLoopMemory>('open-loops.json');
	}

	async readAgentMemory(): Promise<AgentMemoryRecord[]> {
		return this.readJsonl<AgentMemoryRecord>('agent-memory.jsonl');
	}

	async appendEvents(events: EventMemory[]): Promise<void> {
		await this.ensureIndexDir();
		await this.appendJsonl('events.jsonl', events);
	}

	async upsertKnowledgeCapsules(capsules: KnowledgeCapsule[]): Promise<void> {
		await this.ensureIndexDir();
		await this.writeMergedArray('knowledge-capsules.json', capsules);
	}

	async updateKnowledgeCapsuleStatus(
		id: string,
		status: KnowledgeCapsule['status']
	): Promise<KnowledgeCapsule | null> {
		await this.ensureIndexDir();
		const capsules = await this.readKnowledgeCapsules();
		const capsule = capsules.find((item) => item.id === id);
		if (!capsule) return null;

		const updated: KnowledgeCapsule = {
			...capsule,
			status,
			updatedAt: new Date().toISOString()
		};

		await this.writeMergedArray('knowledge-capsules.json', [updated]);
		if (status === 'confirmed') {
			await this.writeKnowledgeCapsuleMarkdown(updated);
		}
		await this.appendJsonl('agent-memory.jsonl', this.toAgentMemoryRecords({
			blockId: updated.evidence[0]?.blockId || '',
			memoryEcho: updated.content,
			labels: updated.appliesTo,
			events: [],
			knowledgeCapsules: [updated],
			signals: [],
			openLoops: [],
			relatedEntityIds: updated.relatedEntityIds,
			createdAt: updated.updatedAt
		}));

		return updated;
	}

	async writeKnowledgeCapsuleMarkdown(capsule: KnowledgeCapsule): Promise<string> {
		await this.ensureFolder('Memory');
		await this.ensureFolder('Memory/Capsules');

		const path = knowledgeCapsulePath(capsule);
		const content = renderKnowledgeCapsuleMarkdown(capsule);
		const file = this.app.vault.getAbstractFileByPath(path);

		if (isTFile(file)) {
			await this.app.vault.modify(file, content);
		} else {
			await this.app.vault.create(path, content);
		}

		return path;
	}

	async appendSignals(signals: SignalMemory[]): Promise<void> {
		await this.ensureIndexDir();
		await this.appendJsonl('signals.jsonl', signals);
	}

	async upsertOpenLoops(openLoops: OpenLoopMemory[]): Promise<void> {
		await this.ensureIndexDir();
		await this.writeMergedArray('open-loops.json', openLoops);
	}

	private async appendJsonl(fileName: string, records: unknown[]): Promise<void> {
		if (records.length === 0) return;

		const path = this.path(fileName);
		const file = this.app.vault.getAbstractFileByPath(path);
		const addition = records.map(toJsonLine).join('');

		if (isTFile(file)) {
			const existing = await this.app.vault.read(file);
			await this.app.vault.modify(file, existing + addition);
			return;
		}

		try {
			await this.app.vault.create(path, addition);
		} catch (error) {
			if (!isFileExistsError(error)) throw error;
			const existingFile = this.app.vault.getAbstractFileByPath(path);
			if (isTFile(existingFile)) {
				const existing = await this.app.vault.read(existingFile);
				await this.app.vault.modify(existingFile, existing + addition);
				return;
			}
			const adapter = (this.app.vault as any).adapter;
			if (adapter?.read && adapter?.write) {
				const existing = await adapter.read(path);
				await adapter.write(path, existing + addition);
				return;
			}
			throw error;
		}
	}

	private async readJsonl<T>(fileName: string): Promise<T[]> {
		const path = this.path(fileName);
		const file = this.app.vault.getAbstractFileByPath(path);
		const content = isTFile(file)
			? await this.app.vault.read(file)
			: await this.readViaAdapter(path);
		if (!content) return [];
		return content
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
			.flatMap((line) => {
				try {
					return [JSON.parse(line) as T];
				} catch {
					return [];
				}
			});
	}

	private async readArray<T>(fileName: string): Promise<T[]> {
		const path = this.path(fileName);
		const file = this.app.vault.getAbstractFileByPath(path);
		const content = isTFile(file)
			? await this.app.vault.read(file)
			: await this.readViaAdapter(path);
		if (!content) return [];
		return this.parseArray<T>(content);
	}

	private async readViaAdapter(path: string): Promise<string> {
		const adapter = (this.app.vault as any).adapter;
		if (!adapter?.read) return '';
		try {
			return await adapter.read(path);
		} catch {
			return '';
		}
	}

	private async writeMergedArray<T extends { id: string }>(fileName: string, records: T[]): Promise<void> {
		if (records.length === 0) return;

		const byId = new Map<string, T>();

		const path = this.path(fileName);
		let file = this.app.vault.getAbstractFileByPath(path);
		if (isTFile(file)) {
			const existing = await this.app.vault.read(file);
			for (const item of this.parseArray<T>(existing)) {
				byId.set(item.id, item);
			}
		}

		for (const record of records) {
			byId.set(record.id, record);
		}

		const nextContent = `${JSON.stringify(Array.from(byId.values()), null, 2)}\n`;
		if (isTFile(file)) {
			await this.app.vault.modify(file, nextContent);
			return;
		}

		try {
			await this.app.vault.create(path, nextContent);
		} catch (error) {
			if (!isFileExistsError(error)) throw error;
			file = this.app.vault.getAbstractFileByPath(path);
			if (isTFile(file)) {
				const existing = await this.app.vault.read(file);
				for (const item of this.parseArray<T>(existing)) {
					byId.set(item.id, item);
				}
				for (const record of records) {
					byId.set(record.id, record);
				}
				await this.app.vault.modify(file, `${JSON.stringify(Array.from(byId.values()), null, 2)}\n`);
				return;
			}
			const adapter = (this.app.vault as any).adapter;
			if (adapter?.read && adapter?.write) {
				const existing = await adapter.read(path);
				for (const item of this.parseArray<T>(existing)) {
					byId.set(item.id, item);
				}
				for (const record of records) {
					byId.set(record.id, record);
				}
				await adapter.write(path, `${JSON.stringify(Array.from(byId.values()), null, 2)}\n`);
				return;
			}
			throw error;
		}
	}

	private parseArray<T>(content: string): T[] {
		try {
			const parsed = JSON.parse(content);
			return Array.isArray(parsed) ? parsed as T[] : [];
		} catch {
			return [];
		}
	}

	private toAgentMemoryRecords(analysis: BlockMemoryAnalysis): AgentMemoryRecord[] {
		return [
			...analysis.events.map((event) => ({
				id: event.id,
				kind: 'event' as const,
				title: event.title,
				content: event.summary,
				relatedEntityIds: event.relatedEntityIds,
				confidence: event.confidence,
				evidenceBlockIds: event.sourceBlockIds,
				updatedAt: event.createdAt
			})),
			...analysis.knowledgeCapsules.map((capsule) => ({
				id: capsule.id,
				kind: 'knowledge_capsule' as const,
				title: capsule.title,
				content: capsule.content,
				triggers: capsule.triggers,
				appliesTo: capsule.appliesTo,
				avoid: capsule.avoid,
				relatedEntityIds: capsule.relatedEntityIds,
				status: capsule.status,
				confidence: capsule.confidence,
				evidenceBlockIds: capsule.evidence.map((item) => item.blockId),
				updatedAt: capsule.updatedAt
			})),
			...analysis.signals.map((signal) => ({
				id: signal.id,
				kind: 'signal' as const,
				title: `${signal.type}: ${signal.value}`,
				content: signal.summary,
				relatedEntityIds: signal.relatedEntityIds,
				confidence: signal.confidence,
				evidenceBlockIds: signal.evidence.map((item) => item.blockId),
				updatedAt: signal.occurredAt
			})),
			...analysis.openLoops.map((openLoop) => ({
				id: openLoop.id,
				kind: 'open_loop' as const,
				title: openLoop.title,
				content: openLoop.context,
				relatedEntityIds: openLoop.relatedEntityIds,
				status: openLoop.status,
				confidence: openLoop.confidence,
				evidenceBlockIds: openLoop.evidence.map((item) => item.blockId),
				updatedAt: openLoop.updatedAt
			}))
		];
	}

	private async ensureIndexDir(): Promise<void> {
		await this.ensureFolder(this.indexDir);
	}

	private async ensureFolder(path: string): Promise<void> {
		const segments = path.split('/').filter(Boolean);
		let current = '';

		for (const segment of segments) {
			current = current ? `${current}/${segment}` : segment;
			const normalized = normalizePath(current);

			if (!this.app.vault.getAbstractFileByPath(normalized)) {
				try {
					await this.app.vault.createFolder(normalized);
				} catch (error) {
					if (!isFolderExistsError(error)) {
						throw error;
					}
				}
			}
		}
	}

	private path(fileName: string): string {
		return normalizePath(`${this.indexDir}/${fileName}`);
	}
}
