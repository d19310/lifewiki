/**
 * Workflow Runner - Manual step-by-step workflow control
 *
 * Instead of using LangGraph's automated graph execution,
 * we manually control each step to properly handle human-in-the-loop pauses.
 */

import { AnalysisPhase } from '../../entities/types';
import type { AIProviderAdapter } from './adapter';
import type { EntityTools } from './tools/entity-tools';
import type { App } from 'obsidian';
import type { WorkflowState, PendingOperations, DetectionResult } from './workflow';

/**
 * Create initial workflow state
 */
export function createInitialWorkflowState(blockId: string, blockContent: string): WorkflowState {
	return {
		blockId,
		blockContent,
		messages: [],
		currentPhase: AnalysisPhase.Detection,
		detectionResult: null,
		pendingOperations: null,
		confirmedOperations: { created: [], linked: [], updated: [] },
		aiResponse: '',
		error: null,
		awaitingConfirmation: false
	};
}

/**
 * Step 1: Detection - Identify entities in diary content
 */
export async function runDetectionStep(
	state: WorkflowState,
	llm: AIProviderAdapter,
	tools: EntityTools
): Promise<{ state: WorkflowState; aiResponse: string }> {
	console.log('[Workflow] Running detection step...');

	const result = await tools.detectEntities({
		diaryContent: state.blockContent,
		options: {
			enableFuzzyMatch: true,
			similarityThreshold: 0.8,
			includeLocalFiles: true,
			includeWebLinks: true
		}
	});

	const toolResult = result as any;
	const data = toolResult.success ? toolResult.data : null;

	console.log('[Workflow] Detection result:', JSON.stringify(data).substring(0, 300));

	const detectionResult: DetectionResult = {
		archivedMatches: data?.archivedMatches || [],
		newEntities: data?.newEntities || [],
		localFiles: data?.localFiles || [],
		webLinks: data?.webLinks || []
	};

	// Build detection response with highlighted entities
	const aiResponse = buildDetectionResponse(detectionResult);

	return {
		state: {
			...state,
			detectionResult,
			currentPhase: AnalysisPhase.Processing,
			aiResponse,
			messages: [...state.messages, { _getType: () => 'ai', content: aiResponse } as any]
		},
		aiResponse
	};
}

/**
 * Build detection response with highlighted entity names
 */
function buildDetectionResponse(result: DetectionResult): string {
	const parts: string[] = [];

	if (result.archivedMatches.length > 0) {
		const names = result.archivedMatches.map(m => `**${m.name}**`).join('、');
		parts.push(`检测到已归档实体：${names}`);
	}

	if (result.newEntities.length > 0) {
		const names = result.newEntities.map(e => `**${e.name}**`).join('、');
		parts.push(`新发现实体：${names}`);
	}

	if (result.localFiles.length > 0) {
		parts.push(`发现本地文件：${result.localFiles.length}个`);
	}
	if (result.webLinks.length > 0) {
		parts.push(`发现链接：${result.webLinks.length}个`);
	}

	return parts.join('。') || '未检测到任何实体';
}

/**
 * Step 2: Processing - Build pending operations from detection results
 */
export function runProcessingStep(
	state: WorkflowState
): { state: WorkflowState; needsConfirmation: boolean; confirmationText: string } {
	console.log('[Workflow] Running processing step...');

	const newEntities = state.detectionResult?.newEntities || [];
	const archivedEntities = state.detectionResult?.archivedMatches || [];

	const pendingOperations: PendingOperations = {
		toCreate: newEntities.map(e => ({
			name: e.name,
			type: e.inferredType || 'unknown',
			summary: e.reason
		})) || [],
		toLink: [],
		toUpdate: []
	};

	// If no entities at all, skip
	if (newEntities.length === 0 && archivedEntities.length === 0) {
		return {
			state: {
				...state,
				pendingOperations: null,
				currentPhase: AnalysisPhase.Relations
			},
			needsConfirmation: false,
			confirmationText: ''
		};
	}

	// Build confirmation request
	const confirmationText = buildConfirmationRequest(pendingOperations, archivedEntities);

	// Always need confirmation if there are archived entities (to record interaction)
	// or if there are new entities to create
	const needsConfirmation = archivedEntities.length > 0 || newEntities.length > 0;

	return {
		state: {
			...state,
			pendingOperations,
			awaitingConfirmation: needsConfirmation,
			currentPhase: AnalysisPhase.Processing,
			aiResponse: confirmationText,
			messages: [...state.messages, { _getType: () => 'ai', content: confirmationText } as any]
		},
		needsConfirmation,
		confirmationText
	};
}

/**
 * Map entity type to Chinese label
 */
function getTypeLabel(type: string): string {
	const labels: Record<string, string> = {
		'person': '人脉',
		'project': '项目',
		'task': '任务',
		'idea': '想法',
		'knowledge': '知识',
		'location': '地点',
		'thing': '物品'
	};
	return labels[type] || type;
}

/**
 * Build confirmation request with highlighted entity names
 */
function buildConfirmationRequest(
	ops: PendingOperations,
	archivedEntities: Array<{ name: string; type?: string }> = []
): string {
	const lines: string[] = [];

	// Show archived entities first
	if (archivedEntities.length > 0) {
		const archivedDescs = archivedEntities.map(e => `**${e.name}**`).join('、');
		lines.push(`检测到：${archivedDescs}`);
	}

	// Show new entities to create
	if (ops.toCreate.length > 0) {
		const newDescs = ops.toCreate.map(e => `**${e.name}**(${getTypeLabel(e.type)})`).join('、');
		if (archivedEntities.length > 0) {
			lines.push(`新增：${newDescs}，要存档吗？`);
		} else {
			lines.push(`发现 ${newDescs}，要存档吗？`);
		}
	}

	if (ops.toLink.length > 0) {
		lines.push('发现关联：');
		for (const link of ops.toLink) {
			lines.push(`- **${link.from}** → **${link.to}**（${link.relation}）`);
		}
	}

	lines.push('');
	lines.push('回复"好"确认，"取消"算了。');

	return lines.join('\n');
}

/**
 * Parse user confirmation
 */
export type ConfirmationResult = 'confirm_all' | 'partial_confirm' | 'cancel_all';

export interface ParsedConfirmation {
	result: ConfirmationResult;
	modifications?: Record<string, string>;
	selectedEntities?: string[];
}

export function parseUserConfirmation(
	userInput: string,
	pendingOps: PendingOperations
): ParsedConfirmation {
	const input = userInput.trim();

	if (input === '好' || input === '好的' || input === '确认' || input === 'yes') {
		return { result: 'confirm_all' };
	}

	if (input === '取消' || input === 'cancel') {
		return { result: 'cancel_all' };
	}

	const partialMatch = input.match(/^只创建(.+?)，其他取消$/);
	if (partialMatch) {
		const selectedNames = partialMatch[1].split('、').map(s => s.trim());
		return { result: 'partial_confirm', selectedEntities: selectedNames };
	}

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

	return { result: 'cancel_all' };
}

/**
 * Apply confirmation to get confirmed operations
 */
export function applyConfirmation(
	pendingOps: PendingOperations,
	confirmation: ParsedConfirmation
): { created: Array<{ name: string; type: string; entityId: string }>; linked: any[]; updated: any[] } {
	const confirmed = { created: [] as any[], linked: [] as any[], updated: [] as any[] };

	if (confirmation.result === 'cancel_all') {
		return confirmed;
	}

	if (confirmation.result === 'confirm_all') {
		for (const entity of pendingOps.toCreate) {
			let type = entity.type;
			if (confirmation.modifications?.[entity.name]) {
				type = confirmation.modifications[entity.name];
			}
			confirmed.created.push({ entityId: '', name: entity.name, type });
		}
		for (const link of pendingOps.toLink) {
			confirmed.linked.push({ entityIdA: '', entityIdB: '', relation: link.relation });
		}
		return confirmed;
	}

	if (confirmation.result === 'partial_confirm') {
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

/**
 * Step 3-5: Relations, Conflicts, Summary - Execute confirmed operations
 */
export async function executeConfirmedOperations(
	state: WorkflowState,
	tools: EntityTools
): Promise<{ state: WorkflowState; aiResponse: string }> {
	console.log('[Workflow] Executing confirmed operations...');
	console.log('[Workflow] Confirmed operations:', state.confirmedOperations);

	// Actually create entities
	const createdEntities: Array<{ entityId: string; name: string; type: string }> = [];

	for (const entity of state.confirmedOperations.created) {
		try {
			console.log('[Workflow] Creating entity:', entity.name, entity.type);
			const result = await tools.createEntity({
				entityType: entity.type as any,
				name: entity.name,
				metadata: { source: 'diary_analysis' }
			});

			if (result.success && result.data?.entityId) {
				createdEntities.push({
					entityId: result.data.entityId,
					name: entity.name,
					type: entity.type
				});
				console.log('[Workflow] Created entity:', result.data.entityId);
			} else {
				console.log('[Workflow] Failed to create entity:', result.error);
			}
		} catch (error) {
			console.error('[Workflow] Error creating entity:', error);
		}
	}

	// Update the confirmed operations with actual entity IDs
	const updatedConfirmedOps = {
		...state.confirmedOperations,
		created: createdEntities
	};

	const summary = buildSummary({ ...state, confirmedOperations: updatedConfirmedOps });

	return {
		state: {
			...state,
			confirmedOperations: updatedConfirmedOps,
			currentPhase: AnalysisPhase.Complete,
			aiResponse: summary,
			awaitingConfirmation: false
		},
		aiResponse: summary
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
		const names = state.confirmedOperations.created.map(e => `**${e.name}**`).join('、');
		parts.push(`已创建实体：${names}`);
	}

	if (linkedCount > 0) {
		parts.push(`已建立关联：${linkedCount}条`);
	}

	parts.push('#工作');

	return parts.join('。') || '分析完成';
}

/**
 * Convert workflow state to session format
 */
export function workflowStateToSession(state: WorkflowState) {
	return {
		blockId: state.blockId,
		content: state.blockContent,
		messages: state.messages.map((m: any) => ({
			role: m._getType?.() === 'ai' ? 'assistant' : m._getType?.() === 'human' ? 'user' : 'system',
			content: typeof m.content === 'string' ? m.content : ''
		})),
		analysisResult: null,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		currentPhase: state.currentPhase
	};
}

/**
 * Continue analysis workflow with user confirmation
 */
export async function continueAnalysisWorkflow(
	state: WorkflowState,
	userMessage: string,
	llm: any,
	tools: EntityTools
): Promise<{ state: WorkflowState; aiResponse: string }> {
	console.log('[Workflow] continueAnalysisWorkflow, awaitingConfirmation:', state.awaitingConfirmation);

	if (!state.awaitingConfirmation || !state.pendingOperations) {
		// Not waiting for confirmation, treat as regular continuation
		console.log('[Workflow] Not awaiting confirmation, running detection again');
		const result = await runDetectionStep(state, llm, tools);
		return result;
	}

	// Parse user confirmation
	const confirmation = parseUserConfirmation(userMessage, state.pendingOperations);
	console.log('[Workflow] Parsed confirmation:', confirmation);

	// Apply confirmation to get confirmed operations
	const confirmedOps = applyConfirmation(state.pendingOperations, confirmation);
	console.log('[Workflow] Confirmed operations:', confirmedOps);

	// Update state with confirmed operations and set awaitingConfirmation to false
	// Also clear pendingOperations since we've handled them
	state = {
		...state,
		awaitingConfirmation: false,
		pendingOperations: null,  // Clear pending since we confirmed them
		confirmedOperations: {
			created: [...state.confirmedOperations.created, ...confirmedOps.created],
			linked: [...state.confirmedOperations.linked, ...confirmedOps.linked],
			updated: [...state.confirmedOperations.updated, ...confirmedOps.updated]
		},
		messages: [...state.messages, { _getType: () => 'human', content: userMessage } as any]
	};

	// Execute confirmed operations
	const execResult = await executeConfirmedOperations(state, tools);
	state = execResult.state;

	// If no confirmation needed or cancelled, check if more entities to process
	if (state.pendingOperations?.toCreate && state.pendingOperations.toCreate.length > 0) {
		// More entities pending, need another confirmation
		const processingResult = runProcessingStep(state);
		return {
			state: processingResult.state,
			aiResponse: processingResult.confirmationText
		};
	}

	return {
		state,
		aiResponse: execResult.aiResponse
	};
}

// Re-export types
export type { WorkflowState, PendingOperations, DetectionResult } from './workflow';
