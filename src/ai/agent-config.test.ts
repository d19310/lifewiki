/**
 * AgentConfig Tests
 * Tests for loading agent configuration files
 */

import { AgentConfig, loadAgentConfig } from './agent-config';

// Mock app object for testing
const createMockApp = () => ({
	vault: {
		getAbstractFileByPath: jest.fn(),
		read: jest.fn()
	}
});

describe('AgentConfig', () => {
	describe('interface structure', () => {
		it('should have correct interface structure', () => {
			const config: AgentConfig = {
				identity: '# LifeWiki Agent\n\n你是一个日记分析助手',
				soul: '# 分析规范\n\n按顺序分析：人脉 -> 项目 -> 物品 -> 想法 -> 知识',
				skills: '# 技能\n\n- search_entity\n- create_entity',
				wiki: '# 知识库\n\n目录结构: People/, Projects/, Things/',
				chatPrompt: ''
			};

			expect(config.identity).toContain('LifeWiki Agent');
			expect(config.soul).toContain('分析规范');
			expect(config.skills).toContain('search_entity');
			expect(config.wiki).toContain('知识库');
			expect(config.chatPrompt).toBe('');
		});
	});

	describe('loadAgentConfig', () => {
		it('should return default config when files do not exist', async () => {
			const mockApp = createMockApp();
			(mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);

			const config = await loadAgentConfig(mockApp as any);

			expect(config.identity).toContain('日记分析助手');
			expect(config.soul).toContain('分析顺序');
			expect(config.skills).toContain('search_entity');
			expect(config.wiki).toContain('目录结构');
			expect(config.chatPrompt).toContain('LifeWiki AI 助手');
		});

		it('should load identity from IDENTITY.md when exists', async () => {
			const mockApp = createMockApp();

			// IDENTITY.md exists - TFile has a stat property
			(mockApp.vault.getAbstractFileByPath as jest.Mock).mockImplementation((path: string) => {
				if (path === '.lifewiki/agents/diary/IDENTITY.md') {
					return { path, stat: {} };  // TFile-like object with stat
				}
				return null;
			});

			(mockApp.vault.read as jest.Mock).mockImplementation(async (file: any) => {
				if (file.path === '.lifewiki/agents/diary/IDENTITY.md') {
					return '# 自定义身份\n\n我是一个测试Agent';
				}
				throw new Error('File not found');
			});

			const config = await loadAgentConfig(mockApp as any, 'diary');

			expect(config.identity).toBe('# 自定义身份\n\n我是一个测试Agent');
		});

		it('should load all config files when all exist', async () => {
			const mockApp = createMockApp();
			const files = [
				'.lifewiki/agents/diary/IDENTITY.md',
				'.lifewiki/agents/diary/SOUL.md',
				'.lifewiki/agents/diary/SKILL.md',
				'.lifewiki/agents/diary/WIKI.md',
				'.lifewiki/agents/diary/CHAT.md'
			];

			(mockApp.vault.getAbstractFileByPath as jest.Mock).mockImplementation((path: string) => {
				if (files.includes(path)) {
					return { path, stat: {} };  // TFile-like
				}
				return null;
			});

			(mockApp.vault.read as jest.Mock).mockImplementation(async (file: any) => {
				const contentMap: Record<string, string> = {
					'.lifewiki/agents/diary/IDENTITY.md': '# IDENTITY',
					'.lifewiki/agents/diary/SOUL.md': '# SOUL',
					'.lifewiki/agents/diary/SKILL.md': '# SKILLS',
					'.lifewiki/agents/diary/WIKI.md': '# WIKI',
					'.lifewiki/agents/diary/CHAT.md': '# CHAT'
				};
				return contentMap[file.path] || '';
			});

			const config = await loadAgentConfig(mockApp as any, 'diary');

			expect(config.identity).toBe('# IDENTITY');
			expect(config.soul).toBe('# SOUL');
			expect(config.skills).toBe('# SKILLS');
			expect(config.wiki).toBe('# WIKI');
			expect(config.chatPrompt).toBe('# CHAT');
		});

		it('should handle partial file loading', async () => {
			const mockApp = createMockApp();

			// Only IDENTITY.md exists
			(mockApp.vault.getAbstractFileByPath as jest.Mock).mockImplementation((path: string) => {
				if (path === '.lifewiki/agents/diary/IDENTITY.md') {
					return { path, stat: {} };  // TFile-like
				}
				return null;
			});

			(mockApp.vault.read as jest.Mock).mockImplementation(async (file: any) => {
				if (file.path === '.lifewiki/agents/diary/IDENTITY.md') {
					return '# 自定义IDENTITY';
				}
				throw new Error('File not found');
			});

			const config = await loadAgentConfig(mockApp as any, 'diary');

			// IDENTITY should be custom, others should be defaults
			expect(config.identity).toBe('# 自定义IDENTITY');
			expect(config.soul).not.toBe('# 自定义IDENTITY');
		});
	});

	describe('default config values', () => {
		it('should have meaningful default identity', async () => {
			const mockApp = createMockApp();
			(mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);

			const config = await loadAgentConfig(mockApp as any);

			expect(config.identity.length).toBeGreaterThan(0);
			expect(config.identity).toContain('Agent');
		});

		it('should have analysis phases in default soul', async () => {
			const mockApp = createMockApp();
			(mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);

			const config = await loadAgentConfig(mockApp as any);

			expect(config.soul).toContain('人脉');
			expect(config.soul).toContain('项目');
			expect(config.soul).toContain('物品');
		});

		it('should have search_entity in default skills', async () => {
			const mockApp = createMockApp();
			(mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);

			const config = await loadAgentConfig(mockApp as any);

			expect(config.skills).toContain('search_entity');
			expect(config.skills).toContain('create_entity');
		});
	});
});
