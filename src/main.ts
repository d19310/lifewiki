import { App, Notice, Plugin, PluginManifest } from 'obsidian';
import { LifeWikiSettingTab, LifeWikiSettings, DEFAULT_SETTINGS, createAIProvider } from './settings';
import { BlockEditorView, VIEW_TYPE_BLOCK_EDITOR } from './views/block-editor';
import { AIAnalysisPanelView, VIEW_TYPE_AI_ANALYSIS } from './views/ai-analysis-panel';
import { CalendarView, VIEW_TYPE_CALENDAR } from './views/calendar-view';
import { EntityManager } from './entities/manager';
import { AIAnalyzer } from './ai/analyzer';
import { createSkillExecutor, SkillExecutor } from './skills';
import { SessionManager } from './ai/session-manager';
import { ConversationFlow } from './ai/conversation-flow';
import { createLangGraphAgent, LangGraphAgent } from './ai/langgraph/agent';
import type { AIProvider } from './ai/provider';
import type { AnalysisResult } from './entities/types';
import { ProviderManager, DefaultAIProvider } from './ai/providers';
import { AgentRegistry, DiaryAgent, ChatAgent } from './ai/agents';

export default class LifeWikiPlugin extends Plugin {
	settings!: LifeWikiSettings;
	settingTab?: LifeWikiSettingTab;
	entityManager!: EntityManager;
	aiAnalyzer!: AIAnalyzer;
	aiProvider!: AIProvider;
	skillExecutor!: SkillExecutor;
	sessionManager!: SessionManager;
	conversationFlow!: ConversationFlow;
	langGraphAgent?: LangGraphAgent;
	aiAnalysisView?: AIAnalysisPanelView;
	agentRegistry?: AgentRegistry;
	calendarView?: CalendarView;

	constructor(app: App, manifest: PluginManifest) {
		super(app, manifest);
	}

	async onload() {
		console.log('LifeWiki: loading...');

		// Check if we've already added a tab for this plugin (across instances)
		const appWithTab = (this.app as any).lifewikiTab;

		if (appWithTab) {
			// Reuse existing tab
			this.settingTab = appWithTab;
		} else {
			// Create and register new tab
			this.settingTab = new LifeWikiSettingTab(this.app, this);
			(this.app as any).lifewikiTab = this.settingTab;
			this.addSettingTab(this.settingTab);
		}

		try {
			await this.loadSettings();
			this.initAIProvider();
			this.entityManager = new EntityManager(this.app);
			this.aiAnalyzer = new AIAnalyzer(this.aiProvider, this.entityManager);
			this.skillExecutor = createSkillExecutor(this.app, this.aiProvider, this.entityManager);
			this.sessionManager = new SessionManager(this.app);
			await this.sessionManager.initialize();

			// Initialize based on feature flag
			// Always initialize conversationFlow for backwards compatibility
			this.conversationFlow = new ConversationFlow(this.aiProvider, this.app);
			this.conversationFlow.setEntityManager(this.entityManager);
			await this.conversationFlow.initialize();

			// Initialize LangGraph agent
			console.log('LifeWiki: Initializing LangGraph agent...');
			this.langGraphAgent = createLangGraphAgent(
				this.aiProvider,
				this.entityManager,
				this.app,
				this.settings.systemPrompt
			);
			await this.langGraphAgent.initialize();
			console.log('LifeWiki: LangGraph agent initialized');

			// Initialize Agent Registry for multi-agent support
			if (this.settings.useNewAgentArchitecture) {
				console.log('LifeWiki: Initializing Agent Registry...');
				const { ProviderManager, DefaultAIProvider } = await import('./ai/providers');
				const { AgentRegistry, DiaryAgent, ChatAgent } = await import('./ai/agents');
				const { CustomProvider } = await import('./ai/providers');

				const providerManager = new ProviderManager();

				// Register default AI provider
				providerManager.registerProvider(new DefaultAIProvider(this.aiProvider));
				providerManager.setDefaultProvider('default');

				// Register custom providers from settings
				for (const customConfig of this.settings.customProviders) {
					const customProvider = new CustomProvider(customConfig);
					providerManager.registerProvider(customProvider);
				}

				// Set up agent-provider mapping from settings
				const mapping = this.settings.agentProviderMapping;
				if (mapping.diary) {
					providerManager.setAgentProvider('diary', mapping.diary);
				}
				if (mapping.chat) {
					providerManager.setAgentProvider('chat', mapping.chat);
				}

				this.agentRegistry = new AgentRegistry(providerManager);

				// Create agents with AgentRegistry reference (not fixed provider)
				const diaryAgent = new DiaryAgent(this.agentRegistry, this.entityManager, this.app);
				const chatAgent = new ChatAgent(this.agentRegistry, this.entityManager, this.app);

				// Initialize agents (they will get their provider from AgentRegistry)
				await diaryAgent.initialize();
				await chatAgent.initialize();

				this.agentRegistry.registerAgent(diaryAgent);
				this.agentRegistry.registerAgent(chatAgent);

				console.log('LifeWiki: Agent Registry initialized');
			}

			this.registerView(VIEW_TYPE_BLOCK_EDITOR, (leaf) => new BlockEditorView(leaf, this));
			this.registerView(VIEW_TYPE_AI_ANALYSIS, (leaf) => {
				this.aiAnalysisView = new AIAnalysisPanelView(leaf, this);
				return this.aiAnalysisView;
			});
			this.registerView(VIEW_TYPE_CALENDAR, (leaf) => {
				this.calendarView = new CalendarView(leaf, this);
				// Set up date click callback to navigate to that date
				this.calendarView.setOnDateClick((date: Date) => {
					this.navigateToDate(date);
				});
				return this.calendarView;
			});

			this.addRibbonIcon('document', '打开日记', () => {
				this.openBlockEditor();
			});

			this.addRibbonIcon('calendar', '打开日历', () => {
				this.openCalendarView();
			});

			this.addCommand({
				id: 'open-block-editor',
				name: '打开日记编辑器',
				callback: () => {
					this.openBlockEditor();
				}
			});

			this.addCommand({
				id: 'open-settings',
				name: '打开设置',
				callback: () => {
					(this.app as any).setting.open();
				}
			});

			this.addCommand({
				id: 'open-calendar',
				name: '打开日历',
				callback: () => {
					this.openCalendarView();
				}
			});

			new Notice('LifeWiki 已加载');
			console.log('LifeWiki: loaded successfully');
		} catch (e) {
			console.error('LifeWiki: Failed to load', e);
			new Notice('LifeWiki 加载失败: ' + (e as Error).message);
		}
	}

	onunload() {
		console.log('LifeWiki: unloading...');
		// Clean up local reference but keep app-level reference for reuse
		if (this.settingTab) {
			if (typeof this.settingTab.hide === 'function') {
				this.settingTab.hide();
			}
			this.settingTab = undefined;
		}
	}

	async loadSettings() {
		const data = await this.loadData();
		this.settings = { ...DEFAULT_SETTINGS, ...data };
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private initAIProvider() {
		if (!this.settings.apiKey && this.settings.provider !== 'ollama') {
			console.log('LifeWiki: No API key, using fallback');
			this.aiProvider = this.createFallbackProvider();
			return;
		}

		try {
			this.aiProvider = createAIProvider(this.settings);
			console.log('LifeWiki: AI provider initialized');
		} catch (e) {
			console.error('LifeWiki: Failed to create AI provider:', e);
			this.aiProvider = this.createFallbackProvider();
		}
	}

	private createFallbackProvider(): AIProvider {
		return {
			async chat() {
				return { content: 'AI未配置', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
			},
			async analyzeBlock() {
				return {
					blockId: '',
					timestamp: new Date().toISOString(),
					category: '待确认',
					entities: { people: [], projects: [], things: [], ideas: [], knowledge: [] },
					needsConfirmation: [],
					aiResponse: 'AI未配置'
				};
			},
			isReady() {
				return false;
			}
		};
	}

	/**
	 * Open the calendar view in the right sidebar
	 */
	async openCalendarView(): Promise<void> {
		const { workspace } = this.app;

		// Open calendar in right sidebar
		const existing = workspace.getLeavesOfType(VIEW_TYPE_CALENDAR);
		if (existing.length > 0) {
			workspace.revealLeaf(existing[0]);
		} else {
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				await rightLeaf.setViewState({
					type: VIEW_TYPE_CALENDAR,
					active: true
				});
				workspace.revealLeaf(rightLeaf);
			}
		}
	}

	/**
	 * Navigate BlockEditor to a specific date
	 */
	async navigateToDate(date: Date): Promise<void> {
		// First ensure BlockEditor is open
		await this.openBlockEditor();

		// Get the BlockEditor view and set the date
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_BLOCK_EDITOR);
		if (leaves.length > 0) {
			const leaf = leaves[0];
			const view = leaf.view as BlockEditorView;
			if (view && typeof view.setCurrentDate === 'function') {
				await view.setCurrentDate(date);
			}
		}
	}

	/**
	 * Get the calendar view instance
	 */
	getCalendarView(): CalendarView | undefined {
		return this.calendarView;
	}

	async openBlockEditor() {
		const { workspace } = this.app;

		// Open main block editor in tab
		const existing = workspace.getLeavesOfType(VIEW_TYPE_BLOCK_EDITOR);
		if (existing.length > 0) {
			workspace.revealLeaf(existing[0]);
		} else {
			const leaf = workspace.getLeaf('tab');
			await leaf.setViewState({
				type: VIEW_TYPE_BLOCK_EDITOR,
				active: true
			});
			workspace.revealLeaf(leaf);
		}

		// Open AI analysis panel in right sidebar - make it active too
		const existingAI = workspace.getLeavesOfType(VIEW_TYPE_AI_ANALYSIS);
		if (existingAI.length > 0) {
			workspace.revealLeaf(existingAI[0]);
		} else {
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				await rightLeaf.setViewState({
					type: VIEW_TYPE_AI_ANALYSIS,
					active: true
				});
				workspace.revealLeaf(rightLeaf);
			}
		}
	}

	updateAIAnalysis(result: AnalysisResult) {
		if (this.aiAnalysisView) {
			this.aiAnalysisView.updateAnalysis(result);
		}
	}

	getEntityManager(): EntityManager {
		return this.entityManager;
	}

	getAIAnalyzer(): AIAnalyzer {
		return this.aiAnalyzer;
	}

	getSkillExecutor(): SkillExecutor {
		return this.skillExecutor;
	}

	getSessionManager(): SessionManager {
		return this.sessionManager;
	}

	getConversationFlow(): ConversationFlow {
		return this.conversationFlow;
	}

	getAIProvider(): AIProvider {
		return this.aiProvider;
	}

	getLangGraphAgent(): LangGraphAgent | undefined {
		return this.langGraphAgent;
	}

	getAIAnalysisView(): AIAnalysisPanelView | undefined {
		return this.aiAnalysisView;
	}

	getAgentRegistry(): AgentRegistry | undefined {
		return this.agentRegistry;
	}
}
