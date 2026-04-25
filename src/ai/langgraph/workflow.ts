/**
 * LangGraph Workflow for 5-Step Diary Analysis
 *
 * Architecture:
 * - State: shared state across all nodes
 * - Nodes: detection -> processing -> relations -> conflicts -> summary
 * - Edges: conditional routing based on state
 * - Human-in-loop: interrupt at confirmation points
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import type { AIProviderAdapter } from './adapter';
import type { EntityTools } from './tools/entity-tools';
import type { WebClipperTools } from './tools/web-clipper-tools';
import { AnalysisPhase } from '../../entities/types';

// ============ STATE TYPE ============

export interface WorkflowState {
	// Block info
	blockId: string;
	blockContent: string;

	// Conversation history
	messages: BaseMessage[];

	// Current phase
	currentPhase: AnalysisPhase;

	// Detection results
	detectionResult: DetectionResult | null;

	// Pending operations awaiting user confirmation
	pendingOperations: PendingOperations | null;

	// Confirmed operations ready to execute
	confirmedOperations: ConfirmedOperations;

	// Confirmed entities (after user confirmation of type)
	confirmedEntities: Array<{ name: string; type: string }>;

	// Discovered relations
	relations: Array<{ from: string; to: string; relation: string }>;

	// Areas/tags extracted
	areas: string[];

	// UI output
	aiResponse: string;
	error: string | null;

	// Human-in-loop flag
	awaitingConfirmation: boolean;
}

export interface DetectionResult {
	archivedMatches: ArchivedMatch[];
	newEntities: NewEntity[];
	localFiles: string[];
	webLinks: string[];
}

export interface ArchivedMatch {
	name: string;
	entityId: string;
	matchType: 'exact' | 'alias' | 'trie' | 'edit_distance';
}

export interface NewEntity {
	name: string;
	inferredType: string;
	confidence: number;
	context: string;
}

export interface PendingOperations {
	toCreate: Array<{ name: string; type: string; summary?: string }>;
	toLink: Array<{ from: string; to: string; relation: string; context?: string }>;
	toUpdate: Array<{ entityId: string; name: string; changes: Record<string, any> }>;
}

export interface ConfirmedOperations {
	created: Array<{ entityId: string; name: string; type: string }>;
	linked: Array<{ entityIdA: string; entityIdB: string; relation: string }>;
	updated: Array<{ entityId: string; changes: Record<string, any> }>;
}

// ============ PHASE CONSTANTS ============

const PHASES: AnalysisPhase[] = [
	AnalysisPhase.Detection,
	AnalysisPhase.Processing,
	AnalysisPhase.Relations,
	AnalysisPhase.Conflicts,
	AnalysisPhase.Summary,
	AnalysisPhase.Complete
];

// ============ ROUTING FUNCTIONS ============

/**
 * Route based on current phase
 */
function routeByPhase(state: WorkflowState): string {
	if (state.currentPhase === AnalysisPhase.Complete) {
		return END;
	}
	return state.currentPhase;
}

/**
 * Route after detection - decide whether to skip processing
 */
function routeAfterDetection(state: WorkflowState): string {
	console.log('[Workflow] routeAfterDetection called');
	console.log('[Workflow] Full state keys:', Object.keys(state));
	console.log('[Workflow] state.detectionResult:', state.detectionResult);
	console.log('[Workflow] state.newEntities:', state.detectionResult?.newEntities);
	if (!state.detectionResult?.newEntities?.length) {
		// No new entities, skip processing phase
		console.log('[Workflow] Routing to relations (no new entities)');
		return 'relations';
	}
	console.log('[Workflow] Routing to processing (has new entities)');
	return 'processing';
}

/**
 * Route after processing - should continue to relations
 */
function routeAfterProcessing(state: WorkflowState): string {
	return 'relations';
}

/**
 * Route after relations - should continue to conflicts
 */
function routeAfterRelations(state: WorkflowState): string {
	return 'conflicts';
}

/**
 * Route after conflicts - should continue to summary
 */
function routeAfterConflicts(state: WorkflowState): string {
	return 'summary';
}

// ============ NODE FUNCTIONS ============

/**
 * Step 1: Detection Node
 * Detect entities in diary content using efficient matching
 */
async function detectionNode(
	state: WorkflowState,
	llm: AIProviderAdapter,
	tools: EntityTools
): Promise<Partial<WorkflowState>> {
	console.log('[Workflow] Detection node starting...');
	try {
		// Call detect_entities tool
		console.log('[Workflow] Calling detect_entities with content:', state.blockContent.substring(0, 50));
		const result = await tools.detectEntities({
			diaryContent: state.blockContent,
			options: {
				enableFuzzyMatch: true,
				similarityThreshold: 0.8,
				includeLocalFiles: true,
				includeWebLinks: true
			}
		});

		// Extract data from ToolExecutionResult
		const toolResult = result as any;
		const data = toolResult.success ? toolResult.data : null;

		console.log('[Workflow] detectEntities result:', JSON.stringify(data).substring(0, 200));

		console.log('[Workflow] detectEntities FULL result:', JSON.stringify(result));

		console.log('[Workflow] detectionResult:', JSON.stringify(detectionResult).substring(0, 200));

		const detectionResult: DetectionResult = {
			archivedMatches: data?.archivedMatches || [],
			newEntities: data?.newEntities || [],
			localFiles: data?.localFiles || [],
			webLinks: data?.webLinks || []
		};

		// Add AI response to messages
		const aiResponse = buildDetectionResponse(detectionResult);

		return {
			detectionResult,
			currentPhase: AnalysisPhase.Processing,
			aiResponse,
			messages: [...state.messages, new AIMessage({ content: aiResponse })]
		};
	} catch (error) {
		return {
			error: `Detection failed: ${(error as Error).message}`,
			currentPhase: AnalysisPhase.Complete
		};
	}
}

/**
 * Build AI response for detection results
 * Entity names are highlighted with **bold** format
 */
function buildDetectionResponse(result: DetectionResult): string {
	const parts: string[] = [];

	// Report archived matches (highlight with **)
	if (result.archivedMatches.length > 0) {
		const names = result.archivedMatches.map(m => `**${m.name}**`).join('、');
		parts.push(`检测到已归档实体：${names}`);
	}

	// Report new entities (highlight with **)
	if (result.newEntities.length > 0) {
		const names = result.newEntities.map(e => `**${e.name}**`).join('、');
		parts.push(`新发现实体：${names}`);
	}

	// Report files and links
	if (result.localFiles.length > 0) {
		parts.push(`发现本地文件：${result.localFiles.length}个`);
	}
	if (result.webLinks.length > 0) {
		parts.push(`发现链接：${result.webLinks.length}个`);
	}

	return parts.join('。') || '未检测到任何实体';
}

/**
 * Step 2: Processing Node
 * Build pending operations and await user confirmation (HUMAN-IN-LOOP)
 */
async function processingNode(
	state: WorkflowState,
	tools: EntityTools
): Promise<Partial<WorkflowState>> {
	console.log('[Workflow] ProcessingNode called, detectionResult:', state.detectionResult);

	// Build pending operations from detection results
	const pendingOperations: PendingOperations = {
		toCreate: state.detectionResult?.newEntities.map(e => ({
			name: e.name,
			type: e.inferredType,
			summary: e.context
		})) || [],
		toLink: [],
		toUpdate: []
	};

	// If no pending operations, skip to relations
	if (pendingOperations.toCreate.length === 0 && pendingOperations.toUpdate.length === 0) {
		return {
			currentPhase: AnalysisPhase.Relations,
			pendingOperations: null
		};
	}

	// Build confirmation request
	const confirmationRequest = buildConfirmationRequest(pendingOperations);

	return {
		pendingOperations,
		awaitingConfirmation: true,
		currentPhase: AnalysisPhase.Processing,
		aiResponse: confirmationRequest,
		messages: [...state.messages, new AIMessage({ content: confirmationRequest })]
	};
}

/**
 * Build user confirmation request
 * Entity names are highlighted with **bold** format
 */
function buildConfirmationRequest(ops: PendingOperations): string {
	const lines: string[] = ['【待确认操作】'];

	if (ops.toCreate.length > 0) {
		lines.push('新增实体：');
		for (const entity of ops.toCreate) {
			lines.push(`- **${entity.name}**（${entity.type}）`);
		}
	}

	if (ops.toLink.length > 0) {
		lines.push('关联关系：');
		for (const link of ops.toLink) {
			lines.push(`- **${link.from}** → **${link.to}**（${link.relation}）`);
		}
	}

	lines.push('');
	lines.push('请确认是否执行以上操作。回复"好"执行，"取消"放弃。');

	return lines.join('\n');
}

/**
 * Step 3: Relations Node
 * Discover and link entity relations
 */
async function relationsNode(
	state: WorkflowState,
	llm: AIProviderAdapter,
	tools: EntityTools
): Promise<Partial<WorkflowState>> {
	// If no confirmed entities, skip to conflicts
	if (state.confirmedOperations.created.length === 0) {
		return {
			currentPhase: AnalysisPhase.Conflicts
		};
	}

	// Build relations from confirmed entities and detection results
	const relations = discoverRelations(state);

	if (relations.length === 0) {
		return {
			currentPhase: AnalysisPhase.Conflicts
		};
	}

	// Update pending operations with relations
	const updatedPending: PendingOperations = {
		...state.pendingOperations,
		toLink: relations
	};

	const relationsRequest = buildRelationsRequest(relations);

	return {
		pendingOperations: updatedPending,
		awaitingConfirmation: true,
		currentPhase: AnalysisPhase.Relations,
		aiResponse: relationsRequest,
		messages: [...state.messages, new AIMessage({ content: relationsRequest })]
	};
}

/**
 * Discover potential relations between confirmed entities
 */
function discoverRelations(state: WorkflowState): Array<{ from: string; to: string; relation: string; context: string }> {
	const relations: Array<{ from: string; to: string; relation: string; context: string }> = [];
	const created = state.confirmedOperations.created;

	// Simple heuristic: people associated with projects
	for (const entity of created) {
		if (entity.type === 'person') {
			// Check if there's a project entity
			const relatedProject = created.find(e => e.type === 'project');
			if (relatedProject) {
				relations.push({
					from: entity.name,
					to: relatedProject.name,
					relation: 'related_to',
					context: `在日记中提及`
				});
			}
		}
	}

	return relations;
}

/**
 * Build relations confirmation request
 */
function buildRelationsRequest(relations: Array<{ from: string; to: string; relation: string; context: string }>): string {
	const lines: string[] = ['【发现的关联关系】'];

	for (const rel of relations) {
		lines.push(`- **${rel.from}** → **${rel.to}**（${rel.relation}）`);
	}

	lines.push('');
	lines.push('请确认关联关系是否正确。回复"好"确认，"修改"可调整。');

	return lines.join('\n');
}

/**
 * Step 4: Conflicts Node
 * Detect and handle factual conflicts
 */
async function conflictsNode(
	state: WorkflowState,
	tools: EntityTools
): Promise<Partial<WorkflowState>> {
	// TODO: Implement conflict detection
	// For now, skip to summary
	return {
		currentPhase: AnalysisPhase.Summary
	};
}

/**
 * Step 5: Summary Node
 * Generate summary and update block metadata
 */
async function summaryNode(
	state: WorkflowState,
	llm: AIProviderAdapter,
	tools: EntityTools
): Promise<Partial<WorkflowState>> {
	// Build summary
	const summary = buildSummary(state);

	// Update block metadata
	try {
		await tools.updateBlockMetadata({
			blockId: state.blockId,
			updates: {
				category: inferCategory(state),
				areas: inferAreas(state)
			}
		});
	} catch (error) {
		console.error('[Workflow] Failed to update block metadata:', error);
	}

	return {
		currentPhase: AnalysisPhase.Complete,
		aiResponse: summary,
		messages: [...state.messages, new AIMessage({ content: summary })]
	};
}

/**
 * Build analysis summary
 */
function buildSummary(state: WorkflowState): string {
	const parts: string[] = [];

	const createdCount = state.confirmedOperations.created.length;
	const linkedCount = state.confirmedOperations.linked.length;

	if (createdCount > 0) {
		const names = state.confirmedOperations.created.map(e => e.name).join('、');
		parts.push(`已创建实体：${names}`);
	}

	if (linkedCount > 0) {
		parts.push(`已建立关联：${linkedCount}条`);
	}

	parts.push('#工作'); // TODO: Infer correctly

	return parts.join('。') || '分析完成';
}

/**
 * Infer block category from content
 */
function inferCategory(state: WorkflowState): '工作' | '个人' | '待确认' {
	const content = state.blockContent.toLowerCase();
	const workKeywords = ['会议', '项目', '客户', '报告', '工作', '老板', '同事'];
	const personalKeywords = ['朋友', '家人', '聚会', '旅游', '娱乐'];

	for (const keyword of workKeywords) {
		if (content.includes(keyword)) return '工作';
	}
	for (const keyword of personalKeywords) {
		if (content.includes(keyword)) return '个人';
	}
	return '待确认';
}

/**
 * Infer area tags from content and entities
 */
function inferAreas(state: WorkflowState): string[] {
	const areas: string[] = [];

	// Based on entity types
	for (const entity of state.confirmedOperations.created) {
		if (entity.type === 'project') areas.push('工作');
		if (entity.type === 'person') areas.push('人脉');
	}

	// Deduplicate
	return [...new Set(areas)];
}

// ============ USER CONFIRMATION HANDLING ============

export type ConfirmationResult = 'confirm_all' | 'partial_confirm' | 'cancel_all';

export interface ParsedConfirmation {
	result: ConfirmationResult;
	modifications?: Record<string, string>;
	selectedEntities?: string[];
}

/**
 * Parse user confirmation response
 */
export function parseUserConfirmation(
	userInput: string,
	pendingOps: PendingOperations
): ParsedConfirmation {
	const input = userInput.trim();

	// Confirm all
	if (input === '好' || input === '好的' || input === '确认' || input === 'yes') {
		return { result: 'confirm_all' };
	}

	// Cancel all
	if (input === '取消' || input === 'cancel') {
		return { result: 'cancel_all' };
	}

	// Partial confirm: "只创建张三，其他取消"
	const partialMatch = input.match(/^只创建(.+?)，其他取消$/);
	if (partialMatch) {
		const selectedNames = partialMatch[1].split('、').map(s => s.trim());
		return { result: 'partial_confirm', selectedEntities: selectedNames };
	}

	// Modifications: "好，但张三改成客户"
	const modMatch = input.match(/^好，但(.+?)改成(.+)$/);
	if (modMatch) {
		const modifications: Record<string, string> = {};
		const names = modMatch[1].split('、').map(s => s.trim());
		const newTypes = modMatch[2].split('、').map(s => s.trim());
		names.forEach((name, i) => {
			modifications[name] = newTypes[i] || newTypes[0];
		});
		return { result: 'confirm_all', modifications };
	}

	// Default to cancel
	return { result: 'cancel_all' };
}

/**
 * Apply user confirmation to pending operations
 */
export function applyConfirmation(
	pendingOps: PendingOperations,
	confirmation: ParsedConfirmation
): ConfirmedOperations {
	const confirmed: ConfirmedOperations = {
		created: [],
		linked: [],
		updated: []
	};

	if (confirmation.result === 'cancel_all') {
		return confirmed;
	}

	if (confirmation.result === 'confirm_all') {
		// Confirm all creates (with optional modifications)
		for (const entity of pendingOps.toCreate) {
			let type = entity.type;
			if (confirmation.modifications?.[entity.name]) {
				type = confirmation.modifications[entity.name];
			}
			// Note: entityId will be assigned after actual creation
			confirmed.created.push({ entityId: '', name: entity.name, type });
		}

		// Confirm all links
		for (const link of pendingOps.toLink) {
			confirmed.linked.push({
				entityIdA: '',
				entityIdB: '',
				relation: link.relation
			});
		}

		return confirmed;
	}

	if (confirmation.result === 'partial_confirm') {
		// Only confirm selected entities
		const selected = confirmation.selectedEntities || [];
		for (const entity of pendingOps.toCreate) {
			if (selected.includes(entity.name)) {
				confirmed.created.push({ entityId: '', name: entity.name, type: entity.type });
			}
		}
		return confirmed;
	}

	return confirmed;
}

// ============ STATEGRAPH FACTORY ============

export interface WorkflowConfig {
	llm: AIProviderAdapter;
	tools: EntityTools;
	webClipperTools?: WebClipperTools;
}

/**
 * Create the analysis workflow StateGraph
 */
export function createAnalysisWorkflow(config: WorkflowConfig) {
	const workflow = new StateGraph<WorkflowState>({
		channels: {
			blockId: { value: null as any, default: () => '' },
			blockContent: { value: null as any, default: () => '' },
			messages: { value: null as any, default: () => [] },
			currentPhase: { value: null as any, default: () => AnalysisPhase.Detection },
			detectionResult: { value: null as any, default: () => null },
			pendingOperations: { value: null as any, default: () => null },
			confirmedOperations: {
				value: null as any,
				default: () => ({ created: [], linked: [], updated: [] })
			},
			aiResponse: { value: null as any, default: () => '' },
			error: { value: null as any, default: () => null },
			awaitingConfirmation: { value: null as any, default: () => false }
		}
	});

	// Add nodes
	workflow.addNode('detection', (state: WorkflowState) =>
		detectionNode(state, config.llm, config.tools)
	);
	workflow.addNode('processing', (state: WorkflowState) =>
		processingNode(state, config.tools)
	);
	workflow.addNode('relations', (state: WorkflowState) =>
		relationsNode(state, config.llm, config.tools)
	);
	workflow.addNode('conflicts', (state: WorkflowState) =>
		conflictsNode(state, config.tools)
	);
	workflow.addNode('summary', (state: WorkflowState) =>
		summaryNode(state, config.llm, config.tools)
	);

	// Set entry point - linear flow, each node decides if it should skip
	workflow.addEdge(START, 'detection');
	workflow.addEdge('detection', 'processing');
	workflow.addEdge('processing', 'relations');
	workflow.addEdge('relations', 'conflicts');
	workflow.addEdge('conflicts', 'summary');
	workflow.addEdge('summary', END);

	return workflow.compile();
}

/**
 * Create initial workflow state
 */
export function createInitialWorkflowState(blockId: string, blockContent: string): WorkflowState {
	return {
		blockId,
		blockContent,
		messages: [new HumanMessage({ content: blockContent })],
		currentPhase: AnalysisPhase.Detection,
		detectionResult: null,
		pendingOperations: null,
		confirmedOperations: { created: [], linked: [], updated: [] },
		aiResponse: '',
		error: null,
		awaitingConfirmation: false
	};
}
