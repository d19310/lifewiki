import { App, Notice, Setting, SettingTab, Modal } from 'obsidian';
import { DashScopeProvider } from './ai/dashscope';
import { OllamaProvider } from './ai/ollama';
import { OpenAIProvider } from './ai/openai-provider';
import { ClaudeProvider } from './ai/claude-provider';
import { MiniMaxProvider } from './ai/minimax';
import type { AIProvider } from './ai/provider';
import type LifeWikiPlugin from './main';

export interface LifeWikiSettings {
	provider: 'dashscope' | 'openai' | 'claude' | 'ollama' | 'minimax';
	apiKey: string;
	baseUrl: string;
	model: string;
	systemPrompt: string;
	areas: string[];           // Available areas/tags
	skillsEnabled: boolean;
	autoConfirm: boolean;
	useNewAgentArchitecture: boolean;  // V1.1: Use new Agent architecture
	// V1.1: Agent-Provider mapping (agentId -> providerId)
	agentProviderMapping: {
		diary: string;
		chat: string;
	};
	// V1.1: Custom providers configuration
	customProviders: Array<{
		id: string;
		name: string;
		type: 'custom';
		endpoint: string;
		apiKey?: string;
		model: string;
	}>;
}

export const DEFAULT_SETTINGS: LifeWikiSettings = {
	provider: 'dashscope',
	apiKey: '',
	baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
	model: 'qwen3.5-plus',
	systemPrompt: `你是一个日记分析助手。用户每天记录流水账式日记，你需要：
1. 分析每条日记，识别人脉、项目、物品、想法、知识
2. 判断日记属于哪个或哪几个领域（可多选，最多2个）：工作、个人、学习等
3. 使用工具创建/更新实体
4. 用友好方式与用户互动，补充实体信息`,
	areas: ['工作', '个人', '学习', '其他'],
	skillsEnabled: true,
	autoConfirm: false,
	useNewAgentArchitecture: false,  // V1.1: Disabled by default
	agentProviderMapping: {
		diary: 'default',
		chat: 'default'
	},
	customProviders: []
};

export class LifeWikiSettingTab extends SettingTab {
	plugin: LifeWikiPlugin;
	id: string = 'lifewiki-settings';
	name: string = 'LifeWiki';

	constructor(app: App, plugin: LifeWikiPlugin) {
		super(app as any, plugin as any);
		this.plugin = plugin;
	}

	display(): void {
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
				dropdown.addOption('minimax', 'MiniMax');
				dropdown.setValue(this.plugin.settings.provider)
					.onChange(async (value) => {
						this.plugin.settings.provider = value as any;
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
							case 'minimax':
								this.plugin.settings.baseUrl = 'https://api.minimaxi.com/v1';
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
						let provider: AIProvider;
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
							case 'minimax':
								provider = new MiniMaxProvider({
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
					} catch (e) {
						new Notice('连接失败: ' + (e as Error).message);
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

		// V1.1: New Agent Architecture toggle
		new Setting(containerEl)
			.setName('启用新 Agent 架构 (V1.1)')
			.setDesc('启用多 Agent 架构，支持为不同 Agent 配置不同 AI Provider')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.useNewAgentArchitecture)
					.onChange(async (value) => {
						this.plugin.settings.useNewAgentArchitecture = value;
						await this.plugin.saveSettings();
						// Refresh the settings UI to show/hide Agent Provider settings
						this.display();
					});
			});

		// V1.1: Agent-Provider Mapping (only show if new architecture enabled)
		if (this.plugin.settings.useNewAgentArchitecture) {
			containerEl.createEl('h3', { text: 'V1.1: Agent Provider 配置' });

			// Diary Agent Provider
			new Setting(containerEl)
				.setName('Diary Agent Provider')
				.setDesc('日记分析 Agent 使用的 AI Provider')
				.addDropdown(dropdown => {
					// Add default option
					dropdown.addOption('default', '默认 Provider');
					// Add custom providers
					for (const cp of this.plugin.settings.customProviders) {
						dropdown.addOption(cp.id, cp.name);
					}
					dropdown.setValue(this.plugin.settings.agentProviderMapping.diary)
						.onChange(async (value) => {
							this.plugin.settings.agentProviderMapping.diary = value;
							await this.plugin.saveSettings();
						});
				});

			// Chat Agent Provider
			new Setting(containerEl)
				.setName('Chat Agent Provider')
				.setDesc('聊天 Agent 使用的 AI Provider')
				.addDropdown(dropdown => {
					dropdown.addOption('default', '默认 Provider');
					for (const cp of this.plugin.settings.customProviders) {
						dropdown.addOption(cp.id, cp.name);
					}
					dropdown.setValue(this.plugin.settings.agentProviderMapping.chat)
						.onChange(async (value) => {
							this.plugin.settings.agentProviderMapping.chat = value;
							await this.plugin.saveSettings();
						});
				});
		}

		// Custom Providers Management
		containerEl.createEl('h3', { text: 'V1.1: 自定义 Provider' });

		// Add custom provider button
		new Setting(containerEl)
			.setName('添加自定义 Provider')
			.setDesc('添加 OpenAI-compatible 的自定义 AI 服务')
			.addButton(button => {
				button.setButtonText('+ 添加');
				button.onClick(() => {
					this.showAddCustomProviderModal();
				});
			});

		// List existing custom providers
		for (let i = 0; i < this.plugin.settings.customProviders.length; i++) {
			const cp = this.plugin.settings.customProviders[i];
			new Setting(containerEl)
				.setName(cp.name)
				.setDesc(`${cp.endpoint} / ${cp.model}`)
				.addButton(button => {
					button.setButtonText('删除');
					button.onClick(async () => {
						this.plugin.settings.customProviders.splice(i, 1);
						await this.plugin.saveSettings();
						this.display();  // Refresh the settings UI
					});
				});
		}
	}

	private showAddCustomProviderModal() {
		const modal = new CustomProviderModal(this.app, this.plugin);
		modal.open();
	}
}

export function createAIProvider(settings: LifeWikiSettings): AIProvider {
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
		case 'minimax':
			return new MiniMaxProvider({
				apiKey: settings.apiKey,
				baseUrl: settings.baseUrl,
				model: settings.model
			});
		default:
			throw new Error(`Unknown provider: ${settings.provider}`);
	}
}

class CustomProviderModal extends Modal {
	private plugin: LifeWikiPlugin;

	constructor(app: App, plugin: LifeWikiPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: '添加自定义 Provider' });

		let providerId = '';
		let providerName = '';
		let endpoint = '';
		let apiKey = '';
		let model = '';

		// ID
		new Setting(contentEl)
			.setName('Provider ID')
			.setDesc('唯一标识符，如 "my-gpt4"')
			.addText(text => {
				text.setPlaceholder('my-gpt4')
					.onChange(value => { providerId = value; });
			});

		// Name
		new Setting(contentEl)
			.setName('名称')
			.setDesc('显示名称')
			.addText(text => {
				text.setPlaceholder('My GPT-4')
					.onChange(value => { providerName = value; });
			});

		// Endpoint
		new Setting(contentEl)
			.setName('API Endpoint')
			.setDesc('OpenAI-compatible API 地址')
			.addText(text => {
				text.setPlaceholder('https://api.example.com/v1')
					.onChange(value => { endpoint = value; });
			});

		// API Key
		new Setting(contentEl)
			.setName('API Key (可选)')
			.setDesc('如有认证需要')
			.addText(text => {
				text.setPlaceholder('')
					.setValue(apiKey)
					.onChange(value => { apiKey = value; });
				text.inputEl.type = 'password';
			});

		// Model
		new Setting(contentEl)
			.setName('模型')
			.setDesc('使用的模型名')
			.addText(text => {
				text.setPlaceholder('gpt-4')
					.onChange(value => { model = value; });
			});

		// Buttons
		new Setting(contentEl)
			.addButton(btn => {
				btn.setButtonText('取消');
				btn.onClick(() => this.close());
			})
			.addButton(btn => {
				btn.setButtonText('添加');
				btn.setCta();
				btn.onClick(async () => {
					if (!providerId || !providerName || !endpoint || !model) {
						new Notice('请填写所有必填字段');
						return;
					}

					// Check for duplicate ID
					const existing = this.plugin.settings.customProviders.find(p => p.id === providerId);
					if (existing) {
						new Notice('Provider ID 已存在');
						return;
					}

					this.plugin.settings.customProviders.push({
						id: providerId,
						name: providerName,
						type: 'custom',
						endpoint,
						apiKey: apiKey || undefined,
						model
					});

					await this.plugin.saveSettings();
					(this.plugin.settingTab as LifeWikiSettingTab).display();
					this.close();
					new Notice('Provider 已添加');
				});
			});
	}

	onClose() {}
}
