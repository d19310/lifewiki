import { App, Notice, Plugin, PluginManifest } from 'obsidian';
import { LifeWikiSettingTab, LifeWikiSettings, DEFAULT_SETTINGS, createAIProvider } from './settings';
import { BlockEditorView, VIEW_TYPE_BLOCK_EDITOR } from './views/block-editor';
import { EntityManager } from './entities/manager';
import { AIAnalyzer } from './ai/analyzer';
import { createSkillExecutor, SkillExecutor } from './skills';
import type { AIProvider } from './ai/provider';

export default class LifeWikiPlugin extends Plugin {
	settings!: LifeWikiSettings;
	settingTab?: LifeWikiSettingTab;
	entityManager!: EntityManager;
	aiAnalyzer!: AIAnalyzer;
	aiProvider!: AIProvider;
	skillExecutor!: SkillExecutor;

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

			this.registerView(VIEW_TYPE_BLOCK_EDITOR, (leaf) => new BlockEditorView(leaf, this));

			this.addRibbonIcon('document', '打开日记', () => {
				this.openBlockEditor();
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

	async openBlockEditor() {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_BLOCK_EDITOR);
		if (existing.length > 0) {
			workspace.revealLeaf(existing[0]);
			return;
		}

		const leaf = workspace.getLeaf('tab');
		await leaf.setViewState({
			type: VIEW_TYPE_BLOCK_EDITOR,
			active: true
		});
		workspace.revealLeaf(leaf);
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
}
