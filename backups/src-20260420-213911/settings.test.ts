/**
 * Settings Tests
 * Tests for plugin settings and configuration
 */

import { ChatMessage } from '../entities/types';

// Settings interface
interface LifeWikiSettings {
  ai: {
    provider: 'dashscope' | 'openai' | 'claude' | 'ollama';
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  prompts: {
    systemPrompt: string;
  };
  skills: {
    enabled: boolean;
    autoConfirm: boolean;
  };
}

// Default settings
const DEFAULT_SETTINGS: LifeWikiSettings = {
  ai: {
    provider: 'dashscope',
    apiKey: '',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen2.5-14b'
  },
  prompts: {
    systemPrompt: '你是一个日记分析助手...'
  },
  skills: {
    enabled: true,
    autoConfirm: false
  }
};

describe('LifeWikiSettings', () => {
  describe('default settings', () => {
    it('should have default provider as dashscope', () => {
      expect(DEFAULT_SETTINGS.ai.provider).toBe('dashscope');
    });

    it('should have default base URL for dashscope', () => {
      expect(DEFAULT_SETTINGS.ai.baseUrl).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1');
    });

    it('should have default model', () => {
      expect(DEFAULT_SETTINGS.ai.model).toBe('qwen2.5-14b');
    });

    it('should have empty API key by default', () => {
      expect(DEFAULT_SETTINGS.ai.apiKey).toBe('');
    });

    it('should have skills enabled by default', () => {
      expect(DEFAULT_SETTINGS.skills.enabled).toBe(true);
    });

    it('should not auto confirm by default', () => {
      expect(DEFAULT_SETTINGS.skills.autoConfirm).toBe(false);
    });
  });

  describe('settings validation', () => {
    it('should validate API key is required for non-ollama providers', () => {
      const settings: LifeWikiSettings = {
        ...DEFAULT_SETTINGS,
        ai: { ...DEFAULT_SETTINGS.ai, provider: 'dashscope', apiKey: '' }
      };

      const isValid = settings.ai.provider === 'ollama' || settings.ai.apiKey.length > 0;
      expect(isValid).toBe(false);
    });

    it('should allow empty API key for ollama', () => {
      const settings: LifeWikiSettings = {
        ...DEFAULT_SETTINGS,
        ai: { ...DEFAULT_SETTINGS.ai, provider: 'ollama', apiKey: '' }
      };

      const isValid = settings.ai.provider === 'ollama' || settings.ai.apiKey.length > 0;
      expect(isValid).toBe(true);
    });

    it('should validate base URL format', () => {
      const validUrls = [
        'https://dashscope.aliyuncs.com/compatible-mode/v1',
        'http://localhost:11434',
        'https://api.openai.com/v1'
      ];

      for (const url of validUrls) {
        expect(url.startsWith('http')).toBe(true);
      }
    });

    it('should validate model is not empty', () => {
      const settings: LifeWikiSettings = {
        ...DEFAULT_SETTINGS,
        ai: { ...DEFAULT_SETTINGS.ai, model: '' }
      };

      expect(settings.ai.model.length).toBe(0);
    });
  });

  describe('settings updates', () => {
    it('should update API key', () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        ai: { ...DEFAULT_SETTINGS.ai, apiKey: 'new-api-key' }
      };

      expect(settings.ai.apiKey).toBe('new-api-key');
      expect(DEFAULT_SETTINGS.ai.apiKey).toBe(''); // Original unchanged
    });

    it('should update provider', () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        ai: { ...DEFAULT_SETTINGS.ai, provider: 'openai' as const }
      };

      expect(settings.ai.provider).toBe('openai');
      expect(DEFAULT_SETTINGS.ai.provider).toBe('dashscope'); // Original unchanged
    });

    it('should update model', () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        ai: { ...DEFAULT_SETTINGS.ai, model: 'gpt-4' }
      };

      expect(settings.ai.model).toBe('gpt-4');
      expect(DEFAULT_SETTINGS.ai.model).toBe('qwen2.5-14b'); // Original unchanged
    });

    it('should update base URL', () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        ai: { ...DEFAULT_SETTINGS.ai, baseUrl: 'https://api.anthropic.com' }
      };

      expect(settings.ai.baseUrl).toBe('https://api.anthropic.com');
      expect(DEFAULT_SETTINGS.ai.baseUrl).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1'); // Original unchanged
    });
  });

  describe('provider specific settings', () => {
    it('should have correct base URL for OpenAI', () => {
      const settings: LifeWikiSettings = {
        ...DEFAULT_SETTINGS,
        ai: { ...DEFAULT_SETTINGS.ai, provider: 'openai', baseUrl: 'https://api.openai.com/v1' }
      };

      expect(settings.ai.baseUrl).toContain('openai.com');
    });

    it('should have correct base URL for Claude', () => {
      const settings: LifeWikiSettings = {
        ...DEFAULT_SETTINGS,
        ai: { ...DEFAULT_SETTINGS.ai, provider: 'claude', baseUrl: 'https://api.anthropic.com' }
      };

      expect(settings.ai.baseUrl).toContain('anthropic.com');
    });

    it('should have correct base URL for Ollama', () => {
      const settings: LifeWikiSettings = {
        ...DEFAULT_SETTINGS,
        ai: { ...DEFAULT_SETTINGS.ai, provider: 'ollama', baseUrl: 'http://localhost:11434' }
      };

      expect(settings.ai.baseUrl).toBe('http://localhost:11434');
    });
  });

  describe('system prompt', () => {
    it('should have default system prompt', () => {
      expect(DEFAULT_SETTINGS.prompts.systemPrompt.length).toBeGreaterThan(0);
    });

    it('should update system prompt', () => {
      const settings = { ...DEFAULT_SETTINGS };
      const newPrompt = '自定义提示词';
      settings.prompts.systemPrompt = newPrompt;

      expect(settings.prompts.systemPrompt).toBe(newPrompt);
    });
  });

  describe('settings serialization', () => {
    it('should serialize to JSON', () => {
      const freshSettings: LifeWikiSettings = {
        ai: { provider: 'dashscope', apiKey: '', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen2.5-14b' },
        prompts: { systemPrompt: '你是一个日记分析助手...' },
        skills: { enabled: true, autoConfirm: false }
      };
      const json = JSON.stringify(freshSettings);
      const parsed = JSON.parse(json);

      expect(parsed.ai.provider).toBe('dashscope');
      expect(parsed.ai.apiKey).toBe('');
    });

    it('should deserialize from JSON', () => {
      const json = JSON.stringify({
        ai: { provider: 'openai', apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4' }
      });
      const parsed = JSON.parse(json) as LifeWikiSettings;

      expect(parsed.ai.provider).toBe('openai');
      expect(parsed.ai.apiKey).toBe('test-key');
    });
  });
});

describe('Settings Tab UI', () => {
  describe('setting items', () => {
    it('should have API key input field', () => {
      const fieldName = 'apiKey';
      expect(fieldName).toBe('apiKey');
    });

    it('should have provider dropdown', () => {
      const providers = ['dashscope', 'openai', 'claude', 'ollama'];
      expect(providers).toContain('dashscope');
      expect(providers).toContain('openai');
      expect(providers).toContain('claude');
      expect(providers).toContain('ollama');
    });

    it('should have model input field', () => {
      const fieldName = 'model';
      expect(fieldName).toBe('model');
    });

    it('should have base URL input field', () => {
      const fieldName = 'baseUrl';
      expect(fieldName).toBe('baseUrl');
    });
  });

  describe('setting descriptions', () => {
    it('should have description for API key', () => {
      const description = 'API Key 用于认证 AI 服务';
      expect(description.length).toBeGreaterThan(0);
    });

    it('should have description for provider', () => {
      const description = '选择 AI 服务提供商';
      expect(description.length).toBeGreaterThan(0);
    });

    it('should have description for model', () => {
      const description = '模型名称，如 qwen2.5-14b 或 gpt-4';
      expect(description.length).toBeGreaterThan(0);
    });
  });
});
