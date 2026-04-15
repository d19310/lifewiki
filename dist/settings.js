import { Notice, Setting, SettingTab } from 'obsidian';
import { DashScopeProvider } from './ai/dashscope';
import { OllamaProvider } from './ai/ollama';
import { OpenAIProvider } from './ai/openai-provider';
import { ClaudeProvider } from './ai/claude-provider';
export const DEFAULT_SETTINGS = {
    provider: 'dashscope',
    apiKey: '',
    baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
    model: 'qwen3.5-plus',
    systemPrompt: `你是一个日记分析助手。用户每天记录流水账式日记，你需要：
1. 分析每条日记，识别人脉、项目、物品、想法、知识
2. 判断是工作还是个人内容，标注 #工作 或 #个人
3. 使用工具创建/更新实体
4. 用友好方式与用户互动，补充实体信息`,
    skillsEnabled: true,
    autoConfirm: false
};
export class LifeWikiSettingTab extends SettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.id = 'lifewiki-settings';
        this.name = 'LifeWiki';
        this.plugin = plugin;
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'LifeWiki 设置' });
        // Provider
        new Setting(containerEl)
            .setName('AI 提供商')
            .setDesc('选择 AI 服务提供商')
            .addDropdown(dropdown => {
            dropdown.addOption('dashscope', 'DashScope (阿里百炼)');
            dropdown.addOption('openai', 'OpenAI');
            dropdown.addOption('claude', 'Claude');
            dropdown.addOption('ollama', 'Ollama (本地)');
            dropdown.setValue(this.plugin.settings.provider)
                .onChange(async (value) => {
                this.plugin.settings.provider = value;
                switch (value) {
                    case 'dashscope':
                        this.plugin.settings.baseUrl = 'https://coding.dashscope.aliyuncs.com/v1';
                        break;
                    case 'openai':
                        this.plugin.settings.baseUrl = 'https://api.openai.com/v1';
                        break;
                    case 'claude':
                        this.plugin.settings.baseUrl = 'https://api.anthropic.com';
                        break;
                    case 'ollama':
                        this.plugin.settings.baseUrl = 'http://localhost:11434';
                        break;
                }
                await this.plugin.saveSettings();
            });
        });
        // API Key
        new Setting(containerEl)
            .setName('API Key')
            .setDesc('API Key (Ollama 不需要)')
            .addText(text => {
            text.setValue(this.plugin.settings.apiKey)
                .setPlaceholder('输入 API Key')
                .onChange(async (value) => {
                this.plugin.settings.apiKey = value;
                await this.plugin.saveSettings();
            });
            text.inputEl.type = 'password';
        });
        // Model
        new Setting(containerEl)
            .setName('模型')
            .addText(text => {
            text.setValue(this.plugin.settings.model)
                .setPlaceholder('如 qwen3.5-plus, gpt-4')
                .onChange(async (value) => {
                this.plugin.settings.model = value;
                await this.plugin.saveSettings();
            });
        });
        // Base URL
        new Setting(containerEl)
            .setName('Base URL')
            .addText(text => {
            text.setValue(this.plugin.settings.baseUrl)
                .setPlaceholder('https://...')
                .onChange(async (value) => {
                this.plugin.settings.baseUrl = value;
                await this.plugin.saveSettings();
            });
        });
        // Test Connection
        new Setting(containerEl)
            .setName('测试连接')
            .setDesc('测试 AI 连接是否正常')
            .addButton(button => {
            button.setButtonText('测试');
            button.onClick(async () => {
                new Notice('正在测试...');
                await this.plugin.loadSettings();
                try {
                    let provider;
                    const settings = this.plugin.settings;
                    switch (settings.provider) {
                        case 'dashscope':
                            provider = new DashScopeProvider({
                                apiKey: settings.apiKey,
                                baseUrl: settings.baseUrl,
                                model: settings.model
                            });
                            break;
                        case 'ollama':
                            provider = new OllamaProvider({
                                baseUrl: settings.baseUrl,
                                model: settings.model
                            });
                            break;
                        case 'openai':
                            provider = new OpenAIProvider({
                                apiKey: settings.apiKey,
                                baseUrl: settings.baseUrl,
                                model: settings.model
                            });
                            break;
                        case 'claude':
                            provider = new ClaudeProvider({
                                apiKey: settings.apiKey,
                                baseUrl: settings.baseUrl,
                                model: settings.model
                            });
                            break;
                        default:
                            new Notice('未知提供商');
                            return;
                    }
                    const response = await provider.chat([
                        { role: 'user', content: '你好' }
                    ]);
                    new Notice('连接成功: ' + response.content.substring(0, 50));
                }
                catch (e) {
                    new Notice('连接失败: ' + e.message);
                }
            });
        });
        containerEl.createEl('h3', { text: '功能设置' });
        // Skills enabled
        new Setting(containerEl)
            .setName('启用 Skills')
            .setDesc('启用 AI 调用 Vault 操作技能')
            .addToggle(toggle => {
            toggle.setValue(this.plugin.settings.skillsEnabled)
                .onChange(async (value) => {
                this.plugin.settings.skillsEnabled = value;
                await this.plugin.saveSettings();
            });
        });
        // Auto confirm
        new Setting(containerEl)
            .setName('自动确认')
            .setDesc('自动确认 AI 识别的新实体')
            .addToggle(toggle => {
            toggle.setValue(this.plugin.settings.autoConfirm)
                .onChange(async (value) => {
                this.plugin.settings.autoConfirm = value;
                await this.plugin.saveSettings();
            });
        });
    }
}
export function createAIProvider(settings) {
    switch (settings.provider) {
        case 'dashscope':
            return new DashScopeProvider({
                apiKey: settings.apiKey,
                baseUrl: settings.baseUrl,
                model: settings.model
            });
        case 'ollama':
            return new OllamaProvider({
                baseUrl: settings.baseUrl,
                model: settings.model
            });
        case 'openai':
            return new OpenAIProvider({
                apiKey: settings.apiKey,
                baseUrl: settings.baseUrl,
                model: settings.model
            });
        case 'claude':
            return new ClaudeProvider({
                apiKey: settings.apiKey,
                baseUrl: settings.baseUrl,
                model: settings.model
            });
        default:
            throw new Error(`Unknown provider: ${settings.provider}`);
    }
}
