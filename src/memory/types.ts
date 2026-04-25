/**
 * LifeWiki 2.0 memory model.
 *
 * These types describe the tacit-knowledge layer that sits above diary blocks
 * and entity pages. They are intentionally storage-friendly so the same records
 * can be rendered as Markdown or exported as agent-readable JSON indexes.
 */

export type MemoryStatus = 'candidate' | 'confirmed' | 'rejected' | 'deprecated';

export type MemorySource = 'diary' | 'chat' | 'review' | 'import' | 'manual';

export type KnowledgeCapsuleType =
	| 'lesson'
	| 'principle'
	| 'preference'
	| 'workflow'
	| 'decision'
	| 'pattern'
	| 'constraint'
	| 'open_question';

export type SignalType =
	| 'emotion'
	| 'energy'
	| 'stress'
	| 'attention'
	| 'risk'
	| 'relationship_shift'
	| 'recurring_theme';

export type OpenLoopType =
	| 'follow_up'
	| 'unanswered_question'
	| 'pending_decision'
	| 'commitment'
	| 'unclear_boundary'
	| 'blocked_task';

export interface EvidenceRef {
	blockId: string;
	filePath?: string;
	quote?: string;
	timestamp?: string;
}

export interface EventMemory {
	id: string;
	title: string;
	summary: string;
	source: MemorySource;
	sourceBlockIds: string[];
	relatedEntityIds: string[];
	occurredAt: string;
	createdAt: string;
	confidence: number;
}

export interface KnowledgeCapsule {
	id: string;
	type: KnowledgeCapsuleType;
	title: string;
	content: string;
	triggers: string[];
	appliesTo: string[];
	avoid?: string[];
	relatedEntityIds: string[];
	evidence: EvidenceRef[];
	status: MemoryStatus;
	confidence: number;
	createdAt: string;
	updatedAt: string;
}

export interface SignalMemory {
	id: string;
	type: SignalType;
	value: string;
	intensity?: 'low' | 'medium' | 'high';
	summary: string;
	relatedEntityIds: string[];
	evidence: EvidenceRef[];
	occurredAt: string;
	confidence: number;
}

export interface OpenLoopMemory {
	id: string;
	type: OpenLoopType;
	title: string;
	context: string;
	nextStep?: string;
	dueAt?: string;
	relatedEntityIds: string[];
	evidence: EvidenceRef[];
	status: 'open' | 'resolved' | 'dismissed';
	confidence: number;
	createdAt: string;
	updatedAt: string;
}

export interface BlockMemoryAnalysis {
	blockId: string;
	memoryEcho: string;
	labels: string[];
	events: EventMemory[];
	knowledgeCapsules: KnowledgeCapsule[];
	signals: SignalMemory[];
	openLoops: OpenLoopMemory[];
	relatedEntityIds: string[];
	createdAt: string;
}

export interface AgentMemoryRecord {
	id: string;
	kind: 'event' | 'knowledge_capsule' | 'signal' | 'open_loop';
	title: string;
	content: string;
	triggers?: string[];
	appliesTo?: string[];
	avoid?: string[];
	relatedEntityIds: string[];
	status?: MemoryStatus | 'open' | 'resolved' | 'dismissed';
	confidence: number;
	evidenceBlockIds: string[];
	updatedAt: string;
}
