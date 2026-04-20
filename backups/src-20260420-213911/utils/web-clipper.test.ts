/**
 * Web Clipper Tests
 * TDD for URL detection and webpage clipping
 */

import { extractURLs, isWechatURL, isValidURL } from './web-clipper';

// Mock DOM for Node.js environment
// Based on how Turndown handles elements: https://github.com/jking45/turndown

// Safe proxy for parent node to prevent null access errors
class SafeParentProxy {
	isCode: boolean = false;
	isBlank: boolean = true;
	parentNode: SafeParentProxy | null = null;
}

// Mock DOM for Node.js environment
class MockElement {
	nodeName: string;
	nodeType: number = 1; // Node.ELEMENT_NODE
	tagName: string;
	id: string = '';
	className: string = '';
	textContent: string = '';
	children: MockElement[] = [];
	_ownerDocument: any = null;
	isCode: boolean = false;
	isBlank: boolean = false;
	private _childNodes: MockElement[] = [];
	private _html: string = '';
	private _parentNode: MockElement | null = null;

	constructor(tagName: string) {
		this.tagName = tagName.toUpperCase();
		this.nodeName = tagName.toUpperCase();
	}

	// Safe parent node access that never returns null
	get parentNode(): MockElement | SafeParentProxy {
		return this._parentNode || new SafeParentProxy();
	}

	set parentNode(node: MockElement | null) {
		this._parentNode = node;
	}

	get ownerDocument(): any {
		return this._ownerDocument;
	}

	set ownerDocument(doc: any) {
		this._ownerDocument = doc;
	}

	get childNodes(): MockElement[] {
		return this._childNodes;
	}

	get innerHTML(): string {
		return this._html;
	}

	set innerHTML(html: string) {
		this._html = html;
		this._childNodes = [];
		this.children = [];
		this.textContent = '';

		// Parse HTML into elements
		const parsed = this.parseHTML(html);
		this._childNodes = parsed;
		this.children = parsed.filter(c => c.nodeType === 1); // Only element nodes
		this.textContent = this._childNodes.map(c => c.textContent || '').join('');
		this.isBlank = !this.textContent.trim();
	}

	private parseHTML(html: string): MockElement[] {
		const elements: MockElement[] = [];
		let remaining = html.trim();

		// Match opening tag with attributes and closing tag
		const tagRegex = /<(\w+)([^>]*)>([\s\S]*?)<\/\1>|<(\w+)([^>]*)\/>/gi;

		while (remaining.length > 0) {
			const beforeMatch = remaining;
			const match = tagRegex.exec(remaining);

			if (!match) {
				// No more tags, treat remaining as text
				const text = remaining.trim();
				if (text) {
					const textEl = new MockElement('#text');
					textEl.nodeName = '#text';
					textEl.textContent = text;
					textEl.nodeType = 3; // Node.TEXT_NODE
					textEl.parentNode = this;
					elements.push(textEl);
				}
				break;
			}

			// Check if there's text before this match
			const beforeText = remaining.substring(0, match.index).trim();
			if (beforeText) {
				const textEl = new MockElement('#text');
				textEl.nodeName = '#text';
				textEl.textContent = beforeText;
				textEl.nodeType = 3;
				textEl.parentNode = this;
				elements.push(textEl);
			}

			if (match[4]) {
				// Self-closing tag like <br/>
				const el = new MockElement(match[4]);
				el.nodeName = match[4].toUpperCase();
				el.parentNode = this;
				this.parseAttributes(match[5] || '', el);
				elements.push(el);
			} else {
				// Regular tag
				const el = new MockElement(match[1]);
				el.nodeName = match[1].toUpperCase();
				el.parentNode = this;
				this.parseAttributes(match[2], el);

				// Check if content contains nested tags
				const content = match[3];
				if (content.includes('<')) {
					el._childNodes = el.parseHTML(content);
					el.children = el._childNodes.filter(c => c.nodeType === 1);
					el.textContent = el._childNodes.map(c => c.textContent || '').join('');
				} else {
					el.textContent = content;
					const textNode = new MockElement('#text');
					textNode.nodeName = '#text';
					textNode.textContent = content;
					textNode.nodeType = 3;
					textNode.parentNode = el;
					el._childNodes = [textNode];
				}
				elements.push(el);
			}

			// Move past this match
			remaining = remaining.substring(match.index + match[0].length);
		}

		return elements;
	}

	private parseAttributes(attrStr: string, el: MockElement): void {
		const attrRegex = /(\w+)="([^"]*)"/g;
		let match;
		while ((match = attrRegex.exec(attrStr)) !== null) {
			const name = match[1];
			const value = match[2];
			if (name === 'class') {
				el.className = value;
			} else if (name === 'id') {
				el.id = value;
			} else {
				(el as any)[name] = value;
			}
		}
	}

	querySelector(selector: string): MockElement | null {
		if (selector.startsWith('.')) {
			const className = selector.slice(1);
			return this.querySelectorInternal((el) => el.className.split(' ').includes(className));
		}
		if (selector.startsWith('#')) {
			const id = selector.slice(1);
			return this.querySelectorInternal((el) => el.id === id);
		}
		if (selector.startsWith('meta[')) {
			const match = selector.match(/\[(\w+)="([^"]+)"\]/);
			if (match) {
				const attr = match[1];
				const value = match[2];
				return this.querySelectorInternal((el) => el.getAttribute(attr) === value);
			}
		}
		// Try as tag name
		return this.querySelectorInternal((el) => el.tagName === selector.toUpperCase());
	}

	private querySelectorInternal(predicate: (el: MockElement) => boolean): MockElement | null {
		if (predicate(this)) return this;
		for (const child of this._childNodes) {
			if (child.nodeType === 1) { // Only element nodes
				const found = child.querySelectorInternal(predicate);
				if (found) return found;
			}
		}
		return null;
	}

	querySelectorAll(selector: string): MockElement[] {
		const results: MockElement[] = [];
		this.querySelectorAllInternal(selector, results);
		return results;
	}

	private querySelectorAllInternal(selector: string, results: MockElement[]): void {
		if (selector === 'p') {
			if (this.tagName === 'P') {
				results.push(this);
			}
		} else if (this.tagName === selector.toUpperCase()) {
			results.push(this);
		}

		for (const child of this._childNodes) {
			if (child.nodeType === 1) { // Only element nodes
				(child as MockElement).querySelectorAllInternal(selector, results);
			}
		}
	}

	getAttribute(name: string): string | null {
		// Handle special meta tag attribute lookups
		if (name === 'property') {
			return (this as any)['property'] || null;
		}
		return (this as any)[name] || null;
	}

	cloneNode(_deep?: boolean): MockElement {
		const clone = new MockElement(this.tagName);
		clone.nodeName = this.nodeName;
		clone.nodeType = this.nodeType;
		clone.id = this.id;
		clone.className = this.className;
		clone.textContent = this.textContent;
		clone._html = this._html;
		clone._childNodes = this._childNodes.map(c => (c as MockElement).cloneNode?.() || c);
		clone.children = this.children.map(c => (c as MockElement).cloneNode?.() || c);
		return clone;
	}
}

class MockDocument {
	createElement(tagName: string): MockElement {
		return new MockElement(tagName);
	}

	createElementNS(_ns: string, tagName: string): MockElement {
		return new MockElement(tagName);
	}
}

// Set up DOM mock before importing the module
const mockDoc = new MockDocument();
(global as any).document = mockDoc;

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

describe('Webpage Clipping', () => {
	// Mock fetch for all tests in this describe block
	let mockFetch: jest.Mock;

	beforeEach(() => {
		mockFetch = jest.fn();
		global.fetch = mockFetch;
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('clipWebpage', () => {
		it('returns error for invalid URL', async () => {
			const { clipWebpage } = await import('./web-clipper');
			const result = await clipWebpage('not-a-url');

			expect(result.error).toBe('Invalid URL');
			expect(result.title).toBe('');
			expect(result.content).toBe('');
		});

		it('clips generic webpage successfully', async () => {
			const { clipWebpage } = await import('./web-clipper');

			const html = `
				<!DOCTYPE html>
				<html>
				<head>
					<title>Test Article Title</title>
					<meta name="author" content="Test Author">
					<meta property="og:site_name" content="Test Site">
				</head>
				<body>
					<article>
						<h1>Main Title</h1>
						<p>This is the first paragraph of the article.</p>
						<p>This is the second paragraph with more content.</p>
					</article>
				</body>
				</html>
			`;

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				text: () => Promise.resolve(html)
			});

			const result = await clipWebpage('https://example.com/article');

			expect(result.error).toBeUndefined();
			expect(result.url).toBe('https://example.com/article');
			expect(result.title).toBe('Test Article Title');
			expect(result.author).toBe('Test Author');
			expect(result.siteName).toBe('Test Site');
			expect(result.content).toContain('Main Title');
			expect(result.content).toContain('first paragraph');
			expect(result.clippedAt).toBeDefined();
		});

		it('clips WeChat article successfully', async () => {
			const { clipWebpage } = await import('./web-clipper');

			const wechatHtml = `
				<!DOCTYPE html>
				<html>
				<body>
					<h1 class="rich_media_title">微信文章标题</h1>
					<div id="js_name">微信公众号名称</div>
					<div id="js_content">
						<p>这是微信文章的正文内容。</p>
						<p>包含多个段落。</p>
					</div>
				</body>
				</html>
			`;

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				text: () => Promise.resolve(wechatHtml)
			});

			const result = await clipWebpage('https://mp.weixin.qq.com/s/abc123456789');

			expect(result.error).toBeUndefined();
			expect(result.title).toBe('微信文章标题');
			expect(result.author).toBe('微信公众号名称');
			expect(result.siteName).toBe('微信公众号');
			expect(result.content).toContain('微信文章的正文内容');
		});

		it('handles network errors gracefully', async () => {
			const { clipWebpage } = await import('./web-clipper');

			mockFetch.mockRejectedValueOnce(new Error('Network failed'));

			const result = await clipWebpage('https://example.com/article');

			expect(result.error).toBe('Network failed');
			expect(result.title).toBe('');
			expect(result.content).toBe('');
		});

		it('handles HTTP errors', async () => {
			const { clipWebpage } = await import('./web-clipper');

			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 404,
				text: () => Promise.resolve('Not Found')
			});

			const result = await clipWebpage('https://example.com/not-found');

			expect(result.error).toContain('404');
		});

		it('truncates very long content', async () => {
			const { clipWebpage } = await import('./web-clipper');

			const longContent = '<html><body><article><p>' + 'a'.repeat(150000) + '</p></article></body></html>';
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				text: () => Promise.resolve(longContent)
			});

			const result = await clipWebpage('https://example.com/long');

			expect(result.truncated).toBe(true);
			expect(result.content.length).toBeLessThan(150000);
		});

		it('extracts Open Graph title when available', async () => {
			const { clipWebpage } = await import('./web-clipper');

			const html = `
				<html>
				<head>
					<meta property="og:title" content="OG Title Here">
					<title>HTML Title</title>
				</head>
				<body><article><p>Content</p></article></body>
				</html>
			`;

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				text: () => Promise.resolve(html)
			});

			const result = await clipWebpage('https://example.com/article');

			// OG title should take precedence
			expect(result.title).toBe('OG Title Here');
		});

		it('extracts meta author correctly', async () => {
			const { clipWebpage } = await import('./web-clipper');

			const html = `
				<html>
				<head>
					<meta name="author" content="Article Author Name">
					<title>Test</title>
				</head>
				<body><article><p>Content</p></article></body>
				</html>
			`;

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				text: () => Promise.resolve(html)
			});

			const result = await clipWebpage('https://example.com/article');

			expect(result.author).toBe('Article Author Name');
		});

		it('returns error for WeChat when content extraction fails', async () => {
			const { clipWebpage } = await import('./web-clipper');

			// WeChat HTML without js_content
			const wechatHtml = `
				<html>
				<body>
					<h1 class="rich_media_title">Title</h1>
					<div id="js_name">Author</div>
				</body>
				</html>
			`;

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				text: () => Promise.resolve(wechatHtml)
			});

			const result = await clipWebpage('https://mp.weixin.qq.com/s/test123');

			expect(result.error).toBe('Could not extract content from WeChat article');
		});

		it('uses fallback content extraction when no article element found', async () => {
			const { clipWebpage } = await import('./web-clipper');

			const html = `
				<html>
				<head><title>Simple Page</title></head>
				<body>
					<div class="content">
						<p>Main content paragraph.</p>
						<p>Another paragraph.</p>
						<p>Third paragraph with more text.</p>
					</div>
				</body>
				</html>
			`;

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				text: () => Promise.resolve(html)
			});

			const result = await clipWebpage('https://example.com/simple');

			expect(result.error).toBeUndefined();
			expect(result.content).toContain('Main content');
		});
	});
});
