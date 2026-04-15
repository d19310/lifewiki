/**
 * Block Editor View
 * Main UI for the journal block editor
 */

import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import type LifeWikiPlugin from '../main';
import { Block, AnalysisResult } from '../entities/types';
import { generateConfirmationItems, createEntityFromConfirmation, getEntityTypeLabel, getEntityTypeEmoji, type ConfirmationItem } from './confirmation-dialog';
import { generateAnalysisSummary, getEntityEmoji, type AnalysisSummary } from './analysis-panel';

export const VIEW_TYPE_BLOCK_EDITOR = 'lifewiki-block-editor';

function uuid(): string {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
		const r = Math.random() * 16 | 0;
		const v = c === 'x' ? r : (r & 0x3 | 0x8);
		return v.toString(16);
	});
}

export class BlockEditorView extends ItemView {
	private plugin: LifeWikiPlugin;
	private blocks: Block[] = [];
	private selectedBlockId: string | null = null;
	private currentDate: string;
	private inputValue: string = '';
	private isLoading: boolean = false;
	private analysisPanelEl: HTMLElement | null = null;
	private currentAnalysisSummary: AnalysisSummary | null = null;
	private confirmationItems: ConfirmationItem[] = [];

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

		// Main layout
		container.createEl('div', {
			cls: 'lifewiki-container',
			attr: { style: 'display: flex; height: 100%; width: 100%;' }
		});

		// Left: AI Analysis Panel (empty, no text)
		this.createAnalysisPanel(container.createEl('div', {
			cls: 'lifewiki-analysis-panel',
			attr: { style: 'width: 280px; border-right: 1px solid var(--background-modifier-border); padding: 16px; overflow-y: auto;' }
		}));

		// Right: Block Editor
		this.createBlockEditor(container.createEl('div', {
			cls: 'lifewiki-block-editor',
			attr: { style: 'flex: 1; display: flex; flex-direction: column; padding: 16px;' }
		}));

		// Load today's blocks
		await this.loadBlocks();
	}

	private createAnalysisPanel(container: HTMLElement) {
		this.analysisPanelEl = container;

		// Header
		const header = container.createEl('div', {
			attr: { style: 'font-weight: 600; font-size: 14px; margin-bottom: 16px;' }
		});
		header.createEl('span', { text: '🔍 ' });
		header.createEl('span', { text: 'AI 分析' });

		// Stats summary
		const statsEl = container.createEl('div', {
			cls: 'lifewiki-stats',
			attr: { style: 'font-size: 12px; color: var(--text-muted); margin-bottom: 16px;' }
		});

		// Entity sections
		const sections: Array<{ key: keyof AnalysisSummary; emoji: string }> = [
			{ key: 'people', emoji: '👤' },
			{ key: 'projects', emoji: '📋' },
			{ key: 'things', emoji: '💡' },
			{ key: 'ideas', emoji: '💭' },
			{ key: 'knowledge', emoji: '📚' }
		];

		for (const section of sections) {
			const sectionEl = container.createEl('div', {
				cls: `lifewiki-section-${section.key}`,
				attr: { style: 'margin-bottom: 12px;' }
			});

			sectionEl.createEl('div', {
				text: `${section.emoji} ${getEntityEmojiLabel(section.key)}`,
				attr: { style: 'font-size: 12px; font-weight: 500; color: var(--text-muted); margin-bottom: 4px;' }
			});

			sectionEl.createEl('div', {
				cls: `lifewiki-${section.key}-list`,
				attr: { style: 'font-size: 13px;' }
			});
		}

		this.renderAnalysisPanel();
	}

	private getEntityEmojiLabel(key: string): string {
		const labels: Record<string, string> = {
			people: '人脉',
			projects: '项目',
			things: '物品',
			ideas: '想法',
			knowledge: '知识'
		};
		return labels[key] || key;
	}

	private renderAnalysisPanel() {
		if (!this.analysisPanelEl) return;

		// Update stats
		const statsEl = this.analysisPanelEl.querySelector('.lifewiki-stats');
		if (statsEl && this.currentAnalysisSummary) {
			const { totalEntities, archivedCount, newCount } = this.currentAnalysisSummary;
			statsEl.textContent = `共 ${totalEntities} 个实体 | ${archivedCount} 已归档 | ${newCount} 待确认`;
		} else if (statsEl) {
			statsEl.textContent = '暂无分析数据';
		}

		// Update entity lists
		const sections: (keyof AnalysisSummary)[] = ['people', 'projects', 'things', 'ideas', 'knowledge'];
		for (const section of sections) {
			const listEl = this.analysisPanelEl.querySelector(`.lifewiki-${section}-list`);
			if (!listEl) continue;

			listEl.empty();

			if (!this.currentAnalysisSummary || this.currentAnalysisSummary[section].length === 0) {
				listEl.createEl('div', {
					text: '—',
					attr: { style: 'color: var(--text-muted); font-size: 12px;' }
				});
				continue;
			}

			for (const entity of this.currentAnalysisSummary[section]) {
				const itemEl = listEl.createEl('div', {
					attr: {
						style: `padding: 4px 0; border-bottom: 1px solid var(--background-modifier-border); ${entity.newEntity ? 'font-weight: 500;' : ''}`
					}
				});
				itemEl.createEl('span', { text: entity.name });
				itemEl.createEl('span', {
					text: ` (${entity.statusLabel})`,
					attr: { style: `font-size: 11px; color: ${entity.newEntity ? 'var(--text-accent)' : 'var(--text-muted)'};` }
				});
			}
		}
	}

	private updateAnalysisSummary(result: AnalysisResult) {
		this.currentAnalysisSummary = generateAnalysisSummary(result);
		this.renderAnalysisPanel();
	}

	private createBlockEditor(container: HTMLElement) {
		// Blocks container (scrollable)
		const blocksContainer = container.createEl('div', {
			cls: 'lifewiki-blocks',
			attr: {
				style: 'flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 12px;',
			}
		});

		// Input area (fixed at bottom)
		const inputArea = container.createEl('div', {
			cls: 'lifewiki-input-area',
			attr: {
				style: 'border-top: 1px solid var(--background-modifier-border); padding-top: 16px; margin-top: 16px;',
			}
		});

		// Input textarea (no placeholder text)
		const textarea = inputArea.createEl('textarea', {
			attr: {
				maxlength: '250',
				rows: '3',
				style: 'width: 100%; resize: none; border: 1px solid var(--background-modifier-border); border-radius: 8px; padding: 12px; font-size: 14px;'
			}
		});

		// Update on input
		textarea.addEventListener('input', () => {
			this.inputValue = textarea.value;
		});

		// Send on Cmd/Ctrl + Enter
		textarea.addEventListener('keydown', (e) => {
			if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
				e.preventDefault();
				this.submitBlock(textarea);
			}
		});

		// Store reference
		(this as any).textarea = textarea;
		(this as any).blocksContainer = blocksContainer;
	}

	private async loadBlocks() {
		const file = this.app.vault.getAbstractFileByPath(`Daily/${this.currentDate}.md`);

		if (!file || !(file instanceof TFile)) {
			await this.createDailyFile();
			return;
		}

		const content = await this.app.vault.read(file);
		this.parseBlocksFromContent(content);
		this.renderBlocks();
	}

	private async createDailyFile() {
		const template = `# ${this.currentDate}\n\n`;
		await this.app.vault.create(`Daily/${this.currentDate}.md`, template);
	}

	private parseBlocksFromContent(content: string) {
		const lines = content.split('\n');
		let currentBlock: Partial<Block> | null = null;
		let currentContent: string[] = [];

		for (const line of lines) {
			const headerMatch = line.match(/^### (\d{2}:\d{2}) \[([^\]]+)\] (#\S+)?/);

			if (headerMatch) {
				if (currentBlock && currentContent.length > 0) {
					this.blocks.push({
						id: uuid(),
						timestamp: currentBlock.timestamp!,
						content: currentContent.join('\n').trim(),
						parentId: null,
						children: [],
						category: currentBlock.category || '工作',
						source: currentBlock.source || 'Lifewiki'
					});
				}

				currentBlock = {
					timestamp: headerMatch[1],
					source: headerMatch[2],
					category: headerMatch[3]?.replace('#', '') === '个人' ? '个人' : '工作'
				};
				currentContent = [];
			} else if (line.startsWith('- ') && currentBlock) {
				currentContent.push(line.substring(2));
			} else if (currentBlock && line.trim()) {
				currentContent.push(line);
			}
		}

		if (currentBlock && currentContent.length > 0) {
			this.blocks.push({
				id: uuid(),
				timestamp: currentBlock.timestamp!,
				content: currentContent.join('\n').trim(),
				parentId: null,
				children: [],
				category: currentBlock.category || '工作',
				source: currentBlock.source || 'Lifewiki'
			});
		}
	}

	private renderBlocks() {
		const container = (this as any).blocksContainer;
		if (!container) return;

		container.empty();

		for (const block of this.blocks) {
			this.renderBlock(container, block);
		}
	}

	private renderBlock(container: HTMLElement, block: Block) {
		const isSelected = block.id === this.selectedBlockId;

		const blockEl = container.createEl('div', {
			cls: `lifewiki-block ${isSelected ? 'selected' : ''}`,
			attr: {
				'data-block-id': block.id,
				style: `
					background: var(--background-secondary);
					border: 1px solid ${isSelected ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'};
					border-radius: 8px;
					padding: 12px;
					cursor: pointer;
					${block.parentId ? 'margin-left: 24px; border-left: 2px solid var(--interactive-accent);' : ''}
				`
			}
		});

		blockEl.createEl('div', {
			text: block.content,
			attr: { style: 'font-size: 14px; line-height: 1.5;' }
		});

		blockEl.addEventListener('click', () => {
			this.selectBlock(block.id);
		});

		if (block.children.length > 0) {
			const childrenContainer = container.createEl('div', {
				cls: 'lifewiki-block-children',
				attr: { style: 'margin-top: 8px;' }
			});

			for (const childId of block.children) {
				const child = this.blocks.find(b => b.id === childId);
				if (child) {
					this.renderBlock(childrenContainer, child);
				}
			}
		}
	}

	private selectBlock(blockId: string) {
		this.selectedBlockId = blockId;
		this.renderBlocks();
	}

	private async submitBlock(textarea: HTMLTextAreaElement) {
		const content = textarea.value.trim();
		if (!content || this.isLoading) return;

		this.isLoading = true;

		const now = new Date();
		const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

		const newBlock: Block = {
			id: uuid(),
			timestamp,
			content,
			parentId: this.selectedBlockId,
			children: [],
			category: '待确认',
			source: 'Lifewiki'
		};

		if (this.selectedBlockId) {
			const parent = this.blocks.find(b => b.id === this.selectedBlockId);
			if (parent) {
				parent.children.push(newBlock.id);
			}
		}
		this.blocks.push(newBlock);

		textarea.value = '';
		this.inputValue = '';

		this.renderBlocks();
		await this.appendBlockToFile(newBlock);
		await this.analyzeBlock(newBlock);

		this.isLoading = false;
	}

	private async appendBlockToFile(block: Block) {
		const filePath = `Daily/${this.currentDate}.md`;
		const file = this.app.vault.getAbstractFileByPath(filePath);

		if (!(file instanceof TFile)) return;

		const existing = await this.app.vault.read(file);
		const prefix = block.parentId ? '- ' : '\n### ';
		const header = block.parentId ? '' : `${block.timestamp} [${block.source}] #${block.category}`;

		const newContent = `\n${header}${prefix}${block.content}`;

		await this.app.vault.modify(file, existing + newContent);
	}

	private async analyzeBlock(block: Block) {
		try {
			const result = await this.plugin.getSkillExecutor().analyzeBlock(block);

			// Find and update the block in our local state
			const localBlock = this.blocks.find(b => b.id === block.id);
			if (localBlock) {
				localBlock.aiAnalysis = result;
				// Update category if AI determined one (not '待确认')
				if (result.category && result.category !== '待确认') {
					localBlock.category = result.category as Block['category'];
				}
				// Update source if AI determined one
				if (result.source) {
					localBlock.source = result.source as Block['source'];
				}
			}

			// Update analysis panel
			this.updateAnalysisSummary(result);

			this.renderBlocks();

			// Show confirmation dialog if needed
			if (result.needsConfirmation && result.needsConfirmation.length > 0) {
				this.showConfirmationDialog(result);
			}
		} catch (error) {
			console.error('LifeWiki: AI analysis failed:', error);
		}
	}

	private showConfirmationDialog(result: AnalysisResult) {
		const items = generateConfirmationItems(result);
		if (items.length === 0) return;

		this.confirmationItems = items;

		// Create modal overlay
		const overlay = document.createElement('div');
		overlay.className = 'lifewiki-modal-overlay';
		overlay.setAttribute('style', `
			position: fixed;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			background: rgba(0, 0, 0, 0.5);
			display: flex;
			align-items: center;
			justify-content: center;
			z-index: 1000;
		`);

		// Modal content
		const modal = document.createElement('div');
		modal.className = 'lifewiki-modal';
		modal.setAttribute('style', `
			background: var(--modal-background);
			border-radius: 12px;
			padding: 24px;
			max-width: 400px;
			width: 90%;
			max-height: 80vh;
			overflow-y: auto;
			box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
		`);

		// Header
		const header = modal.createEl('div', {
			text: '🤔 AI 识别到新实体',
			attr: { style: 'font-size: 16px; font-weight: 600; margin-bottom: 16px;' }
		});

		// Entity list
		const list = modal.createEl('div', {
			attr: { style: 'margin-bottom: 20px;' }
		});

		for (const item of items) {
			const itemEl = list.createEl('div', {
				attr: { style: 'padding: 12px; background: var(--background-secondary); border-radius: 8px; margin-bottom: 8px;' }
			});

			const emoji = item.entityType === 'category' ? '📝' : getEntityTypeEmoji(item.entityType as any);
			itemEl.createEl('div', {
				text: `${emoji} ${item.name}`,
				attr: { style: 'font-weight: 500; margin-bottom: 4px;' }
			});
			itemEl.createEl('div', {
				text: item.context,
				attr: { style: 'font-size: 12px; color: var(--text-muted);' }
			});
			if (item.entityType !== 'category') {
				itemEl.createEl('div', {
					text: `置信度: ${Math.round(item.confidence * 100)}%`,
					attr: { style: 'font-size: 11px; color: var(--text-muted); margin-top: 4px;' }
				});
			}
		}

		// Buttons
		const buttons = modal.createEl('div', {
			attr: { style: 'display: flex; gap: 12px; justify-content: flex-end;' }
		});

		const cancelBtn = buttons.createEl('button', {
			text: '忽略',
			attr: {
				type: 'button',
				style: 'padding: 8px 16px; border-radius: 6px; border: 1px solid var(--background-modifier-border); background: transparent; cursor: pointer;'
			}
		});

		const confirmBtn = buttons.createEl('button', {
			text: '归档',
			attr: {
				type: 'button',
				style: 'padding: 8px 16px; border-radius: 6px; border: none; background: var(--interactive-accent); color: white; cursor: pointer;'
			}
		});

		// Event handlers
		const closeModal = () => {
			document.body.removeChild(overlay);
			this.confirmationItems = [];
		};

		cancelBtn.addEventListener('click', () => {
			closeModal();
		});

		confirmBtn.addEventListener('click', async () => {
			await this.handleEntityConfirmation(items);
			closeModal();
		});

		overlay.addEventListener('click', (e) => {
			if (e.target === overlay) closeModal();
		});

		document.body.appendChild(overlay);
	}

	private async handleEntityConfirmation(items: ConfirmationItem[]) {
		const entityManager = this.plugin.getEntityManager();
		if (!entityManager) return;

		for (const item of items) {
			if (item.entityType === 'category') continue; // Skip category for now

			try {
				const entityInput = createEntityFromConfirmation(item);
				await entityManager.createEntity(entityInput);
			} catch (error) {
				console.error(`LifeWiki: Failed to create entity ${item.name}:`, error);
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