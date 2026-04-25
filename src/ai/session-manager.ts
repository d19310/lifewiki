/**
 * Session Manager
 * Manages per-block AI conversation sessions with vault persistence
 */

import { App, TFile } from 'obsidian';
import { BlockSession, AnalysisPhase, ChatMessage, AnalysisResult, ChatSession } from '../entities/types';
import type { BlockMemoryAnalysis } from '../memory/types';

const SESSIONS_FOLDER = '.lifewiki/sessions';
const CHAT_SESSION_KEY = 'chat:global';

export class SessionManager {
	private sessions: Map<string, BlockSession> = new Map();
	private chatSession: ChatSession | null = null;
	private activeBlockId: string | null = null;
	private app: App;
	private saveDebounceTimer: NodeJS.Timeout | null = null;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Initialize - load all sessions from vault
	 */
	async initialize(): Promise<void> {
		await this.ensureFolder();
		await this.loadAllSessions();
	}

	/**
	 * Ensure the sessions folder exists
	 */
	private async ensureFolder(): Promise<void> {
		const folder = this.app.vault.getAbstractFileByPath(SESSIONS_FOLDER);
		if (!folder || folder instanceof TFile) {
			try {
				await this.app.vault.createFolder(SESSIONS_FOLDER);
			} catch (e) {
				// Folder might already exist - that's fine
				if ((e as Error).message !== 'Folder already exists.') {
					console.warn('[SessionManager] ensureFolder error:', e);
				}
			}
		}
	}

	/**
	 * Load all sessions from vault
	 */
	private async loadAllSessions(): Promise<void> {
		let loadedCount = 0;

		try {
			const files = await this.app.vault.adapter.list(SESSIONS_FOLDER);
			const sessionFiles = files.files.filter(f => f.endsWith('.json'));

			for (const filePath of sessionFiles) {
				try {
					const content = await this.app.vault.adapter.read(filePath);
					const session: BlockSession = JSON.parse(content);
					this.sessions.set(session.blockId, session);
					loadedCount++;
				} catch (e) {
					console.error(`[SessionManager] Failed to load session ${filePath}:`, e);
				}
			}
		} catch (e) {
			// Folder might not exist yet
		}
	}

	/**
	 * Save a session to vault immediately
	 */
	private async saveSession(blockId: string): Promise<void> {
		const session = this.sessions.get(blockId);
		if (!session) return;

		// Cancel any pending debounced save
		if (this.saveDebounceTimer) {
			clearTimeout(this.saveDebounceTimer);
			this.saveDebounceTimer = null;
		}

		try {
			const filePath = `${SESSIONS_FOLDER}/${blockId}.json`;
			// Clone the session to avoid reference issues
			const sessionClone = JSON.parse(JSON.stringify(session));
			const content = JSON.stringify(sessionClone, null, 2);

			// Use adapter.write which creates or overwrites atomically
			await this.app.vault.adapter.write(filePath, content);
			console.log(`[SessionManager] Saved session ${blockId}, messages: ${session.messages.length}`);
		} catch (e) {
			console.error(`[SessionManager] Failed to save session ${blockId}:`, e);
		}
	}

	/**
	 * Get or create a session for a block
	 * If the block is a child block (has parentId), route to parent's session
	 */
	getOrCreateSession(blockId: string, parentId: string | null = null): BlockSession {
		// If this is a child block, use parent's session
		const effectiveBlockId = parentId || blockId;

		let session = this.sessions.get(effectiveBlockId);

		if (!session) {
			const now = new Date().toISOString();
			session = {
				blockId: effectiveBlockId,
				content: '',
				messages: [],
				analysisResult: null,
				createdAt: now,
				updatedAt: now,
				currentPhase: AnalysisPhase.People
			};
			this.sessions.set(effectiveBlockId, session);
			this.saveSession(effectiveBlockId);
		}

		return session;
	}

	/**
	 * Replace or create a full block session.
	 * This is used by LifeWiki 2.0 capture analysis so memoryAnalysis is not
	 * flattened back into the legacy AnalysisResult shape.
	 */
	setSession(blockId: string, session: BlockSession, parentId: string | null = null): BlockSession {
		const effectiveBlockId = parentId || blockId;
		const now = new Date().toISOString();
		const existing = this.sessions.get(effectiveBlockId);
		const nextSession: BlockSession = {
			...session,
			blockId: effectiveBlockId,
			content: session.content || existing?.content || '',
			reviewCards: session.reviewCards || existing?.reviewCards,
			createdAt: session.createdAt || existing?.createdAt || now,
			updatedAt: now,
			currentPhase: session.currentPhase || AnalysisPhase.Complete
		};

		this.sessions.set(effectiveBlockId, nextSession);
		this.saveSession(effectiveBlockId);
		return nextSession;
	}

	/**
	 * Get session by blockId
	 * If block is a child block, returns parent's session
	 */
	getSession(blockId: string, parentId: string | null = null): BlockSession | undefined {
		const effectiveBlockId = parentId || blockId;
		return this.sessions.get(effectiveBlockId);
	}

	/**
	 * Add a message to a session
	 * If block is a child, routes to parent's session
	 */
	addMessage(blockId: string, message: ChatMessage, parentId: string | null = null): BlockSession | undefined {
		const effectiveBlockId = parentId || blockId;
		const session = this.sessions.get(effectiveBlockId);
		if (!session) return undefined;

		session.messages.push(message);
		session.updatedAt = new Date().toISOString();
		this.saveSession(effectiveBlockId);

		return session;
	}

	/**
	 * Update the current analysis phase for a session
	 * If block is a child, routes to parent's session
	 */
	updatePhase(blockId: string, phase: AnalysisPhase, parentId: string | null = null): boolean {
		const effectiveBlockId = parentId || blockId;
		const session = this.sessions.get(effectiveBlockId);
		if (!session) return false;

		session.currentPhase = phase;
		session.updatedAt = new Date().toISOString();
		this.saveSession(effectiveBlockId);

		return true;
	}

	/**
	 * Set the analysis result for a session
	 * If block is a child, routes to parent's session
	 */
	setAnalysisResult(blockId: string, result: AnalysisResult, parentId: string | null = null): boolean {
		const effectiveBlockId = parentId || blockId;
		const session = this.sessions.get(effectiveBlockId);
		if (!session) return false;

		session.analysisResult = result;
		session.updatedAt = new Date().toISOString();
		this.saveSession(effectiveBlockId);

		return true;
	}

	/**
	 * Set the native LifeWiki 2.0 memory analysis for a session.
	 */
	setMemoryAnalysis(blockId: string, result: BlockMemoryAnalysis, parentId: string | null = null): boolean {
		const effectiveBlockId = parentId || blockId;
		const session = this.sessions.get(effectiveBlockId);
		if (!session) return false;

		session.memoryAnalysis = result;
		session.updatedAt = new Date().toISOString();
		session.currentPhase = AnalysisPhase.Complete;
		this.saveSession(effectiveBlockId);

		return true;
	}

	updateReviewCard(
		blockId: string,
		cardId: string,
		update: { status?: 'pending' | 'confirmed' | 'skipped'; supplement?: string },
		parentId: string | null = null
	): boolean {
		const effectiveBlockId = parentId || blockId;
		const session = this.sessions.get(effectiveBlockId);
		if (!session) return false;

		const existing = session.reviewCards?.[cardId];
		session.reviewCards = {
			...(session.reviewCards || {}),
			[cardId]: {
				status: update.status || existing?.status || 'pending',
				supplement: update.supplement !== undefined ? update.supplement : existing?.supplement,
				updatedAt: new Date().toISOString()
			}
		};
		session.updatedAt = new Date().toISOString();
		this.saveSession(effectiveBlockId);
		return true;
	}

	/**
	 * Set the content for a session
	 * If block is a child, routes to parent's session
	 */
	setContent(blockId: string, content: string, parentId: string | null = null): boolean {
		const effectiveBlockId = parentId || blockId;
		const session = this.sessions.get(effectiveBlockId);
		if (!session) return false;

		session.content = content;
		session.updatedAt = new Date().toISOString();
		this.saveSession(effectiveBlockId);

		return true;
	}

	/**
	 * Clear a specific session
	 */
	async clearSession(blockId: string): Promise<boolean> {
		const deleted = this.sessions.delete(blockId);
		if (deleted) {
			// Also delete from vault
			const filePath = `${SESSIONS_FOLDER}/${blockId}.json`;
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile) {
				await this.app.vault.delete(file);
			}
		}
		return deleted;
	}

	/**
	 * Clear all sessions
	 */
	async clearAllSessions(): Promise<void> {
		// Delete all session files from vault
		const folder = this.app.vault.getAbstractFileByPath(SESSIONS_FOLDER);
		if (folder && folder instanceof TFile === false) {
			for (const file of folder.children) {
				if (file instanceof TFile) {
					await this.app.vault.delete(file);
				}
			}
		}
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

	/**
	 * Get or create chat session
	 */
	getOrCreateChatSession(): ChatSession {
		if (!this.chatSession) {
			const now = new Date().toISOString();
			this.chatSession = {
				blockId: CHAT_SESSION_KEY,
				messages: [],
				createdAt: now,
				updatedAt: now
			};
		}
		return this.chatSession;
	}

	/**
	 * Get chat session
	 */
	getChatSession(): ChatSession | null {
		return this.chatSession;
	}

	/**
	 * Add message to chat session
	 */
	addChatMessage(message: ChatMessage): ChatSession | undefined {
		const session = this.getOrCreateChatSession();
		session.messages.push(message);
		session.updatedAt = new Date().toISOString();
		return session;
	}

	/**
	 * Clear chat session
	 */
	clearChatSession(): void {
		this.chatSession = null;
	}
}
