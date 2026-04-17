/**
 * Session Manager
 * Manages per-block AI conversation sessions with vault persistence
 */

import { App, TFile } from 'obsidian';
import { BlockSession, AnalysisPhase, ChatMessage, AnalysisResult } from '../entities/types';

const SESSIONS_FOLDER = '.lifewiki/sessions';

export class SessionManager {
	private sessions: Map<string, BlockSession> = new Map();
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
	 */
	getOrCreateSession(blockId: string): BlockSession {
		let session = this.sessions.get(blockId);

		if (!session) {
			const now = new Date().toISOString();
			session = {
				blockId,
				content: '',
				messages: [],
				analysisResult: null,
				createdAt: now,
				updatedAt: now,
				currentPhase: AnalysisPhase.People
			};
			this.sessions.set(blockId, session);
			this.saveSession(blockId);
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
		this.saveSession(blockId);

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
		this.saveSession(blockId);

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
		this.saveSession(blockId);

		return true;
	}

	/**
	 * Set the content for a session
	 */
	setContent(blockId: string, content: string): boolean {
		const session = this.sessions.get(blockId);
		if (!session) return false;

		session.content = content;
		session.updatedAt = new Date().toISOString();
		this.saveSession(blockId);

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
}
