/**
 * Web Clipper Tests
 * TDD for URL detection and webpage clipping
 */

import { extractURLs, isWechatURL, isValidURL } from './web-clipper';

describe('URL Extraction', () => {
	describe('extractURLs', () => {
		it('extracts single URL from text', () => {
			const text = '今天看了 https://example.com/article 这篇文章';
			const urls = extractURLs(text);
			expect(urls).toEqual(['https://example.com/article']);
		});

		it('extracts multiple URLs from text', () => {
			const text = '参考了 https://foo.com 和 https://bar.com 两个网站';
			const urls = extractURLs(text);
			expect(urls).toEqual(['https://foo.com', 'https://bar.com']);
		});

		it('extracts http and https URLs', () => {
			const text = 'http://insecure.com and https://secure.com';
			const urls = extractURLs(text);
			expect(urls).toEqual(['http://insecure.com', 'https://secure.com']);
		});

		it('returns empty array when no URLs found', () => {
			const text = '这是一段没有URL的文字';
			const urls = extractURLs(text);
			expect(urls).toEqual([]);
		});

		it('handles URLs with query parameters', () => {
			const text = '查看 https://example.com/search?q=test&page=1';
			const urls = extractURLs(text);
			expect(urls).toEqual(['https://example.com/search?q=test&page=1']);
		});

		it('handles URLs with anchors', () => {
			const text = '参考 https://example.com/page#section';
			const urls = extractURLs(text);
			expect(urls).toEqual(['https://example.com/page#section']);
		});

		it('handles empty string', () => {
			const urls = extractURLs('');
			expect(urls).toEqual([]);
		});

		it('deduplicates URLs', () => {
			const text = '两个相同链接 https://example.com 和 https://example.com';
			const urls = extractURLs(text);
			expect(urls).toEqual(['https://example.com']);
		});

		it('extracts WeChat URLs', () => {
			const text = '微信文章 https://mp.weixin.qq.com/s/test123';
			const urls = extractURLs(text);
			expect(urls).toEqual(['https://mp.weixin.qq.com/s/test123']);
		});
	});
});

describe('Wechat URL Detection', () => {
	describe('isWechatURL', () => {
		it('returns true for wechat article URLs', () => {
			expect(isWechatURL('https://mp.weixin.qq.com/s/abc123')).toBe(true);
			expect(isWechatURL('http://mp.weixin.qq.com/s/abc123')).toBe(true);
			expect(isWechatURL('https://mp.weixin.qq.com/s?__biz=xxx')).toBe(true);
		});

		it('returns false for non-wechat URLs', () => {
			expect(isWechatURL('https://example.com/article')).toBe(false);
			expect(isWechatURL('https://zhihu.com/p/123')).toBe(false);
			expect(isWechatURL('https://toutiao.com/article')).toBe(false);
		});

		it('returns false for empty string', () => {
			expect(isWechatURL('')).toBe(false);
		});

		it('handles various WeChat URL patterns', () => {
			// Article URL pattern
			expect(isWechatURL('https://mp.weixin.qq.com/s/abc123456789')).toBe(true);
			// Legacy URL pattern
			expect(isWechatURL('https://mp.weixin.qq.com/cgi-bin/home?t=home/index')).toBe(false);
		});
	});
});

describe('URL Validation', () => {
	describe('isValidURL', () => {
		it('returns true for valid URLs', () => {
			expect(isValidURL('https://example.com')).toBe(true);
			expect(isValidURL('http://example.com')).toBe(true);
			expect(isValidURL('https://example.com/path?query=value')).toBe(true);
		});

		it('returns false for invalid URLs', () => {
			expect(isValidURL('')).toBe(false);
			expect(isValidURL('not-a-url')).toBe(false);
			expect(isValidURL('example.com')).toBe(false);
		});
	});
});
