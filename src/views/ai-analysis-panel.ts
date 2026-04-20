/**
 * AI Analysis Panel View
 * Modern, native, minimalist chat UI
 */

import { ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import type LifeWikiPlugin from '../main';
import { AnalysisResult, BlockSession, ChatMessage, PanelMode, ParsedBlock } from '../entities/types';
import { BlockEditorView, VIEW_TYPE_BLOCK_EDITOR } from './block-editor';

export const VIEW_TYPE_AI_ANALYSIS = 'lifewiki-ai-analysis';

export class AIAnalysisPanelView extends ItemView {
	private plugin: LifeWikiPlugin;
	private activeBlockId: string | null = null;
	private activeParentId: string | null = null; // Parent ID when in child block context
	private mode: PanelMode = 'analysis';
	private chatMessagesEl: HTMLElement | null = null;
	private inputTextarea: HTMLTextAreaElement | null = null;
	private sendBtnEl: HTMLElement | null = null;
	private chatModeClearBtnEl: HTMLElement | null = null;
	private headerTitleEl: HTMLElement | null = null;
	private modeSelectEl: HTMLSelectElement | null = null;
	private isLoading: boolean = false;
	private emptyStateEl: HTMLElement | null = null;
	private pendingEntities: Array<{ name: string; inferredType: string; reason: string }> = [];
	private thinkingEl: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: LifeWikiPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_AI_ANALYSIS;
	}

	getDisplayText(): string {
		return this.mode === 'chat' ? 'AI聊天' : 'AI洞察';
	}

	async onOpen() {
		// Update plugin reference so we always use the current view instance
		this.plugin.aiAnalysisView = this;

		const container = this.containerEl;
		container.empty();

		// Add styles AFTER container.empty() so they aren't wiped out
		this.addStyles();

		// Main panel container
		const mainContainer = container.createEl('div', {
			cls: 'lifewiki-ai-panel'
		});

		// Header
		const header = mainContainer.createEl('div', {
			cls: 'lifewiki-ai-header'
		});

		// Title
		const headerTitle = header.createEl('div', {
			cls: 'lifewiki-ai-header-title'
		});
		this.headerTitleEl = headerTitle.createEl('span', { text: 'AI 洞察' });

		// Header actions
		const headerActions = header.createEl('div', {
			cls: 'lifewiki-ai-header-actions'
		});

		// Clear button (only visible in chat mode)
		this.chatModeClearBtnEl = headerActions.createEl('button', {
			cls: 'lifewiki-ai-clear-btn',
			attr: { title: '清空聊天' }
		});
		setIcon(this.chatModeClearBtnEl, 'trash-2');
		// Make icon bigger
		const clearSvg = this.chatModeClearBtnEl.querySelector('svg');
		if (clearSvg) {
			clearSvg.setAttribute('width', '20');
			clearSvg.setAttribute('height', '20');
		}
		this.chatModeClearBtnEl.addClass('hidden');
		this.chatModeClearBtnEl.addEventListener('click', () => {
			this.clearChatSession();
		});

		// Scrollable chat area
		const scrollContent = mainContainer.createEl('div', {
			cls: 'lifewiki-ai-scroll'
		});

		// Empty state - simple text only
		this.emptyStateEl = scrollContent.createEl('div', {
			cls: 'lifewiki-empty-state'
		});

		this.emptyStateEl.createEl('span', {
			cls: 'lifewiki-empty-state-title',
			text: '选择或输入一条日记'
		});

		// Chat messages area
		this.chatMessagesEl = scrollContent.createEl('div', {
			cls: 'lifewiki-chat-messages'
		});

		// Bottom input area
		const inputArea = mainContainer.createEl('div', {
			cls: 'lifewiki-ai-input-area'
		});

		// Card-style input wrapper
		const inputWrapper = inputArea.createEl('div', {
			cls: 'lifewiki-chat-input-wrapper'
		});

		// Input row with textarea only (expanded)
		const inputRow = inputWrapper.createEl('div', {
			cls: 'lifewiki-input-row'
		});

		// Textarea
		this.inputTextarea = inputRow.createEl('textarea', {
			cls: 'lifewiki-input-textarea',
			attr: {
				placeholder: '输入你的回复...',
				rows: '1'
			}
		}) as HTMLTextAreaElement;

		// Auto-resize textarea
		this.inputTextarea.addEventListener('input', () => {
			this.autoResizeTextarea();
			this.updateSendBtnState();
		});

		// Keyboard events
		this.inputTextarea.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.sendMessage();
			}
		});

		// Mode selector row (below input row)
		const modeRow = inputWrapper.createEl('div', {
			cls: 'lifewiki-mode-row'
		});

		// Mode selector (left side)
		this.modeSelectEl = modeRow.createEl('select', {
			cls: 'lifewiki-mode-select'
		}) as HTMLSelectElement;
		this.modeSelectEl.createEl('option', { value: 'analysis', text: '📊 分析模式' });
		this.modeSelectEl.createEl('option', { value: 'chat', text: '💬 聊天模式' });

		this.modeSelectEl.addEventListener('change', () => {
			const selectedMode = this.modeSelectEl?.value as PanelMode;
			if (selectedMode === 'chat') {
				this.switchToChatMode();
			} else {
				this.switchToAnalysisMode();
			}
		});

		// Send button (right side, aligned with mode selector)
		this.sendBtnEl = modeRow.createEl('button', {
			cls: 'lifewiki-send-btn',
			attr: { title: '发送' }
		});
		setIcon(this.sendBtnEl, 'arrow-up');

		// Send button click
		this.sendBtnEl.addEventListener('click', () => {
			const content = this.inputTextarea?.value.trim();
			if (content && !this.isLoading) {
				this.sendMessage();
			}
		});

		// Initial state
		this.showEmptyState();
		this.updateSendBtnState();
	}

	private autoResizeTextarea() {
		if (!this.inputTextarea) return;
		// Auto resize up to max-height, start with min-height (3 lines)
		const minHeight = 66;
		const maxHeight = 120;
		const scrollHeight = this.inputTextarea.scrollHeight;
		this.inputTextarea.style.height = Math.min(Math.max(scrollHeight, minHeight), maxHeight) + 'px';
	}

	private updateSendBtnState() {
		if (!this.sendBtnEl || !this.inputTextarea) return;
		const hasContent = this.inputTextarea.value.trim().length > 0 && !this.isLoading;
		this.sendBtnEl.classList.toggle('active', hasContent);
	}

	private addStyles() {
		const styleEl = document.createElement('style');
		styleEl.textContent = `
/* AI Analysis Panel - "The Intellectual Atelier" Design System */

:root {
	--surface: #f9f9f9;
	--surface-container-low: #f3f3f3;
	--surface-container-lowest: #ffffff;
	--surface-container-high: #e8e8e8;
	--surface-variant: #e2e2e2;
	--on-surface: #1a1c1c;
	--on-surface-variant: #4a4453;
	--outline-variant: rgba(204, 195, 214, 0.4);
	--outline: #7b7485;
	--primary: #5c28b8;
	--primary-container: #7546d2;
	--on-primary: #ffffff;
	--on-primary-container: #eadcff;
	--secondary: #67558e;
	--font-body: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.lifewiki-ai-panel {
	height: 100%;
	display: flex;
	flex-direction: column;
	background: var(--surface-container-low);
	overflow: hidden;
	position: relative;
}

.lifewiki-ai-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 20px;
	flex-shrink: 0;
	background: rgba(255, 255, 255, 0.85);
	backdrop-filter: blur(16px);
	border-bottom: 1px solid rgba(204, 195, 214, 0.15);
}

.lifewiki-ai-header-title {
	display: flex;
	align-items: center;
	gap: 8px;
}

.lifewiki-ai-header-title span {
	font-family: var(--font-body);
	font-size: 14px;
	font-weight: 600;
	color: var(--primary);
	letter-spacing: 0.02em;
}

.lifewiki-ai-header-subtitle {
	font-family: var(--font-body);
	font-size: 12px;
	color: var(--on-surface-variant);
}

.lifewiki-ai-header-actions {
	display: flex;
	align-items: center;
	gap: 4px;
}

.lifewiki-ai-clear-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 32px;
	height: 32px;
	border-radius: 8px;
	border: none;
	background: transparent;
	color: var(--on-surface-variant);
	cursor: pointer;
	transition: background 0.15s, color 0.15s;
}

.lifewiki-ai-clear-btn:hover {
	background: rgba(239, 68, 68, 0.1);
	color: #ef4444;
}

.lifewiki-ai-clear-btn svg {
	width: 20px !important;
	height: 20px !important;
	transform: scale(1.2);
	transform-origin: center;
}

.lifewiki-ai-scroll {
	flex: 1 1 0;
	overflow-y: auto;
	overflow-x: hidden;
	padding: 16px;
	padding-bottom: 200px; /* Account for fixed input area */
	display: flex;
	flex-direction: column;
	background: transparent !important;
	min-height: 0;
}

.lifewiki-ai-scroll::-webkit-scrollbar {
	width: 6px;
}

.lifewiki-ai-scroll::-webkit-scrollbar-track {
	background: transparent;
}

.lifewiki-ai-scroll::-webkit-scrollbar-thumb {
	background: rgba(204, 195, 214, 0.4);
	border-radius: 3px;
}

.lifewiki-ai-scroll::-webkit-scrollbar-thumb:hover {
	background: rgba(204, 195, 214, 0.6);
}

.lifewiki-empty-state {
	display: none !important;
	height: 100% !important;
	text-align: center !important;
	padding: 0 !important;
	background: transparent !important;
	box-shadow: none !important;
	border: none !important;
	border-radius: 0 !important;
	outline: none !important;
}

.lifewiki-empty-state.visible {
	display: block !important;
}

.lifewiki-empty-state-title {
	font-family: var(--font-body) !important;
	font-size: 13px !important;
	color: var(--on-surface-variant) !important;
	opacity: 0.5 !important;
	background: transparent !important;
	padding: 0 !important;
	border: none !important;
	box-shadow: none !important;
}

.lifewiki-chat-messages {
	display: none;
	flex-direction: column;
	gap: 16px;
	padding-bottom: 16px;
	margin-bottom: 150px;
	background: transparent;
}

.lifewiki-chat-messages.visible {
	display: flex;
	background: transparent;
}

.lifewiki-chat-msg {
	padding: 12px 16px;
	border-radius: 12px;
	font-family: var(--font-body);
	font-size: 14px;
	line-height: 1.6;
	word-wrap: break-word;
	overflow-wrap: break-word;
	animation: messageFadeIn 0.2s ease-out;
	user-select: text;
	position: relative;
	max-width: 80%;
}

@keyframes messageFadeIn {
	from { opacity: 0; transform: translateY(4px); }
	to { opacity: 1; transform: translateY(0); }
}

.lifewiki-chat-msg.assistant {
	align-self: flex-start;
	background: var(--surface-container-lowest);
	color: var(--on-surface);
	border-radius: 12px;
	border: 1px solid rgba(204, 195, 214, 0.15);
	box-shadow: 0 4px 20px -4px rgba(26, 28, 28, 0.04);
}

.lifewiki-chat-msg.user {
	align-self: flex-end;
	background: var(--surface-container-high);
	color: var(--on-surface);
	border-radius: 12px;
	border: 1px solid rgba(204, 195, 214, 0.15);
}

.lifewiki-chat-msg strong {
	color: var(--primary);
	font-weight: 600;
}

.lifewiki-chat-msg-copy-hint {
	position: absolute;
	top: 8px;
	right: 10px;
	font-size: 10px;
	color: var(--on-surface-variant);
	opacity: 0;
	transition: opacity 0.15s;
}

.lifewiki-chat-msg.assistant:hover .lifewiki-chat-msg-copy-hint {
	opacity: 1;
}

.lifewiki-thinking {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 12px 16px;
	background: var(--surface-container-lowest);
	border-radius: 12px;
	border-top-left-radius: 4px;
	border: 1px solid rgba(204, 195, 214, 0.15);
	box-shadow: 0 4px 20px -4px rgba(26, 28, 28, 0.04);
	animation: messageFadeIn 0.2s ease-out;
}

.lifewiki-thinking-dots {
	display: flex;
	gap: 6px;
}

.lifewiki-thinking-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: var(--on-surface-variant);
	animation: thinkingPulse 1.2s ease-in-out infinite;
}

.lifewiki-thinking-dot:nth-child(2) { animation-delay: 0.15s; }
.lifewiki-thinking-dot:nth-child(3) { animation-delay: 0.3s; }

@keyframes thinkingPulse {
	0%, 100% { transform: scale(0.8); opacity: 0.5; }
	50% { transform: scale(1); opacity: 1; }
}

.lifewiki-ai-input-area {
	position: absolute;
	bottom: 32px;
	left: 16px;
	right: 16px;
	z-index: 20;
	padding: 0;
}

.lifewiki-chat-input-wrapper {
	background: var(--surface-container-lowest);
	border-radius: 16px;
	padding: 12px;
	box-shadow: 0 10px 40px -10px rgba(26, 28, 28, 0.06);
	border: 1px solid rgba(204, 195, 214, 0.15);
	display: flex;
	flex-direction: column;
	min-height: 100px;
}

.lifewiki-chat-input-wrapper:focus-within {
	border-color: rgba(204, 195, 214, 0.15);
	box-shadow: 0 10px 40px -10px rgba(26, 28, 28, 0.06);
}

.lifewiki-input-row {
	display: flex;
	align-items: stretch;
	flex: 1;
}

.lifewiki-input-textarea {
	flex: 1;
	min-height: 60px;
	max-height: 180px;
	resize: none;
	border: none !important;
	padding: 0;
	font-family: var(--font-body);
	font-size: 14px;
	line-height: 1.6;
	background: transparent;
	color: var(--on-surface);
	outline: none !important;
	box-shadow: none !important;
	overflow-y: auto;
}

.lifewiki-input-textarea:focus {
	border: none !important;
	outline: none !important;
	box-shadow: none !important;
}

.lifewiki-input-textarea::placeholder {
	color: var(--on-surface-variant);
	opacity: 0.6;
}

.lifewiki-send-btn {
	display: flex !important;
	align-items: center !important;
	justify-content: center !important;
	width: 36px !important;
	height: 36px !important;
	border: 1px solid var(--surface-container-high) !important;
	border-radius: 50% !important;
	background: var(--surface-container-high) !important;
	color: var(--on-surface-variant) !important;
	cursor: pointer;
	transition: background-color 0.2s, transform 0.2s;
	flex-shrink: 0;
}

.lifewiki-send-btn svg {
	width: 24px !important;
	height: 24px !important;
}

.lifewiki-send-btn:hover {
	transform: translateY(-1px);
}

.lifewiki-send-btn.active {
	background: #5c28b8 !important;
	color: #ffffff !important;
}

.lifewiki-chat-input-wrapper:focus-within .lifewiki-send-btn {
	background: #5c28b8 !important;
	color: #ffffff !important;
}

.lifewiki-model-select {
	background: transparent;
	border: none;
	color: var(--on-surface-variant);
	font-family: var(--font-body);
	font-size: 10px;
	font-weight: 500;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	cursor: pointer;
	outline: none;
	padding: 0;
}

.lifewiki-model-select:hover {
	color: var(--primary);
}

.lifewiki-entity-confirm {
	background: var(--surface-container-lowest);
	border: 1px solid rgba(204, 195, 214, 0.15);
	border-radius: 12px;
	padding: 16px;
	margin: 8px 0;
	animation: messageFadeIn 0.2s ease-out;
	box-shadow: 0 4px 20px -4px rgba(26, 28, 28, 0.04);
}

.lifewiki-entity-confirm-title {
	font-family: var(--font-body);
	font-size: 14px;
	font-weight: 500;
	color: var(--on-surface);
	margin-bottom: 6px;
}

.lifewiki-entity-confirm-reason {
	font-family: var(--font-body);
	font-size: 12px;
	color: var(--on-surface-variant);
	margin-bottom: 12px;
	line-height: 1.5;
}

.lifewiki-entity-confirm-buttons {
	display: flex;
	gap: 8px;
}

.lifewiki-entity-confirm-btn {
	flex: 1;
	padding: 8px 14px;
	border-radius: 8px;
	border: none;
	font-family: var(--font-body);
	font-size: 12px;
	font-weight: 500;
	cursor: pointer;
	transition: all 0.15s;
}

.lifewiki-entity-confirm-btn.archive {
	background: linear-gradient(135deg, var(--primary) 0%, var(--primary-container) 100%);
	color: var(--on-primary);
}

.lifewiki-entity-confirm-btn.archive:hover {
	transform: translateY(-1px);
	box-shadow: 0 4px 12px -2px rgba(92, 40, 184, 0.25);
}

.lifewiki-entity-confirm-btn.skip {
	background: transparent;
	border: 1px solid rgba(204, 195, 214, 0.3);
	color: var(--on-surface-variant);
}

.lifewiki-entity-confirm-btn.skip:hover {
	border-color: var(--primary);
	color: var(--primary);
}

/* Mode row - left aligned, with send button on right */
.lifewiki-mode-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 8px;
	margin-top: 8px;
}

/* Mode switch select */
.lifewiki-mode-select {
	padding: 4px 8px;
	border-radius: 6px;
	border: 1px solid var(--surface-container-high);
	background: var(--surface-container-high);
	color: var(--on-surface-variant);
	font-family: var(--font-body);
	font-size: 12px;
	font-weight: 500;
	cursor: pointer;
	transition: all 0.15s;
	outline: none;
}

.lifewiki-mode-select:focus {
	border-color: var(--surface-container-high);
}

.lifewiki-mode-select:hover {
	border-color: var(--primary);
	color: var(--primary);
}

.lifewiki-mode-select:focus {
	border-color: var(--primary);
	box-shadow: 0 0 0 2px rgba(92, 40, 184, 0.1);
}

.lifewiki-mode-select option {
	background: var(--surface-container-high);
	color: var(--on-surface);
}

/* Hidden class for header elements */
.lifewiki-ai-header-actions .hidden {
	display: none;
}

/* Chat mode active state */
.chat-mode .lifewiki-ai-panel {
	/* Additional styling when in chat mode */
}

@media (max-width: 400px) {
	.lifewiki-chat-msg {
		max-width: 92%;
	}
}
		`;
		this.containerEl.appendChild(styleEl);
	}

	private showEmptyState() {
		this.emptyStateEl?.addClass('visible');
		this.chatMessagesEl?.removeClass('visible');
	}

	private showChatState() {
		this.emptyStateEl?.removeClass('visible');
		this.chatMessagesEl?.addClass('visible');
	}

	public clearConversation() {
		this.chatMessagesEl?.empty();
		this.activeBlockId = null;
		this.showEmptyState();
	}

	public switchToChatMode() {
		this.mode = 'chat';
		this.activeBlockId = null;

		// Update panel title
		if (this.headerTitleEl) {
			this.headerTitleEl.textContent = 'AI聊天';
		}

		// Update mode select
		if (this.modeSelectEl) {
			this.modeSelectEl.value = 'chat';
		}

		// Show clear button in header
		if (this.chatModeClearBtnEl) {
			this.chatModeClearBtnEl.removeClass('hidden');
		}

		// Update input placeholder
		if (this.inputTextarea) {
			this.inputTextarea.placeholder = '说点什么...';
		}

		// Add chat mode class to panel
		this.containerEl.querySelector('.lifewiki-ai-panel')?.addClass('chat-mode');

		// Load chat session if exists
		const sessionManager = this.plugin.getSessionManager();
		const chatSession = sessionManager.getChatSession();
		if (chatSession && chatSession.messages.length > 0) {
			this.showChatState();
			this.chatMessagesEl?.empty();
			for (const message of chatSession.messages) {
				this.addChatMessage(message.role, message.content);
			}
		} else {
			this.showEmptyState();
		}
	}

	public switchToAnalysisMode() {
		this.mode = 'analysis';

		// Update panel title
		if (this.headerTitleEl) {
			this.headerTitleEl.textContent = 'AI洞察';
		}

		// Update mode select
		if (this.modeSelectEl) {
			this.modeSelectEl.value = 'analysis';
		}

		// Hide clear button in header
		if (this.chatModeClearBtnEl) {
			this.chatModeClearBtnEl.addClass('hidden');
		}

		// Update input placeholder
		if (this.inputTextarea) {
			this.inputTextarea.placeholder = '输入你的回复...';
		}

		// Remove chat mode class
		this.containerEl.querySelector('.lifewiki-ai-panel')?.removeClass('chat-mode');
	}

	public clearChatSession() {
		const sessionManager = this.plugin.getSessionManager();
		sessionManager.clearChatSession();
		this.chatMessagesEl?.empty();
		this.showEmptyState();
	}

	public setMode(mode: PanelMode) {
		if (mode === 'chat') {
			this.switchToChatMode();
		} else {
			this.switchToAnalysisMode();
		}
	}

	public getMode(): PanelMode {
		return this.mode;
	}

	private showThinkingIndicator() {
		if (!this.chatMessagesEl || !this.isLoading) return;

		this.thinkingEl = this.chatMessagesEl.createEl('div', {
			cls: 'lifewiki-thinking'
		});

		const dotsEl = this.thinkingEl.createEl('div', {
			cls: 'lifewiki-thinking-dots'
		});

		dotsEl.createEl('span', { cls: 'lifewiki-thinking-dot' });
		dotsEl.createEl('span', { cls: 'lifewiki-thinking-dot' });
		dotsEl.createEl('span', { cls: 'lifewiki-thinking-dot' });

		this.scrollToBottom();
	}

	private hideThinkingIndicator() {
		if (this.thinkingEl) {
			this.thinkingEl.remove();
			this.thinkingEl = null;
		}
	}

	private scrollToBottom() {
		const scrollEl = this.containerEl.querySelector('.lifewiki-ai-scroll');
		if (scrollEl) {
			scrollEl.scrollTop = scrollEl.scrollHeight;
		}
	}

	setActiveBlock(blockId: string, blockContent: string, parentId?: string | null) {
		// Always switch to analysis mode when selecting a block
		this.switchToAnalysisMode();
		this.activeBlockId = blockId;
		this.activeParentId = parentId || null;
		const sessionManager = this.plugin.getSessionManager();
		// Use parent's session if this is a child block
		const session = sessionManager.getOrCreateSession(blockId, parentId || null);
		this.showChatState();
		this.renderSession(session);
	}

	startNewSession(blockId: string, blockContent: string, initialResponse: string, parentId: string | null = null) {
		// Always switch to analysis mode when starting a new session
		this.switchToAnalysisMode();
		this.activeBlockId = blockId;
		this.activeParentId = parentId;
		this.showChatState();

		if (this.chatMessagesEl) {
			this.chatMessagesEl.empty();
		}

		const sessionManager = this.plugin.getSessionManager();
		const session = sessionManager.getOrCreateSession(blockId, parentId);

		const aiContent = initialResponse || '';
		sessionManager.addMessage(blockId, {
			role: 'assistant',
			content: aiContent
		}, parentId);

		if (aiContent) {
			this.addChatMessage('assistant', aiContent);
		}
	}

	private renderSession(session: BlockSession) {
		if (!this.chatMessagesEl) return;
		this.chatMessagesEl.empty();
		for (const message of session.messages) {
			this.addChatMessage(message.role, message.content);
		}
	}

	updateAnalysis(result: AnalysisResult) {
		if (!this.activeBlockId) return;
		const sessionManager = this.plugin.getSessionManager();
		sessionManager.setAnalysisResult(this.activeBlockId, result, this.activeParentId);
		if (result.aiResponse) {
			this.addChatMessage('assistant', result.aiResponse);
		}
	}

	private addChatMessage(role: 'user' | 'assistant', content: string) {
		if (!this.chatMessagesEl) return;
		this.showChatState();

		const msgEl = this.chatMessagesEl.createEl('div', {
			cls: `lifewiki-chat-msg ${role}`
		});

		if (role === 'assistant') {
			msgEl.setAttr('title', '点击复制');
			msgEl.addEventListener('click', async () => {
				try {
					await navigator.clipboard.writeText(content);
					const confirm = msgEl.createEl('span', {
						cls: 'lifewiki-chat-msg-copy-hint',
						text: '已复制'
					});
					setTimeout(() => confirm.remove(), 1500);
				} catch (e) {
					console.error('Failed to copy:', e);
				}
			});
		}

		this.renderMessageContent(msgEl, content);
		this.scrollToBottom();
	}

	private renderMessageContent(container: HTMLElement, content: string) {
		const parts = content.split(/\*\*(.+?)\*\*/g);
		for (let i = 0; i < parts.length; i++) {
			if (i % 2 === 1) {
				container.createEl('strong', { text: parts[i] });
			} else {
				container.createEl('span', { text: parts[i] });
			}
		}
	}

	private async sendMessage() {
		if (!this.inputTextarea || this.isLoading) return;

		const content = this.inputTextarea.value.trim();
		if (!content) return;

		// In chat mode, we don't need activeBlockId
		if (this.mode === 'chat') {
			await this.sendChatMessage(content);
			return;
		}

		// Analysis mode requires active block
		if (!this.activeBlockId) return;

		this.isLoading = true;
		this.inputTextarea.value = '';
		this.autoResizeTextarea();
		this.updateSendBtnState();

		this.addChatMessage('user', content);
		this.showThinkingIndicator();

		const sessionManager = this.plugin.getSessionManager();
		sessionManager.addMessage(this.activeBlockId, {
			role: 'user',
			content
		}, this.activeParentId);

		try {
			let result: any;
			const agent = this.plugin.getLangGraphAgent();
			if (agent) {
				result = await agent.continueAnalysis(this.activeBlockId, content);
			} else {
				throw new Error('AI agent not available');
			}

			this.hideThinkingIndicator();

			if (result.entityDiscovery && result.entityDiscovery.length > 0) {
				this.pendingEntities = result.entityDiscovery;
				await this.showEntityConfirmationDialog(result.entityDiscovery);
			}

			if (result.archivedEntities && result.archivedEntities.length > 0) {
				await this.handleEntityArchiving(result.archivedEntities);
			}

			if (result.updateEntities && result.updateEntities.length > 0) {
				await this.handleEntityUpdate(result.updateEntities);
			}

			if (result.relations && result.relations.length > 0) {
				await this.handleRelations(result.relations);
			}

			// Update block category if AI response contains area tags
			if (result.areas && result.areas.length > 0 && this.activeBlockId && !this.activeParentId) {
				await this.updateBlockCategory(this.activeBlockId, result.areas[0]);
			}

			if (result.aiResponse) {
				this.addChatMessage('assistant', result.aiResponse);
			} else if (result.error) {
				this.addChatMessage('assistant', `错误: ${result.error}`);
			}

			const aiContent = result.aiResponse || (result.error ? `错误: ${result.error}` : '');
			if (aiContent) {
				sessionManager.addMessage(this.activeBlockId, {
					role: 'assistant',
					content: aiContent
				}, this.activeParentId);
			}
		} catch (error) {
			console.error('AI chat error:', error);
			this.hideThinkingIndicator();
			this.addChatMessage('assistant', '抱歉，AI 响应失败: ' + (error as Error).message);
		}

		this.isLoading = false;
		this.updateSendBtnState();
	}

	private async sendChatMessage(content: string) {
		this.isLoading = true;
		this.inputTextarea.value = '';
		this.autoResizeTextarea();
		this.updateSendBtnState();

		this.addChatMessage('user', content);
		this.showThinkingIndicator();

		const sessionManager = this.plugin.getSessionManager();
		sessionManager.addChatMessage({ role: 'user', content });

		try {
			// Try to use AgentRegistry with ChatAgent first
			const agentRegistry = this.plugin.getAgentRegistry();
			console.log('[Chat] agentRegistry:', agentRegistry ? 'exists' : 'null');
			console.log('[Chat] hasAgent(chat):', agentRegistry?.hasAgent('chat'));
			if (agentRegistry && agentRegistry.hasAgent('chat')) {
				const chatAgent = agentRegistry.getAgent('chat');
				console.log('[Chat] chatAgent:', chatAgent ? 'found' : 'null');
				if (chatAgent) {
					const result = await chatAgent.continue(
						{ blockId: 'chat:global', content: '' },
						content
					);

					this.hideThinkingIndicator();

					if (result.response) {
						// Strip thinking tags from response
						const cleanContent = (result.response as string)
							.replace(/<[Tt]hinking>[\s\S]*?<\/[Tt]hinking>/gi, '')
							.replace(/<[Tt]hink>[\s\S]*?<\/[Tt]hink>/gi, '')
							.replace(/<\/?[Tt]hink>/g, '')
							.replace(/<\/?[Tt]hinking>/g, '')
							.trim();
						this.addChatMessage('assistant', cleanContent);
						sessionManager.addChatMessage({ role: 'assistant', content: cleanContent });
					} else if (result.error) {
						this.addChatMessage('assistant', `错误: ${result.error}`);
					}
				}
			} else {
				// Fallback to LangGraph agent for chat mode
				console.log('[Chat] Falling back to LangGraph agent');
				const agent = this.plugin.getLangGraphAgent();
				if (agent) {
					// Use 'chat:global' as pseudo blockId for chat mode
					const result = await agent.continueAnalysis('chat:global', content);

					this.hideThinkingIndicator();

					if (result.aiResponse) {
						// Strip thinking tags from response
						const cleanContent = result.aiResponse
							.replace(/<[Tt]hinking>[\s\S]*?<\/[Tt]hinking>/gi, '')
							.replace(/<[Tt]hink>[\s\S]*?<\/[Tt]hink>/gi, '')
							.replace(/<\/?[Tt]hink>/g, '')
							.replace(/<\/?[Tt]hinking>/g, '')
							.trim();
						this.addChatMessage('assistant', cleanContent);
						sessionManager.addChatMessage({ role: 'assistant', content: cleanContent });
					} else if (result.error) {
						this.addChatMessage('assistant', `错误: ${result.error}`);
					}
				} else {
					// Fallback to simple chat without tools
					const aiProvider = this.plugin.getAIProvider();
					const chatSession = sessionManager.getChatSession();
					const messages: ChatMessage[] = chatSession?.messages || [];
					const systemMessage: ChatMessage = {
						role: 'system',
						content: '你是一个友好的AI助手，可以和用户讨论各种话题，包括日记复盘、思考总结等。'
					};
					const response = await aiProvider.chat([systemMessage, ...messages]);

					this.hideThinkingIndicator();

					if (response.content) {
						const cleanContent = response.content
							.replace(/<think>[\s\S]*?<\/think>/gi, '')
							.replace(/<think>[\s\S]*?/gi, '')
							.trim();
						this.addChatMessage('assistant', cleanContent);
						sessionManager.addChatMessage({ role: 'assistant', content: cleanContent });
					}
				}
			}
		} catch (error) {
			console.error('AI chat error:', error);
			this.hideThinkingIndicator();
			this.addChatMessage('assistant', '抱歉，AI 响应失败: ' + (error as Error).message);
		}

		this.isLoading = false;
		this.updateSendBtnState();
	}

	private async handleEntityArchiving(entities: Array<{ name: string; type: 'person' | 'project' | 'thing' | 'idea' | 'knowledge'; smallType: string; context: string }>) {
		const entityManager = this.plugin.getEntityManager();
		if (!entityManager) return;

		const today = new Date().toISOString().split('T')[0];

		for (const entity of entities) {
			try {
				const metadata: Record<string, any> = { status: 'active' };

				if (entity.type === 'person') {
					metadata.person_type = entity.smallType || 'known';
					metadata.first_contact = today;
					metadata.contact_channel = '日记';
				} else if (entity.type === 'project') {
					metadata.project_type = entity.smallType || '项目';
					metadata.priority = 'medium';
					metadata.start_date = today;
					if (entity.context.includes('项目负责人')) {
						metadata.owner = entity.context.match(/(\S+)是项目负责人/)?.[1] || '';
					}
				} else if (entity.type === 'thing') {
					metadata.thing_type = entity.smallType || '其他';
					if (entity.context) {
						metadata.why_interesting = entity.context;
					}
				} else if (entity.type === 'idea') {
					metadata.idea_type = entity.smallType || '想法';
					metadata.source = 'diary';
					metadata.potential_impact = entity.context.includes('重要') || entity.context.includes('关键') ? 'high' : 'medium';
				} else if (entity.type === 'knowledge') {
					metadata.source_type = entity.smallType === '网页链接' ? 'link' : 'article';
					metadata.accessed_date = today;
				}

				const summary = entity.context || `从日记中归档的${entity.type}`;

				await entityManager.createEntity({
					type: entity.type,
					title: entity.name,
					titleRaw: entity.name,
					aliases: [],
					tags: [],
					summary,
					confidence: 0.8,
					verificationStatus: 'verified',
					createdAt: new Date().toISOString(),
					createdBy: 'ai',
					lastUpdated: new Date().toISOString(),
					relatedEntities: [],
					interactions: [{
						timestamp: new Date().toISOString(),
						type: 'ai_analysis',
						content: `归档为${entity.smallType}：${entity.context || '无'}`,
						sourceBlockId: this.activeBlockId || undefined
					}],
					metadata
				});
			} catch (error) {
				console.error(`[AIAnalysisPanel] Failed to create entity ${entity.name}:`, error);
			}
		}
	}

	private async handleEntityUpdate(updates: Array<{ entityId: string; name: string; updates: Array<{ field: string; value: string }> }>) {
		const entityManager = this.plugin.getEntityManager();
		if (!entityManager) return;

		for (const update of updates) {
			try {
				const entity = entityManager.getEntity(update.entityId);
				if (!entity) continue;

				const updateData: Record<string, any> = { lastUpdated: new Date().toISOString() };
				const interactions = [...entity.interactions];

				for (const u of update.updates) {
					if (u.field.startsWith('metadata.')) {
						const key = u.field.replace('metadata.', '');
						updateData.metadata = { ...entity.metadata, [key]: u.value };
					} else if (u.field === 'interactions') {
						interactions.push({
							timestamp: new Date().toISOString(),
							type: 'ai_analysis',
							content: u.value,
							sourceBlockId: this.activeBlockId || undefined
						});
						updateData.interactions = interactions;
					} else if (u.field === 'summary') {
						updateData.summary = u.value;
					}
				}

				await entityManager.updateEntity(update.entityId, updateData);
			} catch (error) {
				console.error(`[AIAnalysisPanel] Failed to update entity ${update.name}:`, error);
			}
		}
	}

	private async handleRelations(relations: Array<{ from: string; to: string; relation: string }>) {
		const entityManager = this.plugin.getEntityManager();
		if (!entityManager) return;

		for (const rel of relations) {
			try {
				const fromEntity = entityManager.findEntity(rel.from);
				const toEntity = entityManager.findEntity(rel.to);
				if (!fromEntity || !toEntity) continue;

				const existingRelations = fromEntity.relatedEntities || [];
				const newRelation = {
					entityId: toEntity.id,
					relation: rel.relation as 'mentioned_in' | 'part_of' | 'related_to' | 'update_of' | 'about',
					context: `通过日记分析建立关系：${rel.from}是${rel.to}的${rel.relation}`
				};

				const alreadyRelated = existingRelations.some(
					r => r.entityId === toEntity.id && r.relation === newRelation.relation
				);

				if (!alreadyRelated) {
					await entityManager.updateEntity(fromEntity.id, {
						relatedEntities: [...existingRelations, newRelation],
						lastUpdated: new Date().toISOString()
					});
				}
			} catch (error) {
				console.error(`[AIAnalysisPanel] Failed to create relation:`, error);
			}
		}
	}

	/**
	 * Update block category based on AI-detected area tags
	 */
	private async updateBlockCategory(blockId: string, category: string): Promise<void> {
		try {
			// Get BlockEditorView from workspace
			const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_BLOCK_EDITOR);
			if (leaves.length === 0) return;

			const blockEditorView = leaves[0].view as BlockEditorView;
			if (!blockEditorView) return;

			const block = blockEditorView.getBlockById(blockId) as ParsedBlock | undefined;
			if (!block) return;

			// Only update if block is still in '待分析' state or already has a different category
			if ((block as ParsedBlock).category === '待分析' || (block as ParsedBlock).category !== category) {
				(block as ParsedBlock).category = category;
				await blockEditorView.saveBlockToFile(block as ParsedBlock);
				console.log(`[AIAnalysisPanel] Updated block ${blockId} category to ${category}`);
			}
		} catch (error) {
			console.error(`[AIAnalysisPanel] Failed to update block category:`, error);
		}
	}

	private async showEntityConfirmationDialog(entities: Array<{ name: string; inferredType: string; reason: string }>) {
		if (!this.chatMessagesEl) return;

		for (const entity of entities) {
			const entityEl = this.chatMessagesEl.createEl('div', {
				cls: 'lifewiki-entity-confirm'
			});

			entityEl.createEl('div', {
				cls: 'lifewiki-entity-confirm-title',
				text: `识别到新${this.getEntityTypeLabel(entity.inferredType)}: **${entity.name}**`
			});

			entityEl.createEl('div', {
				cls: 'lifewiki-entity-confirm-reason',
				text: entity.reason || '从日记中发现'
			});

			const buttonsEl = entityEl.createEl('div', {
				cls: 'lifewiki-entity-confirm-buttons'
			});

			const archiveBtn = buttonsEl.createEl('button', {
				cls: 'lifewiki-entity-confirm-btn archive',
				text: '归档',
				attr: { type: 'button' }
			});

			const skipBtn = buttonsEl.createEl('button', {
				cls: 'lifewiki-entity-confirm-btn skip',
				text: '跳过',
				attr: { type: 'button' }
			});

			archiveBtn.addEventListener('click', async () => {
				await this.archiveEntity(entity);
				entityEl.remove();
			});

			skipBtn.addEventListener('click', () => {
				entityEl.remove();
			});
		}
	}

	private getEntityTypeLabel(type: string): string {
		const labels: Record<string, string> = {
			person: '人脉', people: '人脉',
			project: '项目', projects: '项目',
			thing: '物品', things: '物品',
			idea: '想法', ideas: '想法',
			knowledge: '知识'
		};
		return labels[type] || '实体';
	}

	private async archiveEntity(entity: { name: string; inferredType: string; reason: string }) {
		const entityManager = this.plugin.getEntityManager();
		if (!entityManager) return;

		const typeMap: Record<string, string> = {
			person: 'person', people: 'person',
			project: 'project', projects: 'project',
			thing: 'thing', things: 'thing',
			idea: 'idea', ideas: 'idea',
			knowledge: 'knowledge'
		};

		const entityType = typeMap[entity.inferredType] || 'person';
		const today = new Date().toISOString().split('T')[0];

		try {
			await entityManager.createEntity({
				type: entityType as any,
				title: entity.name,
				titleRaw: entity.name,
				aliases: [],
				tags: [],
				summary: entity.reason || '从日记中归档',
				confidence: 0.8,
				verificationStatus: 'verified',
				createdAt: new Date().toISOString(),
				createdBy: 'ai',
				lastUpdated: new Date().toISOString(),
				relatedEntities: [],
				interactions: [{
					timestamp: new Date().toISOString(),
					type: 'ai_analysis',
					content: `归档：${entity.reason || '从日记中发现'}`,
					sourceBlockId: this.activeBlockId || undefined
				}],
				metadata: {
					status: 'active',
					first_contact: today,
					source: 'diary'
				}
			});
			this.addChatMessage('assistant', `✅ 已归档 **${entity.name}**`);
		} catch (error) {
			console.error('[AIAnalysisPanel] Failed to archive entity:', error);
			this.addChatMessage('assistant', `❌ 归档失败`);
		}
	}

	async onClose() {}
}
