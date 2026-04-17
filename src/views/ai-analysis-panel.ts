/**
 * AI Analysis Panel View
 * Modern, native, minimalist chat UI
 */

import { ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import type LifeWikiPlugin from '../main';
import { AnalysisResult, BlockSession, ChatMessage, AnalysisPhase } from '../entities/types';
import '../styles/ai-panel.css';

export const VIEW_TYPE_AI_ANALYSIS = 'lifewiki-ai-analysis';

export class AIAnalysisPanelView extends ItemView {
	private plugin: LifeWikiPlugin;
	private activeBlockId: string | null = null;
	private chatMessagesEl: HTMLElement | null = null;
	private inputTextarea: HTMLTextAreaElement | null = null;
	private sendBtnEl: HTMLElement | null = null;
	private isLoading: boolean = false;
	private emptyStateEl: HTMLElement | null = null;
	private phaseIndicatorEl: HTMLElement | null = null;
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
		return 'AI洞察';
	}

	async onOpen() {
		const container = this.containerEl;
		container.empty();

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
		headerTitle.createEl('span', { text: 'AI 洞察' });

		// Phase indicator
		this.phaseIndicatorEl = header.createEl('div', {
			cls: 'lifewiki-phase-indicator'
		});

		// Header actions
		const headerActions = header.createEl('div', {
			cls: 'lifewiki-ai-header-actions'
		});

		// Clear button with eraser icon
		const clearBtn = headerActions.createEl('button', {
			cls: 'lifewiki-ai-clear-btn',
			attr: { title: '清空对话' }
		});
		setIcon(clearBtn, 'eraser');
		clearBtn.addEventListener('click', () => {
			this.clearConversation();
		});

		// Scrollable chat area
		const scrollContent = mainContainer.createEl('div', {
			cls: 'lifewiki-ai-scroll'
		});

		// Empty state
		this.emptyStateEl = scrollContent.createEl('div', {
			cls: 'lifewiki-empty-state'
		});

		// Empty state icon (using SVG)
		const emptyIcon = this.emptyStateEl.createEl('svg', {
			cls: 'lifewiki-empty-state-icon',
			attr: {
				'viewBox': '0 0 24 24',
				'fill': 'none',
				'stroke': 'currentColor',
				'stroke-width': '1.5',
				'stroke-linecap': 'round',
				'stroke-linejoin': 'round'
			}
		});
		emptyIcon.createEl('path', { attr: { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' } });

		this.emptyStateEl.createEl('div', {
			cls: 'lifewiki-empty-state-title',
			text: '选择或输入一条日记'
		});

		this.emptyStateEl.createEl('div', {
			cls: 'lifewiki-empty-state-desc',
			text: 'AI 将帮你分析和归档实体'
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

		// Model selector row
		const modelSelector = inputWrapper.createEl('div', {
			cls: 'lifewiki-model-selector'
		});

		const modelSelect = modelSelector.createEl('select', {
			cls: 'lifewiki-model-select'
		});

		const models = ['MiniMax', 'OpenAI', 'Claude', 'Ollama'];
		for (const model of models) {
			modelSelect.createEl('option', { text: model, value: model.toLowerCase() });
		}

		// Input row with textarea and send button
		const inputRow = inputWrapper.createEl('div', {
			cls: 'lifewiki-input-row'
		});

		// Textarea
		this.inputTextarea = inputRow.createEl('textarea', {
			cls: 'lifewiki-input-textarea',
			attr: {
				placeholder: '输入消息...',
				rows: '1'
			}
		}) as HTMLTextAreaElement;

		// Auto-resize textarea
		this.inputTextarea.addEventListener('input', () => {
			this.autoResizeTextarea();
			this.updateSendBtnState();
		});

		// Send button with icon
		this.sendBtnEl = inputRow.createEl('button', {
			cls: 'lifewiki-send-btn',
			attr: { title: '发送' }
		});
		setIcon(this.sendBtnEl, 'arrow-up');

		// Keyboard events
		this.inputTextarea.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.sendMessage();
			}
		});

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

	private showEmptyState() {
		this.emptyStateEl?.addClass('visible');
		this.chatMessagesEl?.removeClass('visible');
	}

	private showChatState() {
		this.emptyStateEl?.removeClass('visible');
		this.chatMessagesEl?.addClass('visible');
	}

	private clearConversation() {
		this.chatMessagesEl?.empty();
		this.activeBlockId = null;
		this.showEmptyState();
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

	setActiveBlock(blockId: string, blockContent: string) {
		this.activeBlockId = blockId;
		const sessionManager = this.plugin.getSessionManager();
		const session = sessionManager.getOrCreateSession(blockId);
		this.showChatState();
		this.renderSession(session);
	}

	startNewSession(blockId: string, blockContent: string, initialResponse: string) {
		this.activeBlockId = blockId;
		this.showChatState();

		if (this.chatMessagesEl) {
			this.chatMessagesEl.empty();
		}

		const sessionManager = this.plugin.getSessionManager();
		const session = sessionManager.getOrCreateSession(blockId);

		const aiContent = initialResponse || '';
		sessionManager.addMessage(blockId, {
			role: 'assistant',
			content: aiContent
		});

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
		sessionManager.setAnalysisResult(this.activeBlockId, result);
		if (result.aiResponse) {
			this.addChatMessage('assistant', result.aiResponse);
		}
	}

	private addChatMessage(role: 'user' | 'assistant', content: string) {
		if (!this.chatMessagesEl) return;
		this.showChatState();

		const msgEl = this.chatMessagesEl.createEl('div', {
			cls: `lifewiki-chat-msg lifewiki-chat-msg-${role}`
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
		if (!this.inputTextarea || this.isLoading || !this.activeBlockId) return;

		const content = this.inputTextarea.value.trim();
		if (!content) return;

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
		});

		try {
			let result: any;
			if (this.plugin.settings.useLangGraph && this.plugin.getLangGraphAgent()) {
				const agent = this.plugin.getLangGraphAgent()!;
				result = await agent.continueAnalysis(this.activeBlockId, content);
			} else {
				const flow = this.plugin.getConversationFlow();
				result = await flow.continueAnalysis(this.activeBlockId, content);
			}

			this.hideThinkingIndicator();

			if (result.entityDiscovery && result.entityDiscovery.length > 0) {
				this.pendingEntities = result.entityDiscovery;
				await this.showEntityConfirmationDialog(result.entityDiscovery);
			}

			if (result.session?.currentPhase) {
				this.updatePhaseIndicator(result.session.currentPhase);
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
				});
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

	private updatePhaseIndicator(phase: AnalysisPhase) {
		if (!this.phaseIndicatorEl) return;
		const phaseLabels: Record<string, string> = {
			people: '👤 人脉',
			projects: '📋 项目',
			things: '📦 物品',
			ideas: '💡 想法',
			knowledge: '📚 知识',
			complete: '✅ 完成'
		};
		this.phaseIndicatorEl.setText(phaseLabels[phase] || phase);
		this.phaseIndicatorEl.addClass('visible');
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
