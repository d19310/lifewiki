import { App, Notice, Plugin, PluginManifest } from 'obsidian';
import { LifeWikiSettingTab, LifeWikiSettings, DEFAULT_SETTINGS, createProviderFromConfig } from './settings';
import { BlockEditorView, VIEW_TYPE_BLOCK_EDITOR } from './views/block-editor';
import { AIAnalysisPanelView, VIEW_TYPE_AI_ANALYSIS } from './views/ai-analysis-panel';
import { CalendarView, VIEW_TYPE_CALENDAR } from './views/calendar-view';
import { EntityManager } from './entities/manager';
import { createSkillExecutor, SkillExecutor } from './skills';
import { SessionManager } from './ai/session-manager';
import type { LangGraphAgent } from './ai/langgraph/agent';
import type { AIProvider } from './ai/provider';
import type { AnalysisResult } from './entities/types';
import type { BlockMemoryAnalysis } from './memory/types';
import { DefaultAIProvider, ProviderManager, CustomProvider } from './ai/providers';
import { AgentRegistry, ChatAgent, DiaryAgent } from './ai/agents';

export default class LifeWikiPlugin extends Plugin {
	settings!: LifeWikiSettings;
	settingTab?: LifeWikiSettingTab;
	entityManager!: EntityManager;
	aiProvider!: AIProvider;
	skillExecutor!: SkillExecutor;
	sessionManager!: SessionManager;
	langGraphAgent?: LangGraphAgent;
	aiAnalysisView?: AIAnalysisPanelView;
	agentRegistry?: AgentRegistry;
	calendarView?: CalendarView;
	private settingsNavStyleEl?: HTMLStyleElement;

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
			this.skillExecutor = createSkillExecutor(this.app, this.aiProvider, this.entityManager);
			this.sessionManager = new SessionManager(this.app);
			await this.sessionManager.initialize();

			// Register agents lazily. LifeWiki 2.0 capture analysis should not load
			// .lifewiki/agents/* config during plugin startup.
			this.agentRegistry = new AgentRegistry(this.createProviderManager());
			const diaryAgent = new DiaryAgent(this.agentRegistry, this.entityManager, this.app);
			const chatAgent = new ChatAgent(this.agentRegistry, this.entityManager, this.app);
			this.agentRegistry.registerAgent(diaryAgent);
			this.agentRegistry.registerAgent(chatAgent);

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

			this.addRibbonIcon('pencil', '打开 LifeWiki', () => {
				this.openBlockEditor();
			});

			this.addRibbonIcon('clock', '打开日历', () => {
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
				id: 'open-calendar',
				name: '打开日历',
				callback: () => {
					this.openCalendarView();
				}
			});

			this.hideSettingsTabFromSidebar();

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
		this.settingsNavStyleEl?.remove();
		this.settingsNavStyleEl = undefined;
	}

	private hideSettingsTabFromSidebar() {
		this.settingsNavStyleEl?.remove();
		const styleEl = document.createElement('style');
		styleEl.textContent = `
.vertical-tab-nav-item[data-id="lifewiki-settings"],
.vertical-tab-nav-item[data-tab-id="lifewiki-settings"],
.vertical-tab-nav-item[data-id="lifewiki"],
.vertical-tab-nav-item[data-tab-id="lifewiki"],
.vertical-tab-nav-item[data-id="lifewiki2"],
.vertical-tab-nav-item[data-tab-id="lifewiki2"],
.vertical-tab-nav-item[aria-label="LifeWiki"],
.vertical-tab-nav-item[aria-label="LifeWiki 2.0"] {
	display: none !important;
}
`;
		document.head.appendChild(styleEl);
		this.settingsNavStyleEl = styleEl;
	}

	async loadSettings() {
		const data = await this.loadData();
		this.settings = { ...DEFAULT_SETTINGS, ...data } as LifeWikiSettings;

		// Migrate old single-provider format
		const old = data as any;
		if (!this.settings.providers) {
			(this.settings as any).providers = [];
		}
		if (this.settings.providers.length === 0 && old?.apiKey && old?.model) {
			this.settings.providers = [{
				id: 'migrated-default',
				name: old.provider || 'Default',
				baseUrl: old.baseUrl || '',
				apiKey: old.apiKey,
				model: old.model,
			}];
			this.settings.agentProviderMapping = {
				diary: 'migrated-default',
				chat: 'migrated-default'
			};
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
		if (this.entityManager) {
			this.refreshAIStack();
		}
	}

	private refreshAIStack() {
		this.initAIProvider();
		this.skillExecutor = createSkillExecutor(this.app, this.aiProvider, this.entityManager);
		this.agentRegistry = new AgentRegistry(this.createProviderManager());
		this.agentRegistry.registerAgent(new DiaryAgent(this.agentRegistry, this.entityManager, this.app));
		this.agentRegistry.registerAgent(new ChatAgent(this.agentRegistry, this.entityManager, this.app));
	}

	private initAIProvider() {
		// Use the provider mapped to diary agent, or the first configured provider
		const mapping = this.settings.agentProviderMapping;
		const diaryProviderId = mapping?.diary;

		let providerConfig = this.settings.providers.find(p => p.id === diaryProviderId);
		if (!providerConfig && this.settings.providers.length > 0) {
			providerConfig = this.settings.providers[0];
		}

		if (!providerConfig || !providerConfig.apiKey) {
			console.log('LifeWiki: No provider configured, using fallback');
			this.aiProvider = this.createFallbackProvider();
			return;
		}

		try {
			this.aiProvider = createProviderFromConfig(providerConfig);
			console.log('LifeWiki: AI provider initialized');
		} catch (e) {
			console.error('LifeWiki: Failed to create AI provider:', e);
			this.aiProvider = this.createFallbackProvider();
		}
	}

	private createProviderManager(): ProviderManager {
		const providerManager = new ProviderManager();

		for (const config of this.settings.providers) {
			const customProvider = new CustomProvider({
				id: config.id,
				name: config.name,
				type: 'custom',
				endpoint: config.baseUrl,
				apiKey: config.apiKey,
				model: config.model,
				enableThinking: config.enableThinking ?? false,
				reasoningEffort: config.reasoningEffort || '',
			});
			providerManager.registerProvider(customProvider);
		}

		providerManager.registerProvider(new DefaultAIProvider(this.aiProvider));
		providerManager.setDefaultProvider('default');

		const mapping = this.settings.agentProviderMapping;
		if (mapping?.diary) {
			providerManager.setAgentProvider('diary', mapping.diary);
		}
		if (mapping?.chat) {
			providerManager.setAgentProvider('chat', mapping.chat);
		}

		return providerManager;
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
					areas: [],
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

	updateMemoryAnalysis(result: BlockMemoryAnalysis) {
		if (this.aiAnalysisView) {
			this.aiAnalysisView.updateMemoryAnalysis(result);
		}
	}

	getEntityManager(): EntityManager {
		return this.entityManager;
	}

	getSkillExecutor(): SkillExecutor {
		return this.skillExecutor;
	}

	getSessionManager(): SessionManager {
		return this.sessionManager;
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
