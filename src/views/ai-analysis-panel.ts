/**
 * AI Analysis Panel View
 * Displayed as a right sidebar in Obsidian
 * Shows entity analysis and allows chatting with AI
 * Chat-only UI with per-block sessions
 */

import { ItemView, WorkspaceLeaf } from 'obsidian';
import type LifeWikiPlugin from '../main';
import { AnalysisResult, BlockSession, ChatMessage } from '../entities/types';

export const VIEW_TYPE_AI_ANALYSIS = 'lifewiki-ai-analysis';

export class AIAnalysisPanelView extends ItemView {
	private plugin: LifeWikiPlugin;
	private activeBlockId: string | null = null;
	private chatMessagesEl: HTMLElement | null = null;
	private inputTextarea: HTMLTextAreaElement | null = null;
	private sendIconEl: HTMLElement | null = null;
	private isLoading: boolean = false;
	private emptyStateEl: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: LifeWikiPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_AI_ANALYSIS;
	}

	getDisplayText(): string {
		return 'AI洞察';
	}

	async onOpen() {
		const container = this.containerEl;
		container.empty();

		const mainContainer = container.createEl('div', {
			cls: 'lifewiki-ai-panel',
			attr: { style: 'height: 100%; display: flex; flex-direction: column;' }
		});

		// Header
		const header = mainContainer.createEl('div', {
			attr: { style: 'font-weight: 600; font-size: 14px; padding: 16px; border-bottom: 1px solid var(--background-modifier-border); flex-shrink: 0;' }
		});
		header.createEl('span', { text: '🔍 ' });
		header.createEl('span', { text: 'AI洞察' });

		// Scrollable chat area
		const scrollContent = mainContainer.createEl('div', {
			cls: 'lifewiki-ai-scroll',
			attr: { style: 'flex: 1; overflow-y: auto;' }
		});

		// Empty state message
		this.emptyStateEl = scrollContent.createEl('div', {
			cls: 'lifewiki-empty-state',
			attr: { style: 'display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); text-align: center; padding: 20px;' }
		});

		this.emptyStateEl.createEl('div', {
			text: '👋',
			attr: { style: 'font-size: 48px; margin-bottom: 16px;' }
		});

		this.emptyStateEl.createEl('div', {
			text: '选择或输入一条日记',
			attr: { style: 'font-size: 14px; margin-bottom: 8px;' }
		});

		this.emptyStateEl.createEl('div', {
			text: 'AI 将帮你分析和归档实体',
			attr: { style: 'font-size: 12px;' }
		});

		// Chat messages area
		this.chatMessagesEl = scrollContent.createEl('div', {
			cls: 'lifewiki-chat-messages',
			attr: { style: 'padding: 16px; display: none;' }
		});

		// Input area at bottom
		const inputArea = mainContainer.createEl('div', {
			cls: 'lifewiki-ai-input-area',
			attr: { style: 'padding: 12px 16px; border-top: 1px solid var(--background-modifier-border); flex-shrink: 0;' }
		});

		// Input wrapper for textarea + send icon
		const inputWrapper = inputArea.createEl('div', {
			cls: 'lifewiki-input-wrapper',
			attr: { style: 'position: relative; display: flex; align-items: flex-end;' }
		});

		// Model selector (left side)
		const modelSelector = inputArea.createEl('div', {
			cls: 'lifewiki-model-selector',
			attr: { style: 'position: absolute; bottom: 12px; left: 16px; z-index: 1;' }
		});

		const modelSelect = modelSelector.createEl('select', {
			attr: {
				style: 'background: transparent; border: none; color: var(--text-muted); font-size: 12px; cursor: pointer; outline: none;'
			}
		});

		// Add model options
		const models = ['MiniMax', 'OpenAI', 'Claude', 'Ollama'];
		for (const model of models) {
			modelSelect.createEl('option', { text: model, value: model.toLowerCase() });
		}

		// Textarea
		this.inputTextarea = inputWrapper.createEl('textarea', {
			attr: {
				placeholder: '和 AI 对话...',
				rows: '2',
				style: 'width: 100%; resize: none; border: 1px solid var(--background-modifier-border); border-radius: 8px; padding: 8px 40px 8px 80px; font-size: 13px; background: var(--background-secondary); color: var(--text-primary);'
			}
		}) as HTMLTextAreaElement;

		// Send arrow icon (right side)
		this.sendIconEl = inputWrapper.createEl('div', {
			cls: 'lifewiki-send-icon',
			attr: {
				style: 'position: absolute; right: 12px; bottom: 14px; color: var(--text-muted); cursor: default; font-size: 16px; opacity: 0.5; transition: opacity 0.2s, color 0.2s;'
			}
		});
		this.sendIconEl.innerHTML = '&#10148;'; // → arrow

		// Update send icon state based on input
		this.inputTextarea.addEventListener('input', () => {
			this.updateSendIconState();
		});

		// Enter to send, Shift+Enter for newline
		this.inputTextarea.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.sendMessage();
			}
		});

		// Click send icon to send
		this.sendIconEl.addEventListener('click', () => {
			const content = this.inputTextarea?.value.trim();
			if (content) {
				this.sendMessage();
			}
		});

		// Initial state
		this.showEmptyState();
	}

	private updateSendIconState() {
		if (!this.sendIconEl || !this.inputTextarea) return;

		const hasContent = this.inputTextarea.value.trim().length > 0;
		this.sendIconEl.setAttribute(
			'style',
			`position: absolute; right: 12px; bottom: 14px; color: ${hasContent ? 'var(--interactive-accent)' : 'var(--text-muted)'}; cursor: ${hasContent ? 'pointer' : 'default'}; font-size: 16px; opacity: ${hasContent ? 1 : 0.5}; transition: opacity 0.2s, color 0.2s;`
		);
	}

	private showEmptyState() {
		if (this.emptyStateEl) {
			this.emptyStateEl.style.display = 'flex';
		}
		if (this.chatMessagesEl) {
			this.chatMessagesEl.style.display = 'none';
		}
	}

	private showChatState() {
		if (this.emptyStateEl) {
			this.emptyStateEl.style.display = 'none';
		}
		if (this.chatMessagesEl) {
			this.chatMessagesEl.style.display = 'block';
		}
	}

	/**
	 * Set the active block and load its session
	 */
	setActiveBlock(blockId: string, blockContent: string) {
		this.activeBlockId = blockId;

		// Get or create session
		const sessionManager = this.plugin.getSessionManager();
		const session = sessionManager.getOrCreateSession(blockId);

		// Show chat UI
		this.showChatState();

		// Render existing messages
		this.renderSession(session);
	}

	/**
	 * Start a new session for a new block
	 */
	startNewSession(blockId: string, blockContent: string, initialResponse: string) {
		this.activeBlockId = blockId;
		this.showChatState();

		// Clear and render initial response
		if (this.chatMessagesEl) {
			this.chatMessagesEl.empty();
		}

		if (initialResponse) {
			this.addChatMessage('assistant', initialResponse);
		}
	}

	/**
	 * Render session messages
	 */
	private renderSession(session: BlockSession) {
		if (!this.chatMessagesEl) return;

		this.chatMessagesEl.empty();

		// Render all messages in order
		for (const message of session.messages) {
			this.addChatMessage(message.role, message.content);
		}
	}

	/**
	 * Update analysis result for the active block
	 */
	updateAnalysis(result: AnalysisResult) {
		if (!this.activeBlockId) return;

		// Update session with analysis result
		const sessionManager = this.plugin.getSessionManager();
		sessionManager.setAnalysisResult(this.activeBlockId, result);

		// Add AI response to chat
		if (result.aiResponse) {
			this.addChatMessage('assistant', result.aiResponse);
		}
	}

	private addChatMessage(role: 'user' | 'assistant', content: string) {
		if (!this.chatMessagesEl) return;

		// Show chat if hidden
		this.showChatState();

		const msgEl = this.chatMessagesEl.createEl('div', {
			cls: `lifewiki-chat-msg lifewiki-chat-msg-${role}`,
			attr: {
				style: `margin-bottom: 12px; padding: 10px 14px; border-radius: 12px; font-size: 13px; line-height: 1.5; ${
					role === 'user'
						? 'background: var(--interactive-accent); color: white; margin-left: 20%;'
						: 'background: var(--background-secondary); margin-right: 20%;'
				}`
			}
		});

		// Render content with **bold** formatting for entities
		this.renderMessageContent(msgEl, content);
	}

	/**
	 * Render message content with bold formatting for entities
	 */
	private renderMessageContent(container: HTMLElement, content: string) {
		// Split by ** to find bold sections
		const parts = content.split(/\*\*(.+?)\*\*/g);

		for (let i = 0; i < parts.length; i++) {
			if (i % 2 === 1) {
				// This is a bold section (entity name)
				const strongEl = container.createEl('strong', {
					text: parts[i],
					attr: { style: 'color: var(--text-accent);' }
				});
			} else {
				// Regular text
				container.createEl('span', { text: parts[i] });
			}
		}
	}

	private async sendMessage() {
		if (!this.inputTextarea || this.isLoading || !this.activeBlockId) return;

		const content = this.inputTextarea.value.trim();
		if (!content) return;

		this.isLoading = true;
		this.inputTextarea.value = '';
		this.updateSendIconState();

		// Show user message
		this.addChatMessage('user', content);

		// Add to session
		const sessionManager = this.plugin.getSessionManager();
		sessionManager.addMessage(this.activeBlockId, {
			role: 'user',
			content
		});

		try {
			// Continue conversation via conversation flow
			const flow = this.plugin.getConversationFlow();
			const result = await flow.continueAnalysis(this.activeBlockId, content);

			if (result.aiResponse) {
				this.addChatMessage('assistant', result.aiResponse);
			} else if (result.error) {
				this.addChatMessage('assistant', `错误: ${result.error}`);
			}
		} catch (error) {
			console.error('AI chat error:', error);
			this.addChatMessage('assistant', '抱歉，AI 响应失败: ' + (error as Error).message);
		}

		this.isLoading = false;
	}

	async onClose() {
		// Clean up
	}
}
