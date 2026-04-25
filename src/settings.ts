import { App, Notice, Setting, SettingTab } from 'obsidian';
import { OpenAIProvider } from './ai/openai-provider';
import type { AIProvider } from './ai/provider';
import type LifeWikiPlugin from './main';

export interface ProviderConfig {
	id: string;
	name: string;
	baseUrl: string;
	apiKey: string;
	model: string;
	enableThinking?: boolean;
	reasoningEffort?: '' | 'high' | 'max';
}

export interface LifeWikiSettings {
	providers: ProviderConfig[];
	agentProviderMapping: {
		diary: string;
		chat: string;
	};
}

export const DEFAULT_SETTINGS: LifeWikiSettings = {
	providers: [],
	agentProviderMapping: {
		diary: '',
		chat: ''
	},
};

export function createProviderFromConfig(config: ProviderConfig): AIProvider {
	return new OpenAIProvider({
		apiKey: config.apiKey,
		baseUrl: config.baseUrl,
		model: config.model,
		enableThinking: config.enableThinking ?? false,
		reasoningEffort: config.reasoningEffort || '',
	});
}

export class LifeWikiSettingTab extends SettingTab {
	plugin: LifeWikiPlugin;
	id: string = 'lifewiki';
	name: string = 'LifeWiki';
	icon: string = 'bookmark';

	constructor(app: App, plugin: LifeWikiPlugin) {
		super(app as any, plugin as any);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'LifeWiki 设置' });

		// ============================================================
		// Section 1: AI Provider 配置
		// ============================================================
		containerEl.createEl('h2', { text: 'AI Provider 配置' });

		// Provider form fields
		let providerName = '';
		let providerModel = '';
		let providerBaseUrl = '';
		let providerApiKey = '';
		let providerEnableThinking = false;
		let providerReasoningEffort: '' | 'high' | 'max' = '';

		const formContainer = containerEl.createEl('div', {
			cls: 'lifewiki-provider-form'
		});

		// Name
		new Setting(formContainer)
			.setName('名称')
			.setDesc('Provider 显示名称')
			.addText(text => {
				text.setPlaceholder('My GPT-4')
					.onChange(value => { providerName = value; });
			});

		// Model
		new Setting(formContainer)
			.setName('模型')
			.setDesc('模型名称，如 gpt-4、qwen-plus')
			.addText(text => {
				text.setPlaceholder('gpt-4')
					.onChange(value => { providerModel = value; });
			});

		// Base URL
		new Setting(formContainer)
			.setName('Base URL')
			.setDesc('OpenAI 兼容 API 地址，如 https://api.openai.com/v1、https://api.deepseek.com/v1')
			.addText(text => {
				text.setPlaceholder('https://api.openai.com/v1')
					.onChange(value => { providerBaseUrl = value; });
			});

		// API Key
		new Setting(formContainer)
			.setName('API Key')
			.setDesc('API 密钥')
			.addText(text => {
				text.setPlaceholder('')
					.onChange(value => { providerApiKey = value; });
				text.inputEl.type = 'password';
			});

		new Setting(formContainer)
			.setName('思考模式')
			.setDesc('默认关闭。开启后请求体会带上 {"thinking":{"type":"enabled"}}。')
			.addToggle(toggle => {
				toggle.setValue(providerEnableThinking)
					.onChange(value => { providerEnableThinking = value; });
			});

		new Setting(formContainer)
			.setName('Reasoning Effort')
			.setDesc('默认不发送。部分 OpenAI 兼容模型支持 high 或 max。')
			.addDropdown(dropdown => {
				dropdown
					.addOption('', '默认')
					.addOption('high', 'high')
					.addOption('max', 'max')
					.setValue(providerReasoningEffort)
					.onChange(value => {
						providerReasoningEffort = value as '' | 'high' | 'max';
					});
			});

		// Save button
		new Setting(formContainer)
			.addButton(btn => {
				btn.setButtonText('保存 Provider');
				btn.setCta();
				btn.onClick(async () => {
					if (!providerName || !providerModel || !providerBaseUrl) {
						new Notice('请填写名称、模型和 Base URL');
						return;
					}
					const id = `provider-${Date.now()}`;
					this.plugin.settings.providers.push({
						id,
						name: providerName,
						model: providerModel,
						baseUrl: providerBaseUrl,
						apiKey: providerApiKey,
						enableThinking: providerEnableThinking,
						reasoningEffort: providerReasoningEffort,
					});
					await this.plugin.saveSettings();
					this.display();
					new Notice('Provider 已保存');
				});
			});

		// Provider list
		for (let i = 0; i < this.plugin.settings.providers.length; i++) {
			const provider = this.plugin.settings.providers[i];
			const providerSetting = new Setting(containerEl)
				.setName(provider.name)
				.setDesc(`${provider.baseUrl} / ${provider.model}${provider.enableThinking ? ' / thinking:on' : ''}${provider.reasoningEffort ? ` / reasoning:${provider.reasoningEffort}` : ''}`);

			providerSetting.addToggle(toggle => {
				toggle
					.setTooltip('思考模式')
					.setValue(provider.enableThinking ?? false)
					.onChange(async (value) => {
						provider.enableThinking = value;
						await this.plugin.saveSettings();
					});
			});

			providerSetting.addDropdown(dropdown => {
				dropdown
					.addOption('', '默认')
					.addOption('high', 'high')
					.addOption('max', 'max')
					.setValue(provider.reasoningEffort || '')
					.onChange(async (value) => {
						provider.reasoningEffort = value as '' | 'high' | 'max';
						await this.plugin.saveSettings();
					});
			});

			// Test button
			providerSetting.addButton(btn => {
				btn.setButtonText('测试');
				btn.onClick(async () => {
					new Notice('正在测试...');
					try {
						const aiProvider = createProviderFromConfig(provider);
						const response = await aiProvider.chat([
							{ role: 'user', content: '你好' }
						]);
						new Notice('连接成功: ' + response.content.substring(0, 50));
					} catch (e) {
						new Notice('连接失败: ' + (e as Error).message);
					}
				});
			});

			// Delete button
			providerSetting.addButton(btn => {
				btn.setButtonText('删除');
				btn.onClick(async () => {
					this.plugin.settings.providers.splice(i, 1);
					// Clear mapping if this provider was used
					if (this.plugin.settings.agentProviderMapping.diary === provider.id) {
						this.plugin.settings.agentProviderMapping.diary = '';
					}
					if (this.plugin.settings.agentProviderMapping.chat === provider.id) {
						this.plugin.settings.agentProviderMapping.chat = '';
					}
					await this.plugin.saveSettings();
					this.display();
				});
			});
		}

		if (this.plugin.settings.providers.length === 0) {
			containerEl.createEl('p', {
				text: '暂无 Provider，请添加一个',
				cls: 'lifewiki-no-providers'
			});
		}

		// ============================================================
		// Section 2: Agent 配置
		// ============================================================
		containerEl.createEl('h2', { text: 'Agent 配置' });

		const providerOptions: Record<string, string> = {};
		for (const p of this.plugin.settings.providers) {
			providerOptions[p.id] = p.name;
		}

		// Diary Agent
		new Setting(containerEl)
			.setName('Diary Agent')
			.setDesc('日记分析 Agent 使用的 AI Provider')
			.addDropdown(dropdown => {
				dropdown.addOption('', '未配置');
				for (const [id, name] of Object.entries(providerOptions)) {
					dropdown.addOption(id, name);
				}
				dropdown.setValue(this.plugin.settings.agentProviderMapping.diary)
					.onChange(async (value) => {
						this.plugin.settings.agentProviderMapping.diary = value;
						await this.plugin.saveSettings();
					});
			});

		// Chat Agent
		new Setting(containerEl)
			.setName('Chat Agent')
			.setDesc('聊天 Agent 使用的 AI Provider')
			.addDropdown(dropdown => {
				dropdown.addOption('', '未配置');
				for (const [id, name] of Object.entries(providerOptions)) {
					dropdown.addOption(id, name);
				}
				dropdown.setValue(this.plugin.settings.agentProviderMapping.chat)
					.onChange(async (value) => {
						this.plugin.settings.agentProviderMapping.chat = value;
						await this.plugin.saveSettings();
					});
			});

	}
}
