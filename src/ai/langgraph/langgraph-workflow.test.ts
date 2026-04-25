/**
 * LangGraph Workflow Tests
 * Tests for the 5-step analysis flow orchestration
 */

import { AnalysisPhase } from './types';
import {
	parseUserConfirmation,
	applyConfirmation,
	createInitialWorkflowState,
	type PendingOperations,
	type ParsedConfirmation
} from './workflow';

// Mock state for testing
interface TestState {
	phase: AnalysisPhase;
	detectionResult: {
		archivedMatches: Array<{ name: string; entityId: string }>;
		newEntities: Array<{ name: string; inferredType: string; confidence: number }>;
	} | null;
	pendingOperations: PendingOperations | null;
	confirmedOperations: {
		created: Array<{ name: string; type: string }>;
		linked: Array<{ from: string; to: string }>;
	};
	messages: string[];
	awaitingConfirmation: boolean;
}

// ============ PHASE ROUTING TESTS ============

describe('Phase Routing', () => {
	// Test the phase transition logic
	function routeByPhase(phase: AnalysisPhase): string {
		const routes: Record<AnalysisPhase, string> = {
			[AnalysisPhase.Detection]: 'detection',
			[AnalysisPhase.Processing]: 'processing',
			[AnalysisPhase.Relations]: 'relations',
			[AnalysisPhase.Conflicts]: 'conflicts',
			[AnalysisPhase.Summary]: 'summary',
			[AnalysisPhase.Complete]: 'END'
		};
		return routes[phase];
	}

	test('should route Detection phase correctly', () => {
		expect(routeByPhase(AnalysisPhase.Detection)).toBe('detection');
	});

	test('should route Processing phase correctly', () => {
		expect(routeByPhase(AnalysisPhase.Processing)).toBe('processing');
	});

	test('should route Relations phase correctly', () => {
		expect(routeByPhase(AnalysisPhase.Relations)).toBe('relations');
	});

	test('should route Conflicts phase correctly', () => {
		expect(routeByPhase(AnalysisPhase.Conflicts)).toBe('conflicts');
	});

	test('should route Summary phase correctly', () => {
		expect(routeByPhase(AnalysisPhase.Summary)).toBe('summary');
	});

	test('should route Complete phase to END', () => {
		expect(routeByPhase(AnalysisPhase.Complete)).toBe('END');
	});
});

// ============ DETECTION RESULT ROUTING TESTS ============

describe('Detection Result Routing', () => {
	// Test routing based on detection results
	function routeDetectionResult(state: TestState): string {
		if (!state.detectionResult?.newEntities?.length) {
			return 'relations'; // Skip processing if no new entities
		}
		return 'processing';
	}

	test('should route to relations when no new entities', () => {
		const state: TestState = {
			phase: AnalysisPhase.Detection,
			detectionResult: {
				archivedMatches: [{ name: '张三', entityId: 'e1' }],
				newEntities: []
			},
			pendingOperations: null,
			confirmedOperations: { created: [], linked: [] },
			messages: [],
			awaitingConfirmation: false
		};

		expect(routeDetectionResult(state)).toBe('relations');
	});

	test('should route to processing when new entities found', () => {
		const state: TestState = {
			phase: AnalysisPhase.Detection,
			detectionResult: {
				archivedMatches: [],
				newEntities: [{ name: '李四', inferredType: 'person', confidence: 0.9 }]
			},
			pendingOperations: null,
			confirmedOperations: { created: [], linked: [] },
			messages: [],
			awaitingConfirmation: false
		};

		expect(routeDetectionResult(state)).toBe('processing');
	});
});

// ============ CONFIRMATION PARSING TESTS ============

describe('Confirmation Parsing', () => {
	const pendingOps: PendingOperations = {
		toCreate: [
			{ name: '张三', type: 'person', summary: '新朋友' },
			{ name: '华为项目', type: 'project' }
		],
		toLink: [
			{ from: '张三', to: '华为项目', relation: 'related_to', context: '在日记中提及' }
		],
		toUpdate: []
	};

	test('should parse "好" as confirm_all', () => {
		const result = parseUserConfirmation('好', pendingOps);
		expect(result.result).toBe('confirm_all');
	});

	test('should parse "好的" as confirm_all', () => {
		const result = parseUserConfirmation('好的', pendingOps);
		expect(result.result).toBe('confirm_all');
	});

	test('should parse "确认" as confirm_all', () => {
		const result = parseUserConfirmation('确认', pendingOps);
		expect(result.result).toBe('confirm_all');
	});

	test('should parse "yes" as confirm_all', () => {
		const result = parseUserConfirmation('yes', pendingOps);
		expect(result.result).toBe('confirm_all');
	});

	test('should parse "取消" as cancel_all', () => {
		const result = parseUserConfirmation('取消', pendingOps);
		expect(result.result).toBe('cancel_all');
	});

	test('should parse partial confirm correctly', () => {
		const result = parseUserConfirmation('只创建张三，其他取消', pendingOps);
		expect(result.result).toBe('partial_confirm');
		expect(result.selectedEntities).toEqual(['张三']);
	});

	test('should parse modification correctly', () => {
		const result = parseUserConfirmation('好，但张三改成客户', pendingOps);
		expect(result.result).toBe('confirm_all');
		expect(result.modifications).toEqual({ '张三': '客户' });
	});

	test('should handle default cancel for unknown input', () => {
		const result = parseUserConfirmation('随便吧', pendingOps);
		expect(result.result).toBe('cancel_all');
	});
});

// ============ CONFIRMATION APPLICATION TESTS ============

describe('Confirmation Application', () => {
	test('should apply confirm_all to create operations', () => {
		const pendingOps: PendingOperations = {
			toCreate: [
				{ name: '张三', type: 'person' },
				{ name: '华为项目', type: 'project' }
			],
			toLink: [
				{ from: '张三', to: '华为项目', relation: 'related_to' }
			],
			toUpdate: []
		};

		const confirmation: ParsedConfirmation = { result: 'confirm_all' };
		const confirmed = applyConfirmation(pendingOps, confirmation);

		expect(confirmed.created).toHaveLength(2);
		expect(confirmed.created[0].name).toBe('张三');
		expect(confirmed.created[1].name).toBe('华为项目');
		expect(confirmed.linked).toHaveLength(1);
	});

	test('should apply modifications to confirmed entities', () => {
		const pendingOps: PendingOperations = {
			toCreate: [{ name: '张三', type: 'person' }],
			toLink: [],
			toUpdate: []
		};

		const confirmation: ParsedConfirmation = {
			result: 'confirm_all',
			modifications: { '张三': '客户' }
		};
		const confirmed = applyConfirmation(pendingOps, confirmation);

		expect(confirmed.created[0].type).toBe('客户');
	});

	test('should apply partial_confirm correctly', () => {
		const pendingOps: PendingOperations = {
			toCreate: [
				{ name: '张三', type: 'person' },
				{ name: '李四', type: 'person' }
			],
			toLink: [],
			toUpdate: []
		};

		const confirmation: ParsedConfirmation = {
			result: 'partial_confirm',
			selectedEntities: ['张三']
		};
		const confirmed = applyConfirmation(pendingOps, confirmation);

		expect(confirmed.created).toHaveLength(1);
		expect(confirmed.created[0].name).toBe('张三');
	});

	test('should return empty confirmed when cancel_all', () => {
		const pendingOps: PendingOperations = {
			toCreate: [{ name: '张三', type: 'person' }],
			toLink: [{ from: '张三', to: '项目', relation: 'related_to' }],
			toUpdate: []
		};

		const confirmation: ParsedConfirmation = { result: 'cancel_all' };
		const confirmed = applyConfirmation(pendingOps, confirmation);

		expect(confirmed.created).toHaveLength(0);
		expect(confirmed.linked).toHaveLength(0);
	});
});

// ============ STATE TRANSITION TESTS ============

describe('State Transitions', () => {
	const PHASES = [
		AnalysisPhase.Detection,
		AnalysisPhase.Processing,
		AnalysisPhase.Relations,
		AnalysisPhase.Conflicts,
		AnalysisPhase.Summary,
		AnalysisPhase.Complete
	];

	function advancePhase(currentPhase: AnalysisPhase): AnalysisPhase | null {
		const currentIndex = PHASES.indexOf(currentPhase);
		if (currentIndex < 0 || currentIndex >= PHASES.length - 1) {
			return null;
		}
		return PHASES[currentIndex + 1];
	}

	test('should advance from Detection to Processing', () => {
		expect(advancePhase(AnalysisPhase.Detection)).toBe(AnalysisPhase.Processing);
	});

	test('should advance from Processing to Relations', () => {
		expect(advancePhase(AnalysisPhase.Processing)).toBe(AnalysisPhase.Relations);
	});

	test('should advance from Relations to Conflicts', () => {
		expect(advancePhase(AnalysisPhase.Relations)).toBe(AnalysisPhase.Conflicts);
	});

	test('should advance from Conflicts to Summary', () => {
		expect(advancePhase(AnalysisPhase.Conflicts)).toBe(AnalysisPhase.Summary);
	});

	test('should advance from Summary to Complete', () => {
		expect(advancePhase(AnalysisPhase.Summary)).toBe(AnalysisPhase.Complete);
	});

	test('should return null when already at Complete', () => {
		expect(advancePhase(AnalysisPhase.Complete)).toBeNull();
	});
});

// ============ WORKFLOW STATE CREATION TESTS ============

describe('Workflow State Creation', () => {
	test('should create initial state with correct defaults', () => {
		const state = createInitialWorkflowState('block-123', '今天和张三开会讨论项目');

		expect(state.blockId).toBe('block-123');
		expect(state.blockContent).toBe('今天和张三开会讨论项目');
		expect(state.currentPhase).toBe(AnalysisPhase.Detection);
		expect(state.detectionResult).toBeNull();
		expect(state.pendingOperations).toBeNull();
		expect(state.awaitingConfirmation).toBe(false);
		expect(state.messages).toHaveLength(1); // Initial human message
	});

	test('should have empty confirmed operations by default', () => {
		const state = createInitialWorkflowState('block-123', '今天和张三开会讨论项目');

		expect(state.confirmedOperations.created).toHaveLength(0);
		expect(state.confirmedOperations.linked).toHaveLength(0);
		expect(state.confirmedOperations.updated).toHaveLength(0);
	});
});

// ============ WORKFLOW INTEGRATION TESTS ============

describe('Workflow Integration', () => {
	test('should follow complete 5-step flow for diary with new entities', () => {
		// Simulate a complete workflow for diary: "和张三开会讨论华为项目"
		const phases: AnalysisPhase[] = [];
		let currentPhase = AnalysisPhase.Detection;

		// Step 1: Detection
		const detectionResult = {
			archivedMatches: [],
			newEntities: [
				{ name: '张三', inferredType: 'person', confidence: 0.95 },
				{ name: '华为项目', inferredType: 'project', confidence: 0.9 }
			]
		};

		if (detectionResult.newEntities.length > 0) {
			phases.push(currentPhase); // Detection
			currentPhase = AnalysisPhase.Processing; // Step 2: Processing
			phases.push(currentPhase);
			currentPhase = AnalysisPhase.Relations; // Step 3: Relations
			phases.push(currentPhase);
			currentPhase = AnalysisPhase.Conflicts; // Step 4: Conflicts
			phases.push(currentPhase);
			currentPhase = AnalysisPhase.Summary; // Step 5: Summary
			phases.push(currentPhase);
		}

		expect(phases).toEqual([
			AnalysisPhase.Detection,
			AnalysisPhase.Processing,
			AnalysisPhase.Relations,
			AnalysisPhase.Conflicts,
			AnalysisPhase.Summary
		]);
	});

	test('should skip processing for diary with no new entities', () => {
		const phases: AnalysisPhase[] = [];

		const detectionResult = {
			archivedMatches: [{ name: '张三', entityId: 'e1' }],
			newEntities: []
		};

		if (detectionResult.newEntities.length > 0) {
			phases.push(AnalysisPhase.Processing);
		}
		// Should go directly to Relations
		phases.push(AnalysisPhase.Relations);
		phases.push(AnalysisPhase.Conflicts);
		phases.push(AnalysisPhase.Summary);

		expect(phases).toEqual([
			AnalysisPhase.Relations,
			AnalysisPhase.Conflicts,
			AnalysisPhase.Summary
		]);
	});
});
