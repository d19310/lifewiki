/**
 * Entity Types
 * Core type definitions for LifeWiki entities
 */

export type EntityType = 'person' | 'project' | 'thing' | 'idea' | 'knowledge';

export interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface ChatResponse {
	content: string;
	usage?: {
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
	};
}

export interface RelatedEntity {
	entityId: string | null;  // null if not yet created
	relation: 'mentioned_in' | 'part_of' | 'related_to' | 'update_of' | 'about';
	context: string;
}

export interface Interaction {
	timestamp: string;  // ISO 8601
	type: 'diary_mention' | 'ai_analysis' | 'user_feedback' | 'update';
	content: string;
	sourceBlockId?: string;
}

export interface Entity {
	// Core identification
	id: string;
	type: EntityType;
	filePath: string;

	// AI-friendly fields
	title: string;          // Standardized title
	titleRaw: string;       // Original mention form
	aliases: string[];      // AI-inferred aliases/nicknames
	tags: string[];         // AI-generated tags
	summary: string;        // One-line AI summary

	// Confidence & verification
	confidence: number;      // 0-1 AI confidence score
	verificationStatus: 'pending' | 'verified' | 'rejected';

	// Timestamps
	createdAt: string;      // ISO 8601
	createdBy: 'ai' | 'human';
	lastUpdated: string;    // ISO 8601
	lastVerifiedAt?: string | null;

	// Relationships
	relatedEntities: RelatedEntity[];
	interactions: Interaction[];

	// Type-specific metadata
	metadata: Record<string, any>;
}

// Input type for creating new entity (filePath is assigned on creation)
export type EntityCreateInput = Omit<Entity, 'id' | 'filePath'>;

export interface Block {
	id: string;
	timestamp: string;      // HH:mm format
	content: string;
	parentId: string | null; // null for top-level blocks
	children: string[];      // Child block IDs
	category: '工作' | '个人' | '待确认';
	source: 'Lifewiki' | string;  // Channel/source
	aiAnalysis?: AnalysisResult;
}

export interface AnalysisResult {
	blockId: string;
	timestamp: string;      // ISO 8601
	category: '工作' | '个人' | '待确认';
	source?: string;
	entities: {
		people: EntityPreview[];
		projects: EntityPreview[];
		things: EntityPreview[];
		ideas: EntityPreview[];
		knowledge: EntityPreview[];
	};
	needsConfirmation: string[];
	aiResponse: string;
}

export interface EntityPreview {
	type: EntityType;
	name: string;
	confidence: number;
	context: string;
	isArchived: boolean;
	newEntity?: boolean;  // True if this is a newly identified entity
}

/**
 * Analysis phases for progressive entity analysis
 * Order: people -> projects -> things -> ideas -> knowledge -> complete
 */
export enum AnalysisPhase {
	People = 'people',
	Projects = 'projects',
	Things = 'things',
	Ideas = 'ideas',
	Knowledge = 'knowledge',
	Complete = 'complete'
}

/**
 * BlockSession - stores conversation history and analysis state for a single block
 */
export interface BlockSession {
	blockId: string;
	messages: ChatMessage[];
	analysisResult: AnalysisResult | null;
	createdAt: string;       // ISO 8601
	updatedAt: string;       // ISO 8601
	currentPhase: AnalysisPhase;
}
