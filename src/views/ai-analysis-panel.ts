/**
 * AI Analysis Panel View
 * Displayed as a right sidebar in Obsidian
 * Shows entity analysis and allows chatting with AI
 */

import { ItemView, WorkspaceLeaf } from 'obsidian';
import type LifeWikiPlugin from '../main';
import { AnalysisResult } from '../entities/types';
import { generateAnalysisSummary, type AnalysisSummary } from './analysis-panel';

export const VIEW_TYPE_AI_ANALYSIS = 'lifewiki-ai-analysis';

export class AIAnalysisPanelView extends ItemView {
	private plugin: LifeWikiPlugin;
	private analysisSummary: AnalysisSummary | null = null;
	private statsEl: HTMLElement | null = null;
	private entityLists: Record<string, HTMLElement> = {};
	private chatMessagesEl: HTMLElement | null = null;
	private inputTextarea: HTMLTextAreaElement | null = null;
	private isLoading: boolean = false;

	constructor(leaf: WorkspaceLeaf, plugin: LifeWikiPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_AI_ANALYSIS;
	}

	getDisplayText(): string {
		return 'AI 分析';
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
		header.createEl('span', { text: 'AI 分析' });

		// Scrollable content area
		const scrollContent = mainContainer.createEl('div', {
			cls: 'lifewiki-ai-scroll',
			attr: { style: 'flex: 1; overflow-y: auto;' }
		});

		// Stats
		this.statsEl = scrollContent.createEl('div', {
			cls: 'lifewiki-stats',
			attr: { style: 'font-size: 12px; color: var(--text-muted); margin-bottom: 16px; padding: 0 16px;' }
		});

		// Chat messages area
		this.chatMessagesEl = scrollContent.createEl('div', {
			cls: 'lifewiki-chat-messages',
			attr: { style: 'padding: 0 16px; margin-bottom: 16px;' }
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
			const sectionEl = scrollContent.createEl('div', {
				cls: `lifewiki-section-${section.key}`,
				attr: { style: 'margin-bottom: 16px; padding: 0 16px;' }
			});

			sectionEl.createEl('div', {
				text: `${section.emoji} ${this.getEntityLabel(section.key)}`,
				attr: { style: 'font-size: 12px; font-weight: 500; color: var(--text-muted); margin-bottom: 8px;' }
			});

			this.entityLists[section.key] = sectionEl.createEl('div', {
				cls: `lifewiki-${section.key}-list`,
				attr: { style: 'font-size: 13px;' }
			});
		}

		// Input area at bottom
		const inputArea = mainContainer.createEl('div', {
			cls: 'lifewiki-ai-input-area',
			attr: { style: 'padding: 16px; border-top: 1px solid var(--background-modifier-border); flex-shrink: 0;' }
		});

		this.inputTextarea = inputArea.createEl('textarea', {
			attr: {
				placeholder: '和 AI 对话...',
				rows: '2',
				style: 'width: 100%; resize: none; border: 1px solid var(--background-modifier-border); border-radius: 8px; padding: 8px 12px; font-size: 13px; background: var(--background-secondary); color: var(--text-primary); margin-bottom: 8px;'
			}
		}) as HTMLTextAreaElement;

		this.inputTextarea.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.sendMessage();
			}
		});

		// Send button
		const sendBtn = inputArea.createEl('button', {
			text: '发送',
			attr: {
				type: 'button',
				style: 'width: 100%; padding: 8px 16px; border-radius: 6px; border: none; background: var(--interactive-accent); color: white; cursor: pointer; font-size: 13px;'
			}
		});
		sendBtn.addEventListener('click', () => {
			this.sendMessage();
		});

		this.renderEmptyState();
	}

	private getEntityLabel(key: string): string {
		const labels: Record<string, string> = {
			people: '人脉',
			projects: '项目',
			things: '物品',
			ideas: '想法',
			knowledge: '知识'
		};
		return labels[key] || key;
	}

	private renderEmptyState() {
		if (this.statsEl) {
			this.statsEl.textContent = '暂无分析数据';
		}

		if (this.chatMessagesEl) {
			this.chatMessagesEl.empty();
		}

		const sections = ['people', 'projects', 'things', 'ideas', 'knowledge'];
		for (const section of sections) {
			const listEl = this.entityLists[section];
			if (listEl) {
				listEl.empty();
				listEl.createEl('div', {
					text: '—',
					attr: { style: 'color: var(--text-muted); font-size: 12px;' }
				});
			}
		}
	}

	updateAnalysis(result: AnalysisResult) {
		this.analysisSummary = generateAnalysisSummary(result);
		this.render();

		// Show AI response in chat
		if (result.aiResponse && this.chatMessagesEl) {
			this.addChatMessage('assistant', result.aiResponse);
		}
	}

	private addChatMessage(role: 'user' | 'assistant', content: string) {
		if (!this.chatMessagesEl) return;

		const msgEl = this.chatMessagesEl.createEl('div', {
			cls: `lifewiki-chat-msg lifewiki-chat-msg-${role}`,
			attr: { style: `margin-bottom: 12px; padding: 8px 12px; border-radius: 8px; font-size: 13px; ${role === 'user' ? 'background: var(--interactive-accent); color: white; margin-left: 20%;' : 'background: var(--background-secondary); margin-right: 20%;'}` }
		});

		msgEl.createEl('div', {
			text: content,
			attr: { style: 'line-height: 1.4;' }
		});
	}

	private async sendMessage() {
		if (!this.inputTextarea || this.isLoading) return;

		const content = this.inputTextarea.value.trim();
		if (!content) return;

		this.isLoading = true;
		this.inputTextarea.value = '';

		// Show user message
		this.addChatMessage('user', content);

		try {
			// Send to AI
			const response = await this.plugin.getSkillExecutor().analyzeBlock({
				id: '',
				timestamp: '',
				content,
				parentId: null,
				children: [],
				category: '待确认',
				source: 'Lifewiki'
			} as any);

			// Show AI response
			if (response.aiResponse) {
				this.addChatMessage('assistant', response.aiResponse);
			}

			// Update analysis panel
			this.updateAnalysis(response);
		} catch (error) {
			console.error('AI chat error:', error);
			this.addChatMessage('assistant', '抱歉，AI 响应失败: ' + (error as Error).message);
		}

		this.isLoading = false;
	}

	private render() {
		if (!this.analysisSummary) {
			this.renderEmptyState();
			return;
		}

		// Update stats
		if (this.statsEl) {
			const { totalEntities, archivedCount, newCount } = this.analysisSummary;
			this.statsEl.textContent = `共 ${totalEntities} 个实体 | ${archivedCount} 已归档 | ${newCount} 待确认`;
		}

		// Update entity lists
		const sections: (keyof AnalysisSummary)[] = ['people', 'projects', 'things', 'ideas', 'knowledge'];
		for (const section of sections) {
			const listEl = this.entityLists[section];
			if (!listEl) continue;

			listEl.empty();

			const entities = this.analysisSummary[section];
			if (entities.length === 0) {
				listEl.createEl('div', {
					text: '—',
					attr: { style: 'color: var(--text-muted); font-size: 12px;' }
				});
				continue;
			}

			for (const entity of entities) {
				const itemEl = listEl.createEl('div', {
					attr: {
						style: `padding: 6px 0; border-bottom: 1px solid var(--background-modifier-border); ${entity.newEntity ? 'font-weight: 500;' : ''}`
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

	async onClose() {
		// Clean up
	}
}
