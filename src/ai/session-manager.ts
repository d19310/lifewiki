/**
 * Session Manager
 * Manages per-block AI conversation sessions
 */

import { BlockSession, AnalysisPhase, ChatMessage, AnalysisResult } from '../entities/types';

export class SessionManager {
	private sessions: Map<string, BlockSession> = new Map();
	private activeBlockId: string | null = null;

	/**
	 * Get or create a session for a block
	 */
	getOrCreateSession(blockId: string): BlockSession {
		let session = this.sessions.get(blockId);

		if (!session) {
			const now = new Date().toISOString();
			session = {
				blockId,
				messages: [],
				analysisResult: null,
				createdAt: now,
				updatedAt: now,
				currentPhase: AnalysisPhase.People
			};
			this.sessions.set(blockId, session);
		}

		return session;
	}

	/**
	 * Get session by blockId
	 */
	getSession(blockId: string): BlockSession | undefined {
		return this.sessions.get(blockId);
	}

	/**
	 * Add a message to a session
	 */
	addMessage(blockId: string, message: ChatMessage): BlockSession | undefined {
		const session = this.sessions.get(blockId);
		if (!session) return undefined;

		session.messages.push(message);
		session.updatedAt = new Date().toISOString();

		return session;
	}

	/**
	 * Update the current analysis phase for a session
	 */
	updatePhase(blockId: string, phase: AnalysisPhase): boolean {
		const session = this.sessions.get(blockId);
		if (!session) return false;

		session.currentPhase = phase;
		session.updatedAt = new Date().toISOString();

		return true;
	}

	/**
	 * Set the analysis result for a session
	 */
	setAnalysisResult(blockId: string, result: AnalysisResult): boolean {
		const session = this.sessions.get(blockId);
		if (!session) return false;

		session.analysisResult = result;
		session.updatedAt = new Date().toISOString();

		return true;
	}

	/**
	 * Clear a specific session
	 */
	clearSession(blockId: string): boolean {
		return this.sessions.delete(blockId);
	}

	/**
	 * Clear all sessions
	 */
	clearAllSessions(): void {
		this.sessions.clear();
		this.activeBlockId = null;
	}

	/**
	 * Set the active block (the one currently displayed in AI panel)
	 */
	setActiveBlock(blockId: string): void {
		this.activeBlockId = blockId;
	}

	/**
	 * Get the active block ID
	 */
	getActiveBlockId(): string | null {
		return this.activeBlockId;
	}

	/**
	 * Get the active session
	 */
	getActiveSession(): BlockSession | null {
		if (!this.activeBlockId) return null;
		return this.sessions.get(this.activeBlockId) || null;
	}

	/**
	 * Get all session block IDs
	 */
	getAllSessionIds(): string[] {
		return Array.from(this.sessions.keys());
	}
}
