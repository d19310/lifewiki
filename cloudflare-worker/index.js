/**
 * LifeWiki AI Proxy - Cloudflare Worker
 *
 * 用途：为 Obsidian 插件提供 CORS 代理，安全的转发 AI API 请求
 *
 * 部署步骤：
 * 1. 安装 Wrangler: npm install -g wrangler
 * 2. 登录 Cloudflare: wrangler login
 * 3. 创建 Worker: wrangler init lifewiki-proxy
 * 4. 设置 API Key secret: wrangler secret put API_KEY
 * 5. 部署: wrangler deploy
 *
 * API Key 可以是:
 * - DashScope (阿里百炼): https://help.aliyun.com/zh/dashscope/
 * - OpenAI: https://platform.openai.com/api-keys
 * - Anthropic: https://console.anthropic.com/settings/keys
 */

const ALLOWED_ORIGINS = [
  'app://obsidian.md',  // Obsidian desktop
  'obsidian://',         // Obsidian protocol
];

const API_CONFIG = {
  dashscope: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
  },
};

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    // Only allow POST
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const origin = request.headers.get('Origin') || request.headers.get('Referer');
    if (!isOriginAllowed(origin)) {
      return jsonResponse({ error: 'Origin not allowed' }, 403);
    }

    try {
      const body = await request.json();
      const { provider = 'dashscope', model, messages, stream = false } = body;

      if (!messages || !Array.isArray(messages)) {
        return jsonResponse({ error: 'Invalid request: messages required' }, 400);
      }

      const config = API_CONFIG[provider];
      if (!config) {
        return jsonResponse({ error: `Unknown provider: ${provider}` }, 400);
      }

      const apiKey = env.API_KEY;
      if (!apiKey) {
        return jsonResponse({ error: 'API_KEY not configured' }, 500);
      }

      // Build request to upstream API
      const upstreamResponse = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || config.defaultModel,
          messages,
          stream,
        }),
      });

      if (!upstreamResponse.ok) {
        const errorText = await upstreamResponse.text();
        return jsonResponse({
          error: `Upstream API error: ${upstreamResponse.status}`,
          details: errorText
        }, upstreamResponse.status);
      }

      // Handle streaming
      if (stream) {
        return new Response(upstreamResponse.body, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': origin || '*',
          },
        });
      }

      // Handle non-streaming
      const data = await upstreamResponse.json();
      return jsonResponse(data, 200, origin);

    } catch (error) {
      console.error('Proxy error:', error);
      return jsonResponse({ error: 'Internal error', message: error.message }, 500);
    }
  }
};

function isOriginAllowed(origin) {
  if (!origin) return true; // Allow if no origin
  return ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed));
}

function handleOptions(request) {
  const origin = request.headers.get('Origin') || '*';
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

function jsonResponse(data, status = 200, origin = '*') {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
    },
  });
}
