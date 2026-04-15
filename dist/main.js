import { Notice, Plugin } from 'obsidian';
import { LifeWikiSettingTab, DEFAULT_SETTINGS, createAIProvider } from './settings';
import { BlockEditorView, VIEW_TYPE_BLOCK_EDITOR } from './views/block-editor';
import { EntityManager } from './entities/manager';
import { AIAnalyzer } from './ai/analyzer';
import { createSkillExecutor } from './skills';
export default class LifeWikiPlugin extends Plugin {
    constructor(app, manifest) {
        super(app, manifest);
    }
    async onload() {
        console.log('LifeWiki: loading...');
        await this.loadSettings();
        this.initAIProvider();
        this.entityManager = new EntityManager(this.app);
        this.aiAnalyzer = new AIAnalyzer(this.aiProvider, this.entityManager);
        this.skillExecutor = createSkillExecutor(this.app, this.aiProvider, this.entityManager);
        this.settingTab = new LifeWikiSettingTab(this.app, this);
        this.addSettingTab(this.settingTab);
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
                this.app.setting.open();
            }
        });
        new Notice('LifeWiki 已加载');
        console.log('LifeWiki: loaded');
    }
    onunload() {
        console.log('LifeWiki: unloaded');
    }
    async loadSettings() {
        const data = await this.loadData();
        this.settings = { ...DEFAULT_SETTINGS, ...data };
    }
    async saveSettings() {
        await this.saveData(this.settings);
    }
    initAIProvider() {
        if (!this.settings.apiKey && this.settings.provider !== 'ollama') {
            console.log('LifeWiki: No API key, using fallback');
            this.aiProvider = this.createFallbackProvider();
            return;
        }
        try {
            this.aiProvider = createAIProvider(this.settings);
            console.log('LifeWiki: AI provider initialized');
        }
        catch (e) {
            console.error('LifeWiki: Failed to create AI provider:', e);
            this.aiProvider = this.createFallbackProvider();
        }
    }
    createFallbackProvider() {
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
    getEntityManager() {
        return this.entityManager;
    }
    getAIAnalyzer() {
        return this.aiAnalyzer;
    }
    getSkillExecutor() {
        return this.skillExecutor;
    }
    async reloadAIProvider() {
        this.initAIProvider();
        this.aiAnalyzer = new AIAnalyzer(this.aiProvider, this.entityManager);
        this.skillExecutor = createSkillExecutor(this.app, this.aiProvider, this.entityManager);
        new Notice('LifeWiki: AI provider 已重新加载');
    }
}
