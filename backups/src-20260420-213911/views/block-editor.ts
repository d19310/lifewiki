/**
 * Block Editor View
 * Main UI for the journal block editor
 * Displayed as a tab in Obsidian's center area
 *
 * Design: Clean, elegant diary view following template format
 * - Header: Date (left) + tagline (right, small gray)
 * - Body: "Flow of Today:" heading
 * - Each block: H3 timestamp + content, sub-blocks as bullet points
 */

import { ItemView, WorkspaceLeaf, TFile, TFolder, setIcon } from 'obsidian';
import type LifeWikiPlugin from '../main';
import { Block } from '../entities/types';
import { loadTemplate } from '../utils/template-loader';

export const VIEW_TYPE_BLOCK_EDITOR = 'lifewiki-block-editor';

// Diary file path - 日记存储在 Vault 根目录的 Daily 文件夹
const DIARY_FOLDER = 'Daily';

function uuid(): string {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
		const r = Math.random() * 16 | 0;
		const v = c === 'x' ? r : (r & 0x3 | 0x8);
		return v.toString(16);
	});
}

/**
 * Generate a stable ID from a string (used for block IDs based on header content)
 */
function stableId(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash; // Convert to 32bit integer
	}
	// Convert to hex string and format as UUID-like
	const hex = Math.abs(hash).toString(16).padStart(8, '0');
	return `${hex.substring(0, 8)}-${hex.substring(0, 4)}-4${hex.substring(0, 3)}-${hex.substring(0, 4)}-${hex.substring(0, 12)}`;
}

interface ChildBlock {
	id: string;
	timestamp: string;      // HH:mm
	content: string;        // 子Block正文
	parentId: string;       // 父Block ID
}

interface ParsedBlock {
	id: string;
	timestamp: string;      // HH:mm
	source: string;         // [Lifewiki]
	category: string;       // #工作 或 #个人
	content: string;         // 父Block正文
	children: ChildBlock[]; // 子Block数组
	parentId: string | null; // null for top-level blocks
}

export class BlockEditorView extends ItemView {
	private plugin: LifeWikiPlugin;
	private blocks: ParsedBlock[] = [];
	private selectedBlockId: string | null = null;
	private currentDate: string;
	private inputValue: string = '';
	private isLoading: boolean = false;
	private contentContainer: HTMLElement | null = null;
	private childInputEl: HTMLElement | null = null;
	private selectedBlockContent: string | null = null;
	// Input area elements
	private inputAreaEl: HTMLElement | null = null;
	private inputTextarea: HTMLTextAreaElement | null = null;
	private inputHintEl: HTMLElement | null = null;
	private inputAppendFooterEl: HTMLElement | null = null;
	private appendModeActionsEl: HTMLElement | null = null;
	private appendSubmitBtn: HTMLElement | null = null;
	// Append mode state
	private isAppendMode: boolean = false;
	private appendModeBlockId: string | null = null;
	// Edit mode state
	private isEditMode: boolean = false;
	private editModeBlockId: string | null = null;
	// Flow line element reference
	private flowLineEl: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: LifeWikiPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.currentDate = this.formatDate(new Date());
	}

	getViewType(): string {
		return VIEW_TYPE_BLOCK_EDITOR;
	}

	getDisplayText(): string {
		return 'LifeWiki';
	}

	/**
	 * Set the current date and navigate to that date's diary
	 */
	async setCurrentDate(date: Date): Promise<void> {
		this.currentDate = this.formatDate(date);
		await this.renderView();
	}

	/**
	 * Render the view (used by both onOpen and setCurrentDate)
	 */
	private async renderView(): Promise<void> {
		const container = this.containerEl;
		container.empty();

		// Main container with proper styling - flex column for sticky input
		const mainContainer = container.createEl('div', {
			cls: 'lifewiki-diary-container',
			attr: { style: 'display: flex; flex-direction: column; height: 100%;' }
		});

		// Add styles
		this.addStyles();

		// Create header: Date (left) + Tagline (right)
		const header = mainContainer.createEl('div', {
			cls: 'lifewiki-diary-header'
		});

		// Date on left
		header.createEl('h1', {
			text: this.currentDate,
			cls: 'lifewiki-diary-date'
		});

		// Tagline on right
		header.createEl('span', {
			text: '日记是AI时代人生最大的复利',
			cls: 'lifewiki-diary-tagline'
		});

		// "Flow of Today:" heading
		mainContainer.createEl('h2', {
			text: 'Flow of Today：',
			cls: 'lifewiki-diary-section-title'
		});

		// Content area for blocks - flex: 1 to take remaining space
		this.contentContainer = mainContainer.createEl('div', {
			cls: 'lifewiki-diary-content',
			attr: { style: 'flex: 1; overflow-y: auto;' }
		});

		// Load and render blocks
		await this.loadBlocks();

		// Input area at bottom
		this.createInputArea(mainContainer);

		// Global click handler to handle append/edit mode when clicking outside
		this.contentContainer?.addEventListener('click', (e) => {
			const target = e.target as HTMLElement;
			// Check if click is outside a block (both .lifewiki-block and .lifewiki-block-group)
			if (this.isAppendMode && !target.closest('.lifewiki-block, .lifewiki-block-group') && !target.closest('.lifewiki-input-area')) {
				this.cancelAppendMode();
			}
			// Exit edit mode when clicking outside the editing block (parent or child)
			if (this.isEditMode && !target.closest('.lifewiki-block.editing, .lifewiki-block-group.editing, .lifewiki-block-child.editing')) {
				this.exitEditMode();
			}
			// Clear selection and AI panel when clicking on empty space
			if (!this.isAppendMode && !this.isEditMode && !target.closest('.lifewiki-block, .lifewiki-block-group, .lifewiki-block-child')) {
				this.selectedBlockId = null;
				const aiView = this.plugin.getAIAnalysisView();
				aiView?.clearConversation();
			}
		});
	}

	async onOpen() {
		await this.renderView();
	}

	private addStyles() {
		const styleEl = document.createElement('style');
		styleEl.textContent = `
			/* Design System: "The Intellectual Atelier" - Light Editorial Theme */

			/* Design Tokens */
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
				--tertiary: #724100;
				--tertiary-container: #935500;
				--font-body: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			}

			/* Ghost Border - 15% opacity outline-variant */
			.ghost-border {
				border: 1px solid rgba(204, 195, 214, 0.15);
			}

			/* Ambient Shadow */
			.ambient-shadow {
				box-shadow: 0 10px 40px -10px rgba(26, 28, 28, 0.06);
			}

			/* Main Container */
			.lifewiki-diary-container {
				height: 100%;
				width: 100%;
				overflow: hidden;
				padding: 0;
				box-sizing: border-box;
				font-family: var(--font-body);
				background: var(--surface);
				color: var(--on-surface);
			}

			/* Header */
			.lifewiki-diary-header {
				display: flex;
				justify-content: space-between;
				align-items: center;
				padding: 20px 48px 24px;
				margin-bottom: 8px;
			}

			.lifewiki-diary-date {
				font-size: 28px;
				font-weight: 700;
				letter-spacing: -0.02em;
				margin: 0;
				color: var(--on-surface);
				font-family: var(--font-body);
			}

			.lifewiki-diary-tagline {
				font-size: 13px;
				color: var(--on-surface-variant);
				font-style: italic;
				font-family: var(--font-body);
			}

			/* Section Title */
			.lifewiki-diary-section-title {
				font-size: 13px;
				font-weight: 500;
				color: var(--on-surface-variant);
				margin-bottom: 20px;
				padding: 0 48px;
				letter-spacing: 0.05em;
				text-transform: uppercase;
				font-family: var(--font-body);
			}

			/* Content Area */
			.lifewiki-diary-content {
				flex: 1;
				line-height: 1.7;
				overflow-y: auto;
				padding: 0 48px 200px;
				background: var(--surface);
				position: relative;
			}

			/* Flow Line - continuous vertical line through the diary */
			.flow-line {
				position: absolute;
				left: 70px;
				top: 0;
				width: 1px;
				background: rgba(158, 158, 158, 0.3);
				z-index: 0;
				height: 0; /* Will be set dynamically by extendFlowLine() */
			}

			/* Block Group - Parent with children */
			.lifewiki-block-group {
				position: relative;
				display: flex;
				flex-direction: column;
				margin-bottom: 16px;
				z-index: 1;
			}

			.lifewiki-block-group:last-child {
				margin-bottom: 0;
			}

			/* Remove old tree line - we use Flow Line now */

			/* Single Block */
			.lifewiki-block {
				position: relative;
				z-index: 1;
				cursor: pointer;
				transition: transform 0.2s ease;
				margin-bottom: 16px;
			}

			.lifewiki-block:last-child {
				margin-bottom: 0;
			}

			.lifewiki-block:hover {
				transform: translateY(-1px);
			}

			/* Block Card - matches design system */
			.lifewiki-block-card {
				background: var(--surface-container-lowest);
				border-radius: 8px;
				padding: 12px 16px;
				box-shadow: 0 10px 40px -10px rgba(26, 28, 28, 0.06);
				border: 1px solid rgba(204, 195, 214, 0.15);
				transition: box-shadow 0.2s ease;
				display: flex;
				flex-wrap: wrap;
				align-items: baseline;
				gap: 8px;
			}

			.lifewiki-block:hover .lifewiki-block-card {
				box-shadow: 0 14px 50px -10px rgba(26, 28, 28, 0.08);
			}

			.lifewiki-block.selected .lifewiki-block-card,
			.lifewiki-block-group.selected .lifewiki-block-card {
				background: var(--surface-container-high);
				border: 2px solid var(--primary);
			}

			/* Edit mode */
			.lifewiki-block.editing .lifewiki-block-card {
				background: var(--on-primary-container);
				border: 2px solid var(--primary);
			}

			/* Edit mode textarea and input */
			.lifewiki-edit-textarea {
				width: 100%;
				min-height: 60px;
				padding: 8px 12px;
				font-size: 14px;
				line-height: 1.6;
				border: 1px solid rgba(204, 195, 214, 0.3);
				border-radius: 8px;
				background: var(--surface-container-lowest);
				color: var(--on-surface);
				font-family: var(--font-body);
				resize: vertical;
				box-sizing: border-box;
			}

			.lifewiki-edit-input {
				padding: 4px 8px;
				font-size: 12px;
				border: 1px solid rgba(204, 195, 214, 0.3);
				border-radius: 20px;
				background: var(--surface-container-lowest);
				color: var(--on-surface);
				font-family: var(--font-body);
			}

			/* Timestamp Label - inline with content */
			.lifewiki-block-timestamp {
				font-size: 12px;
				font-weight: 600;
				color: var(--on-surface-variant);
				font-family: var(--font-body);
				flex-shrink: 0;
			}

			.lifewiki-block-timestamp::before {
				content: '[';
			}

			.lifewiki-block-timestamp::after {
				content: ']';
			}

			/* Main wrapper - inline-flex to keep timestamp and content on same line */
			.lifewiki-main-wrapper {
				display: inline-flex;
				align-items: baseline;
				gap: 6px;
			}

			/* Block Content Text - takes remaining space */
			.lifewiki-block-content {
				font-size: 14px;
				color: var(--on-surface);
				line-height: 1.6;
				font-family: var(--font-body);
				flex: 1;
				white-space: pre-wrap;
				word-break: break-word;
				min-width: 0;
			}

			.lifewiki-block-content.expanded {
				text-indent: 0;
				padding-left: 0;
			}
			.lifewiki-block-content {
				font-size: 14px;
				color: var(--on-surface);
				line-height: 1.6;
				font-family: var(--font-body);
				/* Two line limit with ellipsis */
				display: -webkit-box;
				-webkit-line-clamp: 2;
				-webkit-box-orient: vertical;
				overflow: hidden;
				text-overflow: ellipsis;
				word-break: break-word;
			}

			.lifewiki-block-content.expanded {
				display: block;
				-webkit-line-clamp: unset;
				overflow: visible;
			}

			/* Block Body - contains content and tags */
			.lifewiki-block-body {
				display: flex;
				flex-direction: column;
				gap: 4px;
			}

			/* Tag Badge - smaller font, primary color */
			.lifewiki-block-tag {
				font-size: 12px;
				padding: 2px 8px;
				border-radius: 20px;
				font-weight: 500;
				font-family: var(--font-body);
			}

			.lifewiki-block-tag.工作 {
				background: rgba(92, 40, 184, 0.1);
				color: var(--primary);
			}

			.lifewiki-block-tag.个人 {
				background: rgba(114, 65, 0, 0.1);
				color: var(--tertiary);
			}

			.lifewiki-block-tag.学习 {
				background: rgba(103, 85, 142, 0.1);
				color: var(--secondary);
			}

			.lifewiki-block-tag.待确认 {
				background: rgba(123, 116, 133, 0.1);
				color: var(--on-surface-variant);
			}

			/* Category Badge - Pill style (for header) */
			.lifewiki-block-category {
				font-size: 11px;
				padding: 3px 10px;
				border-radius: 20px;
				font-weight: 500;
				font-family: var(--font-body);
			}

			.lifewiki-block-category.工作 {
				background: rgba(92, 40, 184, 0.1);
				color: var(--primary);
			}

			.lifewiki-block-category.个人 {
				background: rgba(114, 65, 0, 0.1);
				color: var(--tertiary);
			}

			.lifewiki-block-category.学习 {
				background: rgba(103, 85, 142, 0.1);
				color: var(--secondary);
			}

			.lifewiki-block-category.待确认 {
				background: rgba(123, 116, 133, 0.1);
				color: var(--on-surface-variant);
			}

			/* Children Container */
			.lifewiki-block-children {
				margin-left: 70px;
				padding-left: 0;
				padding-top: 12px;
				border-left: none;
				position: relative;
				display: flex;
				flex-direction: column;
				gap: 12px;
			}

			/* Child Block */
			.lifewiki-block-child {
				position: relative;
			}

			/* Horizontal connector from child left edge, extending left */
			.lifewiki-block-child::before {
				content: '';
				position: absolute;
				left: -48px;
				top: 50%;
				width: 48px;
				height: 2px;
				background: rgba(158, 158, 158, 0.3);
			}

			/* Child Card - matches parent card style */
			.lifewiki-block-child-card {
				background: var(--surface-container-lowest);
				border-radius: 8px;
				padding: 10px 14px;
				border: 1px solid rgba(204, 195, 214, 0.15);
				box-shadow: 0 10px 40px -10px rgba(26, 28, 28, 0.06);
				display: flex;
				align-items: flex-start;
				gap: 12px;
			}

			/* Selected child block */
			.lifewiki-block-child.selected .lifewiki-block-child-card {
				background: var(--surface-container-high);
				border: 2px solid var(--primary);
			}

			/* Child edit mode */
			.lifewiki-block-child .lifewiki-edit-textarea {
				width: 100%;
				min-height: 40px;
				padding: 8px;
				font-size: 14px;
				line-height: 1.5;
				border: 1px solid rgba(204, 195, 214, 0.3);
				border-radius: 6px;
				background: var(--surface-container-lowest);
				color: var(--on-surface);
				font-family: var(--font-body);
				resize: vertical;
				box-sizing: border-box;
			}

			/* Child Header */
			.lifewiki-block-child-header {
				display: flex;
				align-items: center;
				gap: 12px;
				margin-bottom: 4px;
			}

			.lifewiki-block-child-timestamp {
				font-size: 12px;
				font-weight: 600;
				color: var(--on-surface-variant);
				font-family: var(--font-body);
				min-width: 48px;
				margin-top: 2px;
			}

			.lifewiki-block-child-timestamp::before {
				content: '[';
			}

			.lifewiki-block-child-timestamp::after {
				content: ']';
			}

			/* Child Body */
			.lifewiki-block-child-body {
				flex: 1;
			}

			.lifewiki-block-child-content {
				font-size: 14px;
				color: var(--on-surface);
				line-height: 1.6;
				font-family: var(--font-body);
			}

			/* Child Tags */
			.lifewiki-block-child-tags {
				margin-top: 4px;
				display: flex;
				gap: 6px;
				flex-wrap: wrap;
			}

			.lifewiki-block-child-tag {
				font-size: 11px;
				padding: 2px 8px;
				border-radius: 20px;
				font-weight: 500;
				font-family: var(--font-body);
			}

			/* Input Area - Fixed at bottom */
			.lifewiki-input-area {
				position: fixed;
				bottom: 0;
				left: 0;
				right: 0;
				padding: 20px 48px 28px;
				background: linear-gradient(to top, var(--surface) 80%, transparent);
				z-index: 10;
			}

			/* Input Inner Container */
			.lifewiki-input-inner {
				width: 100%;
				height: 140px;
				max-height: 140px;
				padding: 16px 20px;
				padding-bottom: 40px;
				border: 1px solid rgba(204, 195, 214, 0.15);
				border-radius: 16px;
				background: var(--surface-container-high);
				box-shadow: 0 10px 50px -5px rgba(26, 28, 28, 0.15), 0 4px 10px -3px rgba(0, 0, 0, 0.08);
				display: flex;
				flex-direction: column;
				box-sizing: border-box;
				position: relative;
			}

			/* Input Card */
			.lifewiki-input-box {
				flex: 1;
				width: 100%;
				font-size: 14px;
				line-height: 1.6;
				border: none;
				border-radius: 0;
				background: transparent !important;
				color: var(--on-surface);
				resize: none;
				font-family: var(--font-body);
				padding: 0;
				outline: none;
				box-shadow: none;
			}

			.lifewiki-input-box:focus {
				outline: none;
				box-shadow: none;
			}

			/* Input Bottom Row */
			.lifewiki-input-bottom {
				display: flex;
				justify-content: space-between;
				align-items: center;
				position: absolute;
				bottom: 12px;
				left: 20px;
				right: 20px;
			}

			/* Input Hint (normal mode) */
			.lifewiki-input-hint {
				font-size: 11px;
				color: var(--on-surface-variant);
				opacity: 0.7;
				font-family: var(--font-body);
				white-space: nowrap;
				flex-shrink: 0;
			}

			/* Append Mode Actions (button + cancel) */
			.lifewiki-append-mode-actions {
				display: none;
				align-items: center;
				gap: 8px;
			}

			.lifewiki-append-mode-actions.visible {
				display: flex;
			}

			/* Append Submit Button - pill shape */
			.lifewiki-append-submit-btn {
				font-size: 12px !important;
				font-weight: 600 !important;
				font-family: var(--font-body) !important;
				background: #5c28b8 !important;
				color: #ffffff !important;
				border: none !important;
				border-radius: 999px !important;
				padding: 6px 16px !important;
				cursor: pointer;
				transition: background-color 0.2s;
			}

			.lifewiki-append-submit-btn:hover {
				background: #3d1a7a !important;
			}

			/* Append Cancel Button */
			.lifewiki-append-cancel-btn {
				width: 20px;
				height: 20px;
				border-radius: 50%;
				background: var(--surface-variant);
				color: var(--on-surface-variant);
				border: none;
				display: flex;
				align-items: center;
				justify-content: center;
				cursor: pointer;
				font-size: 14px;
				line-height: 1;
				transition: background-color 0.2s;
			}

			.lifewiki-append-cancel-btn:hover {
				background: var(--outline);
				color: var(--on-primary);
			}

			/* Send Button (Circular Arrow) */
			.lifewiki-diary-send-btn {
				width: 36px;
				height: 36px;
				border-radius: 50%;
				background: var(--on-surface-variant);
				color: #ffffff;
				border: none;
				display: flex;
				align-items: center;
				justify-content: center;
				cursor: pointer;
				transition: background-color 0.2s, transform 0.2s;
			}

			.lifewiki-diary-send-btn:hover {
				transform: translateY(-1px);
			}

			/* Button highlighted when input is focused (darker primary) */
			.lifewiki-input-inner:focus-within .lifewiki-diary-send-btn {
				background: #5c28b8 !important;
				color: #ffffff !important;
			}


			.lifewiki-input-box:hover {
				background: var(--surface-container-high) !important;
			}

			.lifewiki-input-box::placeholder {
				color: var(--on-surface-variant);
				opacity: 0.6;
			}


			/* Input Hint */
			.lifewiki-input-hint {
				font-size: 11px;
				color: var(--on-surface-variant);
				opacity: 0.7;
				font-family: var(--font-body);
			}

			/* Input Box Append Mode */
			.lifewiki-input-box.append-mode {
				outline: none;
				border: none;
				box-shadow: none;
			}

			/* Append Mode Footer */
			.lifewiki-append-footer {
				display: flex;
				justify-content: space-between;
				align-items: center;
				margin-top: 10px;
			}

			.lifewiki-append-hint {
				font-size: 12px;
				color: var(--primary);
				font-weight: 500;
				font-family: var(--font-body);
				background: var(--primary-container);
				padding: 4px 10px;
				border-radius: 6px;
			}

			.lifewiki-append-actions {
				display: flex;
				align-items: center;
				gap: 8px;
			}

			/* Append Button */
			.lifewiki-append-btn {
				padding: 6px 14px;
				border-radius: 8px;
				border: none;
				background: linear-gradient(135deg, var(--primary) 0%, var(--primary-container) 100%);
				color: var(--on-primary);
				font-size: 12px;
				font-weight: 500;
				font-family: var(--font-body);
				cursor: pointer;
				transition: all 0.15s;
			}

			.lifewiki-append-btn:hover {
				transform: translateY(-1px);
				box-shadow: 0 4px 12px -2px rgba(92, 40, 184, 0.25);
			}

			/* Cancel Button */
			.lifewiki-cancel-btn {
				display: flex;
				align-items: center;
				justify-content: center;
				width: 24px;
				height: 24px;
				border-radius: 50%;
				border: none;
				background: var(--surface-container-high);
				color: var(--on-surface-variant);
				font-size: 14px;
				cursor: pointer;
				transition: all 0.15s;
			}

			.lifewiki-cancel-btn:hover {
				background: var(--surface-variant);
				color: var(--on-surface);
			}

			/* Child Input Area */
			.lifewiki-child-input-area {
				margin-top: 12px;
				margin-left: 64px;
				padding-left: 24px;
				border-left: 1px solid rgba(92, 40, 184, 0.2);
			}

			.lifewiki-child-input {
				width: 100%;
				padding: 10px 14px;
				font-size: 13px;
				line-height: 1.5;
				border: 1px solid rgba(204, 195, 214, 0.15);
				border-radius: 10px;
				background: var(--surface-container-lowest);
				color: var(--on-surface);
				font-family: var(--font-body);
				box-sizing: border-box;
				transition: border-color 0.2s ease, box-shadow 0.2s ease;
			}

			.lifewiki-child-input:focus {
				outline: none;
				border-color: var(--primary);
				box-shadow: 0 4px 16px -4px rgba(92, 40, 184, 0.1);
			}

			.lifewiki-child-input::placeholder {
				color: var(--on-surface-variant);
				opacity: 0.5;
			}

			/* Add Child Button */
			.lifewiki-add-child-btn {
				margin-left: 8px;
				padding: 4px 10px;
				font-size: 11px;
				border-radius: 20px;
				border: 1px dashed rgba(204, 195, 214, 0.3);
				background: transparent;
				color: var(--on-surface-variant);
				cursor: pointer;
				transition: all 0.2s ease;
				font-family: var(--font-body);
			}

			.lifewiki-add-child-btn:hover {
				border-color: var(--primary);
				border-style: solid;
				color: var(--primary);
				background: rgba(92, 40, 184, 0.05);
			}

			/* Scrollbar styling */
			.lifewiki-diary-content::-webkit-scrollbar,
			.lifewiki-input-box::-webkit-scrollbar {
				width: 6px;
			}

			.lifewiki-diary-content::-webkit-scrollbar-track,
			.lifewiki-input-box::-webkit-scrollbar-track {
				background: transparent;
			}

			.lifewiki-diary-content::-webkit-scrollbar-thumb,
			.lifewiki-input-box::-webkit-scrollbar-thumb {
				background: rgba(204, 195, 214, 0.4);
				border-radius: 3px;
			}

			.lifewiki-diary-content::-webkit-scrollbar-thumb:hover,
			.lifewiki-input-box::-webkit-scrollbar-thumb:hover {
				background: rgba(204, 195, 214, 0.6);
			}
		`;
		this.containerEl.appendChild(styleEl);
	}

	private createInputArea(container: HTMLElement) {
		this.inputAreaEl = container.createEl('div', {
			cls: 'lifewiki-input-area'
		});

		// Input inner container (matches reference design structure)
		const inputInnerEl = this.inputAreaEl.createEl('div', {
			cls: 'lifewiki-input-inner'
		});

		this.inputTextarea = inputInnerEl.createEl('textarea', {
			cls: 'lifewiki-input-box',
			attr: {
				placeholder: '记录今天的生活...'
			}
		}) as HTMLTextAreaElement;

		// Bottom-right: arrow button (like reference design)
		const inputBottomEl = inputInnerEl.createEl('div', {
			cls: 'lifewiki-input-bottom'
		});

		// Hint text on bottom-left (normal mode)
		this.inputHintEl = inputBottomEl.createEl('span', {
			cls: 'lifewiki-input-hint',
			text: 'Enter 发送'
		});

		// Append mode actions (hidden by default)
		this.appendModeActionsEl = inputBottomEl.createEl('div', {
			cls: 'lifewiki-append-mode-actions'
		});

		// Submit button
		this.appendSubmitBtn = this.appendModeActionsEl.createEl('button', {
			cls: 'lifewiki-append-submit-btn',
			text: '将在 HH:mm 这条日记下追加'
		});
		this.appendSubmitBtn.addEventListener('click', () => {
			this.submitAppend();
		});

		// Cancel button
		const cancelBtn = this.appendModeActionsEl.createEl('button', {
			cls: 'lifewiki-append-cancel-btn',
			text: '×'
		});
		cancelBtn.addEventListener('click', () => {
			this.cancelAppendMode();
		});

		// Arrow button on bottom-right (circular with arrow)
		const arrowBtn = inputBottomEl.createEl('button', {
			cls: 'lifewiki-diary-send-btn'
		});
		setIcon(arrowBtn, 'arrow-up');

		// Focus handler - scroll to last block and switch to analysis mode
		this.inputTextarea.addEventListener('focus', () => {
			// Switch to analysis mode when focusing on diary input
			const aiView = this.plugin.getAIAnalysisView();
			aiView?.setMode('analysis');

			// Only scroll to last block when NOT in append mode
			if (!this.isAppendMode) {
				this.scrollToLastBlock();
			}
		});

		// Input handler
		this.inputTextarea.addEventListener('input', () => {
			this.inputValue = this.inputTextarea.value;
			const len = this.inputTextarea.value.length;
			this.inputHintEl.textContent = `${len}/250 · Enter 发送`;
		});

		// Handle Enter key for submission
		this.inputTextarea.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				if (this.isAppendMode) {
					if (!e.shiftKey) {
						// Enter without Shift: submit child block
						e.preventDefault();
						this.submitAppend();
					}
					// Shift+Enter: allow newline (default behavior)
				} else {
					if (!e.shiftKey) {
						// Enter without Shift: submit new block
						e.preventDefault();
						this.submitBlock(this.inputTextarea);
					}
					// Shift+Enter: allow newline (default behavior)
				}
			}
		});

		(this as any).textarea = this.inputTextarea;
	}

	/**
	 * Load blocks from today's diary file
	 * Path: Daily/YYYY-MM-DD.md (following PRD convention)
	 */
	private async loadBlocks() {
		// Try Daily folder (PRD standard)
		const dailyPath = `Daily/${this.currentDate}.md`;
		let file = this.app.vault.getAbstractFileByPath(dailyPath);

		// Try root path
		if (!file || !(file instanceof TFile)) {
			file = this.app.vault.getAbstractFileByPath(`${this.currentDate}.md`);
		}

		// Try 日记 folder
		if (!file || !(file instanceof TFile)) {
			file = this.app.vault.getAbstractFileByPath(`${DIARY_FOLDER}/${this.currentDate}.md`);
		}

		if (!file || !(file instanceof TFile)) {
			// No diary file exists yet - show empty state
			this.renderEmptyState();
			return;
		}

		const content = await this.app.vault.read(file);
		this.parseBlocksFromContent(content);
		this.renderBlocks();
	}

	private renderEmptyState() {
		if (!this.contentContainer) return;

		this.contentContainer.empty();
		this.contentContainer.createEl('div', {
			cls: 'lifewiki-empty-state',
			text: '今天的日记还没有开始。\n在下方输入框记录你的生活吧。'
		});
	}

	/**
	 * Parse diary content into structured blocks
	 * Format:
	 * ### HH:mm [source] #category
	 * Parent block content
	 * - HH:mm Child block content 1
	 * - HH:mm Child block content 2
	 */
	private parseBlocksFromContent(content: string) {
		this.blocks = [];
		const lines = content.split('\n');

		let currentBlock: ParsedBlock | null = null;
		let currentContentLines: string[] = [];
		let currentChildren: ChildBlock[] = [];
		let pendingBlockId: string | null = null; // Block ID found on separate line after content

		for (const line of lines) {
			// Match H3 header: ### HH:mm [source] #category
			const headerMatch = line.match(/^### (\d{2}:\d{2}) \[([^\]]+)\] #(\S+)/);
			if (headerMatch) {
				// Save previous block if exists
				if (currentBlock) {
					// Use pending block ID if found (from line after content)
					if (pendingBlockId) {
						currentBlock.id = pendingBlockId;
					}
					currentBlock.content = currentContentLines.join('\n').trim();
					currentBlock.children = [...currentChildren];
					this.blocks.push(currentBlock);
					pendingBlockId = null;
				}

				// Generate stable ID as default (will be overridden if pendingBlockId found later)
				currentBlock = {
					id: stableId(headerMatch[0]),
					timestamp: headerMatch[1],
					source: headerMatch[2],
					category: headerMatch[3],
					content: '',
					children: [],
					parentId: null
				};
				currentContentLines = [];
				currentChildren = [];
			}
			// Check if this line is ONLY a block ID marker (comes after content on its own line)
			// ONLY matches if the line is EXACTLY the block ID marker (no other content)
			if (currentBlock && !pendingBlockId) {
				const trimmed = line.trim();
				// Match HTML comment block ID ONLY if it's the entire line: <!-- blockId -->
				const htmlCommentMatch = trimmed.match(/^<!-- ([a-f0-9-]+) -->$/);
				if (htmlCommentMatch) {
					pendingBlockId = htmlCommentMatch[1];
					continue; // Skip adding this as content
				}

				// Match <sub> block ID ONLY if it's the entire line with no other content
				// Format: <sub>blockId</sub> or <sub style="...">blockId</sub>
				const subOnlyMatch = trimmed.match(/^<sub[^>]*>([a-f0-9-]+)<\/sub>$/i);
				if (subOnlyMatch) {
					pendingBlockId = subOnlyMatch[1];
					continue;
				}
			}
			// Child block: starts with "- HH:mm " or "- content"
			// Format: - HH:mm content <!-- childId -->
			if (line.startsWith('- ') && currentBlock) {
				// Extract child content and optional ID
				// Regex: - (HH:mm)? ?(content)? ?(?: <!-- ([a-f0-9-]+) -->)?
				const childMatch = line.match(/^- (\d{2}:\d{2})?\s+(.+?)\s*(?:<!-- ([a-f0-9-]+) -->)?$/);
				if (childMatch) {
					const childTimestamp = childMatch[1] || '';
					// Strip HTML comments from child content
					const childContent = (childMatch[2] || '')
					.replace(/<!--[\s\S]*?-->/g, '')  // HTML comments
					.replace(/<sub[^>]*>[\s\S]*?<\/sub>/gi, '')  // <sub> tags
					.trim();
					const childId = childMatch[3] || stableId(line);

					if (childContent) {
						currentChildren.push({
							id: childId,
							timestamp: childTimestamp,
							content: childContent,
							parentId: currentBlock.id
						});
						continue; // Don't treat child line as parent content
					}
				} else {
					// Fallback for simple format without ID - also strip HTML comments
					const childContent = line.substring(2)
						.replace(/<!--[\s\S]*?-->/g, '')  // HTML comments
						.replace(/<sub[^>]*>[\s\S]*?<\/sub>/gi, '')  // <sub> tags
						.trim();
					if (childContent) {
						currentChildren.push({
							id: stableId(line),
							timestamp: '',
							content: childContent,
							parentId: currentBlock.id
						});
					}
					continue; // Don't treat child line as parent content
				}
			}
			// Content line (not empty, not a header, not blockquote)
			if (line.trim() && currentBlock && !line.startsWith('#') && !line.startsWith('>')) {
				// Strip HTML comments and <sub> tags (old format) from content
				const cleanLine = line.trim()
					.replace(/<!--[\s\S]*?-->/g, '')  // HTML comments
					.replace(/<sub[^>]*>[\s\S]*?<\/sub>/gi, '')  // <sub> tags (old block ID format)
					.trim();
				if (cleanLine) {
					currentContentLines.push(cleanLine);
				}
			}
		}

		// Don't forget the last block
		if (currentBlock) {
			// Use pending block ID if found
			if (pendingBlockId) {
				currentBlock.id = pendingBlockId;
			}
			currentBlock.content = currentContentLines.join('\n').trim();
			currentBlock.children = currentChildren;
			this.blocks.push(currentBlock);
		}
	}

	/**
	 * Render all blocks
	 */
	private renderBlocks() {
		if (!this.contentContainer) return;

		this.contentContainer.empty();

		// Add Flow Line (vertical line that runs through all blocks)
		this.flowLineEl = this.contentContainer.createEl('div', {
			cls: 'flow-line'
		});

		if (this.blocks.length === 0) {
			this.renderEmptyState();
			return;
		}

		for (const block of this.blocks) {
			this.renderBlock(block);
		}

		// Extend flow line to the last block
		this.extendFlowLine();

		// Scroll to last block with smooth behavior, 30px above input area (skip in append mode)
		if (!this.isAppendMode) {
			setTimeout(() => {
				this.scrollToLastBlock();
			}, 100);
		}
	}

	/**
	 * Extend flow line to reach the last block (parent or child)
	 */
	private extendFlowLine() {
		if (!this.flowLineEl || !this.contentContainer) return;

		// Use setTimeout to ensure DOM layout is complete
		setTimeout(() => {
			if (!this.flowLineEl || !this.contentContainer) return;

			// Find all block wrappers (parent blocks)
			const blockWrappers = this.contentContainer.querySelectorAll('.lifewiki-block, .lifewiki-block-group');
			if (blockWrappers.length === 0) return;

			// Calculate using offsetTop/offsetHeight (not affected by scroll)
			let maxBottom = 0;
			for (const wrapper of blockWrappers) {
				const wrapperBottom = (wrapper as HTMLElement).offsetTop + (wrapper as HTMLElement).offsetHeight;
				if (wrapperBottom > maxBottom) {
					maxBottom = wrapperBottom;
				}
			}

			// Extend flow line to below the last block
			this.flowLineEl.style.height = `${maxBottom + 30}px`;
		}, 50);
	}

	/**
	 * Scroll to the last block
	 */
	private scrollToLastBlock() {
		if (!this.contentContainer) return;

		// Simply scroll to the bottom
		this.contentContainer.scrollTop = this.contentContainer.scrollHeight;
	}

	/**
	 * Render a single block
	 */
	private renderBlock(block: ParsedBlock) {
		if (!this.contentContainer) return;

		const isSelected = block.id === this.selectedBlockId;
		const isEditing = block.id === this.editModeBlockId;
		const hasChildren = block.children.length > 0;

		// Block wrapper (group if has children, single if not)
		let wrapperClass = hasChildren ? 'lifewiki-block-group' : 'lifewiki-block';
		if (isSelected) wrapperClass += ' selected';
		if (isEditing) wrapperClass += ' editing';

		const blockWrapper = this.contentContainer.createEl('div', {
			cls: wrapperClass,
			attr: { 'data-block-id': block.id }
		});

		// Card
		const card = blockWrapper.createEl('div', {
			cls: 'lifewiki-block-card'
		});

		// Inline row: timestamp + tag + content (like child blocks)
		if (isEditing) {
			// Edit mode: show editable fields
			// Timestamp (read-only)
			card.createEl('span', {
				text: block.timestamp,
				cls: 'lifewiki-block-timestamp'
			});

			// Tag (editable)
			const tagInput = card.createEl('input', {
				cls: 'lifewiki-edit-input',
				attr: { value: block.category, placeholder: '#标签' }
			}) as HTMLInputElement;
			tagInput.dataset.field = 'category';

			// Content (editable textarea)
			const contentTextarea = card.createEl('textarea', {
				cls: 'lifewiki-edit-textarea',
				attr: { placeholder: '输入内容...' }
			}) as HTMLTextAreaElement;
			contentTextarea.value = block.content;
			contentTextarea.dataset.field = 'content';

			// Store references for saving
			(this as any).editTagInput = tagInput;
			(this as any).editContentTextarea = contentTextarea;
		} else {
			// Display mode
			if (block.content) {
				// Wrapper: timestamp + tag + content (all inline-flex)
				const mainWrapper = card.createEl('span', {
					cls: 'lifewiki-main-wrapper'
				});

				// Timestamp
				mainWrapper.createEl('span', {
					text: block.timestamp,
					cls: 'lifewiki-block-timestamp'
				});

				// Tag
				mainWrapper.createEl('span', {
					text: block.category,
					cls: `lifewiki-block-tag ${block.category}`
				});

				// Content
				mainWrapper.createEl('span', {
					text: block.content,
					cls: 'lifewiki-block-content'
				});
			}
		}

		// Add child button (only when selected and not editing) - positioned at end of first line
		// REMOVED: 子Block button functionality - keeping for future use
		// if (isSelected && !isEditing) {
		// 	card.createEl('button', {
		// 		text: '+ 子Block',
		// 		cls: 'lifewiki-add-child-btn'
		// 	});
		// }

		// Children
		if (hasChildren) {
			const childrenEl = blockWrapper.createEl('div', {
				cls: 'lifewiki-block-children'
			});

			for (const child of block.children) {
				const isChildSelected = child.id === this.selectedBlockId;
				const isChildEditing = (this as any).editingChildId === child.id;
				const childEl = childrenEl.createEl('div', {
					cls: 'lifewiki-block-child' + (isChildSelected ? ' selected' : '') + (isChildEditing ? ' editing' : ''),
					attr: { 'data-child-id': child.id }
				});

				// Child card
				const childCard = childEl.createEl('div', {
					cls: 'lifewiki-block-child-card'
				});

				// Child timestamp
				if (child.timestamp) {
					childCard.createEl('span', {
						text: child.timestamp,
						cls: 'lifewiki-block-child-timestamp'
					});
				}

				// Child body
				const childBody = childCard.createEl('div', {
					cls: 'lifewiki-block-child-body'
				});

				if (isChildEditing) {
					// Edit mode: show textarea for content
					const contentTextarea = childBody.createEl('textarea', {
						cls: 'lifewiki-edit-textarea',
						attr: { placeholder: '输入内容...' }
					}) as HTMLTextAreaElement;
					contentTextarea.value = child.content;
					// Store reference for saving
					(this as any).editContentTextarea = contentTextarea;
				} else {
					// Display mode
					childBody.createEl('div', {
						text: child.content,
						cls: 'lifewiki-block-child-content'
					});
				}

				// Click handler for child block - load parent session in AI panel
				childEl.addEventListener('click', (e) => {
					e.stopPropagation();
					if (!this.isEditMode) {
						this.selectChildBlock(child.id, block.id);
					}
				});

				// Double-click to edit child block
				childCard.addEventListener('dblclick', (e) => {
					e.stopPropagation();
					this.startChildEditMode(child.id, block.id);
				});
			}
		}

		// Child input area (only for selected block with active input)
		if (isSelected && this.selectedBlockId === block.id && this.childInputEl) {
			blockWrapper.appendChild(this.childInputEl);
		}

		// Click to select (enter append mode)
		card.addEventListener('click', () => {
			if (!this.isEditMode) {
				this.selectBlock(block.id);
			}
		});

		// Double-click to edit
		card.addEventListener('dblclick', () => {
			this.startEditMode(block.id);
		});
	}

	/**
	 * Select a block and enter append mode
	 */
	private selectBlock(blockId: string) {
		// Clear any existing child input
		this.childInputEl = null;

		// Exit edit mode if active
		this.isEditMode = false;
		this.editModeBlockId = null;

		this.selectedBlockId = blockId;
		this.isAppendMode = true;
		this.appendModeBlockId = blockId;

		this.updateInputAreaForAppendMode();
		this.renderBlocks();

		// Notify AI panel
		const block = this.blocks.find(b => b.id === blockId);
		if (block) {
			this.selectedBlockContent = block.content;
			const aiView = this.plugin.getAIAnalysisView();
			if (aiView) {
				aiView.setMode('analysis');
				aiView.setActiveBlock(blockId, block.content);
			}
		}
	}

	/**
	 * Select a child block and load parent's session in AI panel
	 */
	private selectChildBlock(childId: string, parentId: string) {
		// Clear any existing child input
		this.childInputEl = null;

		// Exit edit mode if active
		this.isEditMode = false;
		this.editModeBlockId = null;

		// Set selected block to child (for visual highlight)
		this.selectedBlockId = childId;

		// Do NOT enter append mode for child blocks
		this.isAppendMode = false;
		this.appendModeBlockId = null;

		// Re-render to show selection
		this.renderBlocks();

		// Find the parent block and load its session in AI panel
		const parentBlock = this.blocks.find(b => b.id === parentId);
		if (parentBlock) {
			this.selectedBlockContent = parentBlock.content;
			const aiView = this.plugin.getAIAnalysisView();
			if (aiView) {
				aiView.setMode('analysis');
				// Pass parentId so AI panel knows to load parent's session
				aiView.setActiveBlock(childId, parentBlock.content, parentId);
			}
		}
	}

	/**
	 * Start edit mode for a child block
	 */
	private startChildEditMode(childId: string, parentId: string) {
		// Cancel any active modes
		this.isAppendMode = false;
		this.appendModeBlockId = null;
		this.selectedBlockId = null;

		// Set edit mode state - store child ID in a special field
		this.editModeBlockId = childId;
		this.isEditMode = true;
		(this as any).editingChildId = childId;
		(this as any).editingParentId = parentId;

		this.renderBlocks();

		// Focus the content textarea
		setTimeout(() => {
			const textarea = this.contentContainer?.querySelector('.lifewiki-edit-textarea') as HTMLTextAreaElement;
			if (textarea) {
				textarea.focus();
				textarea.addEventListener('keydown', this.handleChildEditKeydown.bind(this));
			}
		}, 0);
	}

	/**
	 * Handle keydown in child edit mode
	 */
	private handleChildEditKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			this.saveChildEditMode();
		} else if (e.key === 'Escape') {
			this.cancelChildEditMode();
		}
	}

	/**
	 * Cancel child edit mode
	 */
	private cancelChildEditMode() {
		this.isEditMode = false;
		this.editModeBlockId = null;
		(this as any).editingChildId = null;
		(this as any).editingParentId = null;
		this.renderBlocks();
	}

	/**
	 * Save child edit mode changes
	 */
	private async saveChildEditMode() {
		const childId = (this as any).editingChildId;
		const parentId = (this as any).editingParentId;
		if (!childId || !parentId) return;

		const parentBlock = this.blocks.find(b => b.id === parentId);
		if (!parentBlock) return;

		const childIndex = parentBlock.children.findIndex((c: ChildBlock) => c.id === childId);
		if (childIndex === -1) return;

		const textarea = this.contentContainer?.querySelector('.lifewiki-edit-textarea') as HTMLTextAreaElement;
		const newContent = textarea?.value.trim() || '';

		// Update child block
		parentBlock.children[childIndex].content = newContent;

		// Save to file
		await this.saveBlockToFile(parentBlock);

		// Exit edit mode
		this.isEditMode = false;
		this.editModeBlockId = null;
		(this as any).editingChildId = null;
		(this as any).editingParentId = null;

		this.renderBlocks();
	}

	/**
	 * Update input area for append mode
	 */
	private updateInputAreaForAppendMode() {
		if (!this.inputTextarea || !this.inputHintEl || !this.appendModeActionsEl || !this.appendSubmitBtn) {
			return;
		}

		const block = this.blocks.find(b => b.id === this.appendModeBlockId);

		if (this.isAppendMode && block) {
			// Show append mode UI
			this.inputTextarea.addClass('append-mode');
			this.inputTextarea.placeholder = '追加记录...';
			this.inputHintEl.textContent = `将在 ${block.timestamp} 该条日记下追加记录`;
			this.inputHintEl.setAttribute('style', 'display: none;');
			this.appendSubmitBtn.textContent = `将在 ${block.timestamp} 这条日记下追加`;
			this.appendModeActionsEl.classList.add('visible');
			this.inputTextarea.value = '';
			this.inputValue = '';
			setTimeout(() => this.inputTextarea?.focus(), 0);
		} else {
			// Normal mode
			this.inputTextarea.removeClass('append-mode');
			this.inputTextarea.placeholder = '记录今天的生活...';
			this.inputHintEl.textContent = 'Enter 发送 · 最多 250 字';
			this.inputHintEl.removeAttribute('style');
			this.appendModeActionsEl.classList.remove('visible');
		}
	}

	/**
	 * Cancel append mode
	 */
	private cancelAppendMode() {
		this.isAppendMode = false;
		this.appendModeBlockId = null;
		this.selectedBlockId = null;
		this.updateInputAreaForAppendMode();
		this.renderBlocks();
	}

	/**
	 * Submit append (add child block)
	 */
	private async submitAppend() {
		if (!this.isAppendMode || !this.appendModeBlockId) return;

		const content = this.inputTextarea.value.trim();
		if (!content) return;

		const parentBlock = this.blocks.find(b => b.id === this.appendModeBlockId);
		if (!parentBlock) return;

		// Save to file and get the created child block
		const childBlock = await this.appendChildToBlock(parentBlock, content);
		if (!childBlock) return;

		// Add child to local state
		parentBlock.children.push(childBlock);

		// Clear append mode
		this.inputTextarea.value = '';
		this.inputValue = '';
		this.isAppendMode = false;
		this.appendModeBlockId = null;
		this.selectedBlockId = null;

		this.updateInputAreaForAppendMode();
		this.renderBlocks();

		// Start AI analysis for the child block (with parent context)
		await this.startAIAnalysis(childBlock as any);
	}

	/**
	 * Start edit mode for a block
	 */
	private startEditMode(blockId: string) {
		// Cancel append mode first
		this.isAppendMode = false;
		this.appendModeBlockId = null;
		this.selectedBlockId = null;

		this.editModeBlockId = blockId;
		this.isEditMode = true;
		this.renderBlocks();

		// Focus the content textarea
		setTimeout(() => {
			const textarea = this.contentContainer?.querySelector('.lifewiki-edit-textarea') as HTMLTextAreaElement;
			if (textarea) {
				textarea.focus();
				textarea.addEventListener('keydown', this.handleEditKeydown.bind(this));
			}
		}, 0);
	}

	/**
	 * Handle keydown in edit mode
	 */
	private handleEditKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			this.saveEditMode();
		} else if (e.key === 'Escape') {
			this.cancelEditMode();
		}
	}

	/**
	 * Save edit mode changes
	 */
	private async saveEditMode() {
		if (!this.editModeBlockId) return;

		const block = this.blocks.find(b => b.id === this.editModeBlockId);
		if (!block) return;

		// Get edited values
		const textarea = this.contentContainer?.querySelector('.lifewiki-edit-textarea') as HTMLTextAreaElement;
		const tagInput = this.contentContainer?.querySelector('.lifewiki-edit-input') as HTMLInputElement;

		const newContent = textarea?.value.trim() || '';
		const newCategory = tagInput?.value.trim() || block.category;

		// Update block
		block.content = newContent;
		block.category = newCategory;

		// Exit edit mode
		this.isEditMode = false;
		this.editModeBlockId = null;

		this.renderBlocks();

		// Save to file
		await this.saveBlockToFile(block);
	}

	/**
	 * Cancel edit mode without saving
	 */
	private cancelEditMode() {
		this.isEditMode = false;
		this.editModeBlockId = null;
		this.renderBlocks();
	}

	/**
	 * Exit edit mode (called when clicking outside)
	 */
	private exitEditMode() {
		if (this.isEditMode) {
			this.saveEditMode();
		}
	}

	/**
	 * Append a child block to the parent block in the diary file
	 * Returns the created ChildBlock object
	 */
	private async appendChildToBlock(parentBlock: ParsedBlock, childContent: string): Promise<ChildBlock | null> {
		// Find the diary file
		const dailyPath = `Daily/${this.currentDate}.md`;
		let file = this.app.vault.getAbstractFileByPath(dailyPath);

		if (!file || !(file instanceof TFile)) {
			file = this.app.vault.getAbstractFileByPath(`${this.currentDate}.md`);
		}

		if (!file || !(file instanceof TFile)) {
			file = this.app.vault.getAbstractFileByPath(`${DIARY_FOLDER}/${this.currentDate}.md`);
		}

		if (!(file instanceof TFile)) return null;

		// Read file and find the parent block to append child after it
		const content = await this.app.vault.read(file);
		const lines = content.split('\n');

		// Find the line with the parent block header
		const parentHeader = `### ${parentBlock.timestamp} [${parentBlock.source}] #${parentBlock.category}`;
		let parentLineIndex = -1;

		for (let i = 0; i < lines.length; i++) {
			if (lines[i].includes(parentHeader)) {
				parentLineIndex = i;
				break;
			}
		}

		if (parentLineIndex === -1) return null;

		// Find where the parent block ends (next ### header or end of file)
		let insertIndex = lines.length;
		for (let i = parentLineIndex + 1; i < lines.length; i++) {
			if (lines[i].startsWith('### ')) {
				insertIndex = i;
				break;
			}
		}

		// Build the child block
		const now = new Date();
		const childTimestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
		const childId = uuid();

		// Format: - HH:mm content (block ID as HTML comment, invisible in render)
		const childLine = `- ${childTimestamp} ${childContent} <!-- ${childId} -->`;

		// Insert the child line
		lines.splice(insertIndex, 0, childLine);

		// Write back
		await this.app.vault.modify(file, lines.join('\n'));

		// Return the child block object
		return {
			id: childId,
			timestamp: childTimestamp,
			content: childContent,
			parentId: parentBlock.id
		};
	}

	/**
	 * Save a block's changes to the diary file
	 */
	private async saveBlockToFile(block: ParsedBlock) {
		// Find the diary file
		const dailyPath = `Daily/${this.currentDate}.md`;
		let file = this.app.vault.getAbstractFileByPath(dailyPath);

		if (!file || !(file instanceof TFile)) {
			file = this.app.vault.getAbstractFileByPath(`${this.currentDate}.md`);
		}

		if (!file || !(file instanceof TFile)) {
			file = this.app.vault.getAbstractFileByPath(`${DIARY_FOLDER}/${this.currentDate}.md`);
		}

		if (!(file instanceof TFile)) return;

		const content = await this.app.vault.read(file);
		const lines = content.split('\n');

		// Find the line with the block header by timestamp only
		// Use regex to match header pattern: ### HH:mm [source] #category
		let blockLineIndex = -1;
		const headerRegex = new RegExp(`^### ${block.timestamp} \\[([^\\]]+)\\] #(\\S+)`);
		for (let i = 0; i < lines.length; i++) {
			const match = lines[i].match(headerRegex);
			if (match) {
				blockLineIndex = i;
				break;
			}
		}

		if (blockLineIndex === -1) return;

		// Rebuild the block header (block ID is kept at end of content)
		const newHeader = `### ${block.timestamp} [${block.source}] #${block.category}`;
		lines[blockLineIndex] = newHeader;

		// Update content lines (after header, until next ### or child)
		let updateIndex = blockLineIndex + 1;
		while (updateIndex < lines.length) {
			if (lines[updateIndex].startsWith('### ') || (lines[updateIndex].startsWith('- ') && lines[updateIndex].match(/^- \d{2}:\d{2}\s/))) {
				break;
			}
			if (lines[updateIndex].trim() && !lines[updateIndex].startsWith('#')) {
				lines[updateIndex] = block.content;
				break;
			}
			updateIndex++;
		}

		// If no existing content line, add content after header
		if (updateIndex >= lines.length || lines[updateIndex].trim() === '') {
			// Insert content after header
			lines.splice(blockLineIndex + 1, 0, block.content);
		}

		// Write back
		await this.app.vault.modify(file, lines.join('\n'));
	}

	/**
	 * Submit a new block
	 */
	private async submitBlock(textarea: HTMLTextAreaElement) {
		const content = textarea.value.trim();
		if (!content || this.isLoading) return;

		this.isLoading = true;

		const now = new Date();
		const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

		const newBlock: ParsedBlock = {
			id: uuid(),
			timestamp,
			source: 'Lifewiki',
			category: '待分析',
			content,
			children: [],
			parentId: null
		};

		// Add to local state
		this.blocks.push(newBlock);
		textarea.value = '';
		this.inputValue = '';

		// Re-render
		this.renderBlocks();

		// Append to file
		await this.appendBlockToFile(newBlock);

		// Start AI analysis
		await this.startAIAnalysis(newBlock);

		this.isLoading = false;
	}

	/**
	 * Append a new block to the diary file
	 */
	private async appendBlockToFile(block: ParsedBlock) {
		// Primary path: Daily/YYYY-MM-DD.md
		const dailyPath = `Daily/${this.currentDate}.md`;
		let file = this.app.vault.getAbstractFileByPath(dailyPath);

		// Ensure Daily folder exists
		if (!(file instanceof TFile)) {
			const dailyFolder = this.app.vault.getAbstractFileByPath('Daily');
			if (!(dailyFolder instanceof TFolder)) {
				await this.app.vault.createFolder('Daily');
			}
		}

		// Try root path as fallback
		if (!file || !(file instanceof TFile)) {
			file = this.app.vault.getAbstractFileByPath(`${this.currentDate}.md`);
		}

		if (!(file instanceof TFile)) {
			// Create new file with template header
			const templateContent = await loadTemplate(
				this.app.vault,
				'journal-template.md',
				{
					date: this.currentDate
				}
			);
			const newContent = templateContent + `\n### ${block.timestamp} [${block.source}] #${block.category}\n${block.content}\n<!-- ${block.id} -->\n`;
			await this.app.vault.create(dailyPath, newContent);
			return;
		}

		// Build block text with block ID as HTML comment (invisible in rendered view)
		const blockText = `\n### ${block.timestamp} [${block.source}] #${block.category}\n${block.content}\n<!-- ${block.id} -->\n`;

		const existing = await this.app.vault.read(file);
		await this.app.vault.modify(file, existing + blockText);
	}

	/**
	 * Start AI analysis for a block
	 */
	private async startAIAnalysis(block: ParsedBlock | ChildBlock) {
		const sessionManager = this.plugin.getSessionManager();
		const aiView = this.plugin.getAIAnalysisView();

		// For child blocks, use parent's session
		const effectiveParentId = (block as any).parentId || null;

		// For child blocks, always trigger new AI analysis (skip history check)
		// For parent blocks, check if session already has history
		if (!effectiveParentId) {
			const existingSession = sessionManager.getSession(block.id, effectiveParentId);
			const hasHistory = existingSession && existingSession.messages && existingSession.messages.length > 0;

			if (hasHistory) {
				// Load existing session in AI panel AND enter append mode
				this.selectBlock(block.id); // Enter append mode
				if (aiView) {
					aiView.setMode('analysis');
					aiView.setActiveBlock(block.id, block.content);
				}
				return;
			}
		}

		// Create session first (uses parent's session if child block)
		sessionManager.getOrCreateSession(block.id, effectiveParentId);

		let result: any;

		// Build sibling blocks list for child block context
		const siblingBlocks: { id: string; content: string }[] = [];
		if (effectiveParentId) {
			const parentBlock = this.blocks.find(b => b.id === effectiveParentId);
			if (parentBlock) {
				// Get other siblings' id and content
				for (const sibling of parentBlock.children) {
					if (sibling.id !== block.id) {
						siblingBlocks.push({ id: sibling.id, content: sibling.content });
					}
				}
			}
		}

		try {
			// Use LangGraph agent
			const agent = this.plugin.getLangGraphAgent();
			if (agent) {
				result = await agent.startBlockAnalysis(block.id, block.content, effectiveParentId, siblingBlocks);
			} else {
				throw new Error('AI agent not available');
			}

			// Notify AI panel - use parent's content if child block
			if (aiView) {
				const displayContent = effectiveParentId
					? this.blocks.find(b => b.id === effectiveParentId)?.content || block.content
					: block.content;
				aiView.startNewSession(block.id, displayContent, result.initialResponse || '', effectiveParentId);
			}

			// Update block category based on AI analysis result (only for parent blocks with initial placeholder)
			if (!effectiveParentId && (block as ParsedBlock).category === '待分析' && result.areas && result.areas.length > 0) {
				const newCategory = result.areas[0];
				(block as ParsedBlock).category = newCategory;
				await this.saveBlockToFile(block as ParsedBlock);
				// Refresh the view to show updated category tag
				this.renderBlocks();
			}
		} catch (error) {
			// Show error in AI panel
			if (aiView) {
				const displayContent = effectiveParentId
					? this.blocks.find(b => b.id === effectiveParentId)?.content || block.content
					: block.content;
				aiView.startNewSession(block.id, displayContent, `错误: ${(error as Error).message}`);
			}
		}
	}

	/**
	 * Update block category based on AI area analysis
	 */
	private async updateBlockCategory(block: ParsedBlock) {
		try {
			const provider = this.plugin.getAIProvider();
			const analysisResult = await provider.analyzeBlock(block.content);

			if (analysisResult.areas && analysisResult.areas.length > 0) {
				const newCategory = analysisResult.areas[0];
				block.category = newCategory;
				await this.saveBlockToFile(block);
			}
		} catch (error) {
			// Silent fail for category update
		}
	}

	private formatDate(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	async onClose() {
		// Clean up
	}
}
