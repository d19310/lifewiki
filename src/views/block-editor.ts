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

import { ItemView, WorkspaceLeaf, TFile, TFolder } from 'obsidian';
import type LifeWikiPlugin from '../main';
import { Block } from '../entities/types';

export const VIEW_TYPE_BLOCK_EDITOR = 'lifewiki-block-editor';

// Diary file path -日记存储在 Vault 根目录的 日记文件夹
const DIARY_FOLDER = '日记';

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

interface ParsedBlock {
	id: string;
	timestamp: string;      // HH:mm
	source: string;         // [Lifewiki]
	category: string;       // #工作 或 #个人
	content: string;         // 父Block正文
	children: string[];     // 子Block内容数组
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

	async onOpen() {
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
			}

			/* Block Group - Parent with children */
			.lifewiki-block-group {
				position: relative;
				display: flex;
				flex-direction: column;
				margin-bottom: 20px;
			}

			.lifewiki-block-group:last-child {
				margin-bottom: 0;
			}

			/* Block Group Tree Line - vertical line spanning all children */
			.lifewiki-block-group::before {
				content: '';
				position: absolute;
				left: 38px;
				top: 0;
				bottom: 0;
				width: 1px;
				background-color: var(--outline-variant);
				z-index: 0;
				opacity: 0.4;
			}

			/* Single Block */
			.lifewiki-block {
				position: relative;
				z-index: 1;
				cursor: pointer;
				transition: transform 0.2s ease;
				margin-bottom: 20px;
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
				padding: 20px;
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

			.lifewiki-block.selected .lifewiki-block-card {
				background: var(--surface-container-high);
			}

			/* Timestamp Label - inline with content */
			.lifewiki-block-timestamp {
				font-size: 12px;
				font-weight: 500;
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

			/* Block Content Text - inline with timestamp */
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
				gap: 8px;
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
				margin-left: 52px;
				padding-left: 20px;
				padding-top: 16px;
				border-left: none;
				position: relative;
				display: flex;
				flex-direction: column;
				gap: 16px;
			}

			/* Horizontal line connecting vertical line to first child */
			.lifewiki-block-children::before {
				content: '';
				position: absolute;
				left: -20px;
				top: 16px;
				width: 20px;
				height: 1px;
				background: rgba(204, 195, 214, 0.5);
			}

			/* Child Block */
			.lifewiki-block-child {
				position: relative;
			}

			/* Child Card - matches parent card style */
			.lifewiki-block-child-card {
				background: var(--surface-container-lowest);
				border-radius: 8px;
				padding: 20px;
				border: 1px solid rgba(204, 195, 214, 0.15);
				box-shadow: 0 10px 40px -10px rgba(26, 28, 28, 0.06);
				display: flex;
				align-items: flex-start;
				gap: 12px;
			}

			/* Child Header */
			.lifewiki-block-child-header {
				display: flex;
				align-items: center;
				gap: 12px;
				margin-bottom: 8px;
			}

			.lifewiki-block-child-timestamp {
				font-size: 12px;
				font-weight: 500;
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
				margin-top: 8px;
				display: flex;
				gap: 8px;
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

			/* Input Card */
			.lifewiki-input-box {
				width: 100%;
				min-height: 80px;
				max-height: 200px;
				padding: 16px 20px;
				font-size: 14px;
				line-height: 1.6;
				border: 1px solid rgba(204, 195, 214, 0.15);
				border-radius: 16px;
				background: var(--surface-container-high) !important;
				color: var(--on-surface);
				resize: vertical;
				font-family: var(--font-body);
				box-sizing: border-box;
				box-shadow: 0 10px 40px -10px rgba(26, 28, 28, 0.06);
				transition: none;
			}

			.lifewiki-input-box:focus {
				outline: none;
				border-color: rgba(204, 195, 214, 0.15);
				box-shadow: 0 10px 40px -10px rgba(26, 28, 28, 0.06);
				background: var(--surface-container-high) !important;
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
				margin-top: 10px;
				text-align: right;
				opacity: 0.7;
				font-family: var(--font-body);
			}

			/* Empty State */
			.lifewiki-empty-state {
				text-align: center;
				padding: 64px 48px;
				color: var(--on-surface-variant);
				font-size: 14px;
				line-height: 1.7;
				font-family: var(--font-body);
				background: var(--surface-container-lowest);
				border-radius: 16px;
				border: 1px solid rgba(204, 195, 214, 0.15);
				box-shadow: 0 10px 40px -10px rgba(26, 28, 28, 0.06);
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
		const inputArea = container.createEl('div', {
			cls: 'lifewiki-input-area'
		});

		const textarea = inputArea.createEl('textarea', {
			cls: 'lifewiki-input-box',
			attr: {
				placeholder: '记录今天的生活...',
				rows: '3'
			}
		});

		// Character count
		const hint = inputArea.createEl('div', {
			cls: 'lifewiki-input-hint',
			text: 'Enter 发送 · 最多 250 字'
		});

		// Input handler
		textarea.addEventListener('input', () => {
			this.inputValue = textarea.value;
			const len = textarea.value.length;
			hint.setText(`${len}/250 · Enter 发送`);
		});

		// Submit on Enter (without Shift)
		textarea.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.submitBlock(textarea);
			}
		});

		(this as any).textarea = textarea;
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
		let currentChildren: string[] = [];

		for (const line of lines) {
			// Match H3 header: ### HH:mm [source] #category <!-- blockId -->
			const headerMatch = line.match(/^### (\d{2}:\d{2}) \[([^\]]+)\] #(\S+)(?: <!-- ([a-f0-9-]+) -->)?/);

			if (headerMatch) {
				// Save previous block if exists
				if (currentBlock) {
					currentBlock.content = currentContentLines.join('\n').trim();
					currentBlock.children = [...currentChildren];
					this.blocks.push(currentBlock);
				}

				// Use embedded blockId if present, otherwise generate stable ID
				const blockId = headerMatch[4] || stableId(headerMatch[0]);
				currentBlock = {
					id: blockId,
					timestamp: headerMatch[1],
					source: headerMatch[2],
					category: headerMatch[3],
					content: '',
					children: []
				};
				currentContentLines = [];
				currentChildren = [];
			}
			// Child block: starts with "- HH:mm " or "- content"
			else if (line.startsWith('- ') && currentBlock) {
				// Extract child content (remove "- " prefix, keep timestamp if present)
				const childContent = line.substring(2).trim();
				if (childContent) {
					currentChildren.push(childContent);
				}
			}
			// Content line (not empty, not a header, not blockquote)
			else if (line.trim() && currentBlock && !line.startsWith('#') && !line.startsWith('>')) {
				currentContentLines.push(line.trim());
			}
		}

		// Don't forget the last block
		if (currentBlock) {
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

		if (this.blocks.length === 0) {
			this.renderEmptyState();
			return;
		}

		for (const block of this.blocks) {
			this.renderBlock(block);
		}

		// Scroll to last block with smooth behavior, 30px above input area
		setTimeout(() => {
			this.scrollToLastBlock();
		}, 100);
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
		const hasChildren = block.children.length > 0;

		// Block wrapper (group if has children, single if not)
		const blockWrapper = this.contentContainer.createEl('div', {
			cls: hasChildren ? 'lifewiki-block-group' : 'lifewiki-block',
			attr: { 'data-block-id': block.id }
		});

		// Card
		const card = blockWrapper.createEl('div', {
			cls: 'lifewiki-block-card'
		});

		// Inline row: timestamp + tag + content (like child blocks)
		if (block.content) {
			// Timestamp
			card.createEl('span', {
				text: block.timestamp,
				cls: 'lifewiki-block-timestamp'
			});

			// Tag (between timestamp and content)
			card.createEl('span', {
				text: block.category,
				cls: `lifewiki-block-tag ${block.category}`
			});

			// Content inline
			card.createEl('span', {
				text: block.content,
				cls: 'lifewiki-block-content'
			});
		}

		// Add child button (only when selected) - positioned at end of first line
		if (isSelected) {
			card.createEl('button', {
				text: '+ 子Block',
				cls: 'lifewiki-add-child-btn'
			});
		}

		// Children
		if (hasChildren) {
			const childrenEl = blockWrapper.createEl('div', {
				cls: 'lifewiki-block-children'
			});

			for (const child of block.children) {
				// Parse child timestamp if present (format: "HH:mm content" or just "content")
				const childMatch = child.match(/^(\d{2}:\d{2})\s+(.+)$/);
				const childTimestamp = childMatch ? childMatch[1] : '';
				const childContent = childMatch ? childMatch[2] : child;

				const childEl = childrenEl.createEl('div', {
					cls: 'lifewiki-block-child'
				});

				// Child card
				const childCard = childEl.createEl('div', {
					cls: 'lifewiki-block-child-card'
				});

				// Child timestamp
				if (childTimestamp) {
					childCard.createEl('span', {
						text: childTimestamp,
						cls: 'lifewiki-block-child-timestamp'
					});
				}

				// Child body
				const childBody = childCard.createEl('div', {
					cls: 'lifewiki-block-child-body'
				});

				childBody.createEl('div', {
					text: childContent,
					cls: 'lifewiki-block-child-content'
				});
			}
		}

		// Child input area (only for selected block with active input)
		if (isSelected && this.selectedBlockId === block.id && this.childInputEl) {
			blockWrapper.appendChild(this.childInputEl);
		}

		// Click to select
		card.addEventListener('click', () => {
			this.selectBlock(block.id);
		});
	}

	/**
	 * Select a block and notify AI panel
	 */
	private selectBlock(blockId: string) {
		// Clear any existing child input
		this.childInputEl = null;

		this.selectedBlockId = blockId;
		this.renderBlocks();

		// Notify AI panel
		const block = this.blocks.find(b => b.id === blockId);
		if (block) {
			this.selectedBlockContent = block.content;
			const aiView = this.plugin.getAIAnalysisView();
			if (aiView) {
				aiView.setActiveBlock(blockId, block.content);
			}
		}
	}

	/**
	 * Show child block input area
	 */
	private showChildInput(blockId: string) {
		const block = this.blocks.find(b => b.id === blockId);
		if (!block) return;

		// Create child input container
		const childInputArea = document.createElement('div');
		childInputArea.className = 'lifewiki-child-input-area';

		const textarea = childInputArea.createEl('textarea', {
			cls: 'lifewiki-child-input',
			attr: {
				placeholder: '添加子Block...',
				rows: '1'
			}
		}) as HTMLTextAreaElement;

		const hint = childInputArea.createEl('div', {
			cls: 'lifewiki-child-input-hint',
			text: 'Enter 发送 · Shift+Enter 换行'
		});

		// Auto-resize textarea
		textarea.addEventListener('input', () => {
			textarea.style.height = 'auto';
			textarea.style.height = textarea.scrollHeight + 'px';
		});

		// Submit on Enter (without Shift)
		textarea.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.submitChildBlock(block.id, textarea.value);
			}
		});

		// Store reference and re-render
		this.childInputEl = childInputArea;
		this.renderBlocks();

		// Focus the textarea
		setTimeout(() => textarea.focus(), 0);
	}

	/**
	 * Submit a child block under the selected parent block
	 */
	private async submitChildBlock(parentBlockId: string, content: string) {
		const trimmedContent = content.trim();
		if (!trimmedContent) return;

		const parentBlock = this.blocks.find(b => b.id === parentBlockId);
		if (!parentBlock) return;

		// Add child to local state
		parentBlock.children.push(trimmedContent);

		// Clear input
		this.childInputEl = null;

		// Re-render
		this.renderBlocks();

		// Append child to file
		await this.appendChildToBlock(parentBlock, trimmedContent);
	}

	/**
	 * Append a child block to the parent block in the diary file
	 */
	private async appendChildToBlock(parentBlock: ParsedBlock, childContent: string) {
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

		if (parentLineIndex === -1) return;

		// Find where the parent block ends (next ### header or end of file)
		let insertIndex = lines.length;
		for (let i = parentLineIndex + 1; i < lines.length; i++) {
			if (lines[i].startsWith('### ')) {
				insertIndex = i;
				break;
			}
		}

		// Build the child line
		const now = new Date();
		const childTimestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
		const childLine = `- ${childTimestamp} ${childContent}`;

		// Insert the child line
		lines.splice(insertIndex, 0, childLine);

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
			category: '待确认',
			content,
			children: []
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
			const templateContent = `# ${this.currentDate}\n> [!NOTE] 日记是AI时代人生最大的复利\n\n## Flow of Today：\n`;
			const newContent = templateContent + `\n### ${block.timestamp} [${block.source}] #${block.category}\n${block.content}`;
			await this.app.vault.create(dailyPath, newContent);
			return;
		}

		// Build block text with block ID embedded as HTML comment
		const blockText = `\n### ${block.timestamp} [${block.source}] #${block.category} <!-- ${block.id} -->\n${block.content}`;

		const existing = await this.app.vault.read(file);
		await this.app.vault.modify(file, existing + blockText);
	}

	/**
	 * Start AI analysis for a block
	 */
	private async startAIAnalysis(block: ParsedBlock) {
		const sessionManager = this.plugin.getSessionManager();
		const aiView = this.plugin.getAIAnalysisView();

		// Check if session already has history
		const existingSession = sessionManager.getSession(block.id);
		console.log('[BlockEditor] startAIAnalysis for block:', block.id);
		console.log('[BlockEditor] existingSession:', existingSession ? `messages=${existingSession.messages.length}` : 'null');
		const hasHistory = existingSession && existingSession.messages && existingSession.messages.length > 0;
		console.log('[BlockEditor] hasHistory:', hasHistory);

		if (hasHistory) {
			// Load existing session and show history
			console.log('[BlockEditor] Loading existing session for block:', block.id);
			if (aiView) {
				aiView.setActiveBlock(block.id, block.content);
			}
			return;
		}

		// Create session first
		sessionManager.getOrCreateSession(block.id);

		let result: any;

		try {
			// Use LangGraph agent if enabled, otherwise use ConversationFlow
			if (this.plugin.settings.useLangGraph && this.plugin.getLangGraphAgent()) {
				console.log('[BlockEditor] Using LangGraph agent');
				const agent = this.plugin.getLangGraphAgent()!;
				result = await agent.startBlockAnalysis(block.id, block.content);
			} else {
				console.log('[BlockEditor] Using ConversationFlow, useLangGraph:', this.plugin.settings.useLangGraph);
				const flow = this.plugin.getConversationFlow();
				result = await flow.startBlockAnalysis(block.id, block.content);
			}

			console.log('[BlockEditor] AI result:', JSON.stringify(result));

			// Notify AI panel
			if (aiView) {
				aiView.startNewSession(block.id, block.content, result.initialResponse || '');
			}
		} catch (error) {
			console.error('[BlockEditor] AI analysis failed:', error);
			// Show error in AI panel
			if (aiView) {
				aiView.startNewSession(block.id, block.content, `错误: ${(error as Error).message}`);
			}
		}
	}

	private formatDate(date: Date): string {
		return date.toISOString().split('T')[0];
	}

	async onClose() {
		// Clean up
	}
}
