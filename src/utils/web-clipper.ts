/**
 * Web Clipper
 * Extracts main content from web pages and converts to Markdown
 *
 * Supports:
 * - Generic websites using Readability-style extraction
 * - WeChat articles (mp.weixin.qq.com)
 *
 * Uses browser's native DOM APIs for HTML parsing (works in Obsidian/Electron)
 * Uses Turndown for HTML to Markdown conversion
 */

import Turndown from 'turndown';

export interface ClipResult {
	title: string;
	content: string;
	author?: string;
	siteName?: string;
	url: string;
	clippedAt: string;
	error?: string;
	truncated?: boolean;
}

// URL extraction regex
const URL_REGEX = /(https?:\/\/[^\s<>"']+)/g;

/**
 * Extract all URLs from text
 */
export function extractURLs(text: string): string[] {
	if (!text) return [];
	const matches = text.match(URL_REGEX);
	return matches ? [...new Set(matches)] : [];
}

/**
 * Check if URL is a WeChat article
 * WeChat articles use /s/ path (e.g., /s/abc123456789) or /s?query pattern
 * Legacy URLs like /cgi-bin/home are not articles
 */
export function isWechatURL(url: string): boolean {
	return url.includes('mp.weixin.qq.com') && (url.includes('/s/') || url.includes('/s?'));
}

/**
 * Basic URL validation
 */
export function isValidURL(url: string): boolean {
	try {
		new URL(url);
		return true;
	} catch {
		return false;
	}
}

/**
 * Fetch webpage content using native fetch (works in Electron renderer)
 */
async function fetchWebpage(url: string): Promise<{ html: string; status: number }> {
	const response = await fetch(url, {
		headers: {
			'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
			Accept: 'text/html,application/xhtml+xml',
		},
	});

	if (!response.ok) {
		throw new Error(`Fetch failed with status ${response.status}`);
	}

	const html = await response.text();
	return { html, status: response.status };
}

/**
 * Parse HTML using browser's native DOM APIs
 * Returns a mock document-like object with querySelector
 */
function parseHtmlToDOM(html: string): Element {
	// Create a temporary container and parse HTML
	const container = document.createElement('div');
	container.innerHTML = html;

	// Return the container as an Element-like object
	return container;
}

/**
 * Extract text content from an element
 */
function getElementText(element: Element): string {
	return element.textContent || '';
}

/**
 * Check if element has substantial content
 */
function hasSubstantialContent(element: Element): boolean {
	const text = element.textContent || '';
	const paragraphs = element.querySelectorAll('p');
	// Heuristic: at least 100 chars of text and more than 2 paragraphs
	return text.trim().length > 100 && paragraphs.length > 2;
}

/**
 * Main entry point for clipping any URL
 * Dispatches to appropriate clipper based on URL type
 */
export async function clipWebpage(url: string): Promise<ClipResult> {
	const result: ClipResult = {
		title: '',
		content: '',
		url,
		clippedAt: new Date().toISOString(),
	};

	try {
		// Validate URL
		if (!isValidURL(url)) {
			result.error = 'Invalid URL';
			return result;
		}

		// Dispatch to appropriate clipper
		if (isWechatURL(url)) {
			return await clipWechatArticle(url);
		}
		return await clipGenericWebpage(url);
	} catch (error) {
		result.error = (error as Error).message;
		return result;
	}
}

/**
 * Clip generic website using browser DOM + Readability-style extraction
 */
async function clipGenericWebpage(url: string): Promise<ClipResult> {
	const result: ClipResult = {
		title: '',
		content: '',
		url,
		clippedAt: new Date().toISOString(),
	};

	// Fetch webpage
	const { html } = await fetchWebpage(url);

	// Parse HTML using browser DOM
	const doc = parseHtmlToDOM(html);

	// Extract title
	result.title = extractTitle(doc);

	// Extract author from meta tags
	result.author = extractAuthor(doc);

	// Extract site name
	result.siteName = extractSiteName(doc);

	// Extract main content using Readability-style extraction
	const content = extractMainContent(doc);

	// Convert HTML to Markdown using Turndown
	const turndown = new Turndown({
		headingStyle: 'atx',
		codeBlockStyle: 'fenced',
	});
	result.content = turndown.turndown(content);

	// Truncate if too long (max 100KB of markdown)
	const MAX_CONTENT_LENGTH = 100000;
	if (result.content.length > MAX_CONTENT_LENGTH) {
		result.content = result.content.substring(0, MAX_CONTENT_LENGTH) + '\n\n...[内容已截断]';
		result.truncated = true;
	}

	return result;
}

/**
 * Clip WeChat article using special parsing logic
 * WeChat articles have structured HTML that can be parsed directly
 */
async function clipWechatArticle(url: string): Promise<ClipResult> {
	const result: ClipResult = {
		title: '',
		content: '',
		url,
		clippedAt: new Date().toISOString(),
	};

	try {
		const { html } = await fetchWebpage(url);

		// Parse HTML using browser DOM
		const doc = parseHtmlToDOM(html);

		// WeChat-specific extraction using querySelector
		// Title: class="rich_media_title"
		const titleEl = doc.querySelector('.rich_media_title');
		if (titleEl) {
			result.title = titleEl.textContent?.trim() || '';
		}

		// Author: id="js_name"
		const authorEl = doc.querySelector('#js_name');
		if (authorEl) {
			result.author = authorEl.textContent?.trim() || '';
		}

		// Content: id="js_content"
		const contentEl = doc.querySelector('#js_content');
		if (contentEl) {
			let contentHtml = contentEl.innerHTML;

			// Fix lazy loading images: data-src -> src
			contentHtml = contentHtml.replace(/data-src="/g, 'src="');
			// Add referrerpolicy for WeChat images
			contentHtml = contentHtml.replace(
				/<img src="([^"]+)"/g,
				'<img src="$1" referrerpolicy="no-referrer"'
			);

			// Convert to Markdown
			const turndown = new Turndown({
				headingStyle: 'atx',
				codeBlockStyle: 'fenced',
			});
			result.content = turndown.turndown(contentHtml);
		} else {
			result.error = 'Could not extract content from WeChat article';
			return result;
		}

		result.siteName = '微信公众号';

		// Truncate if too long
		const MAX_CONTENT_LENGTH = 100000;
		if (result.content.length > MAX_CONTENT_LENGTH) {
			result.content = result.content.substring(0, MAX_CONTENT_LENGTH) + '\n\n...[内容已截断]';
			result.truncated = true;
		}
	} catch (error) {
		result.error = `WeChat clip failed: ${(error as Error).message}`;
	}

	return result;
}

/**
 * Extract title from document
 */
function extractTitle(doc: Element): string {
	// Try Open Graph title first
	const ogTitle = doc.querySelector('meta[property="og:title"]');
	if (ogTitle?.getAttribute('content')) {
		return ogTitle.getAttribute('content')!.trim();
	}

	// Try Twitter title
	const twitterTitle = doc.querySelector('meta[name="twitter:title"]');
	if (twitterTitle?.getAttribute('content')) {
		return twitterTitle.getAttribute('content')!.trim();
	}

	// Fall back to <title> tag
	const titleEl = doc.querySelector('title');
	if (titleEl?.textContent) {
		return titleEl.textContent.trim();
	}

	// Last resort: first h1
	const h1 = doc.querySelector('h1');
	if (h1?.textContent) {
		return h1.textContent.trim();
	}

	return '';
}

/**
 * Extract author from meta tags
 */
function extractAuthor(doc: Element): string | undefined {
	const authorMeta = doc.querySelector('meta[name="author"]');
	if (authorMeta?.getAttribute('content')) {
		return authorMeta.getAttribute('content')!.trim();
	}

	const articleAuthor = doc.querySelector('meta[property="article:author"]');
	if (articleAuthor?.getAttribute('content')) {
		return articleAuthor.getAttribute('content')!.trim();
	}

	return undefined;
}

/**
 * Extract site name from meta tags
 */
function extractSiteName(doc: Element): string | undefined {
	const ogSiteName = doc.querySelector('meta[property="og:site_name"]');
	if (ogSiteName?.getAttribute('content')) {
		return ogSiteName.getAttribute('content')!.trim();
	}

	return undefined;
}

/**
 * Extract main content from document using Readability-style heuristics
 */
function extractMainContent(doc: Element): Element {
	// Try common content selectors in order
	const contentSelectors = [
		'article',
		'[role="main"]',
		'main',
		'.content',
		'.post-content',
		'.article-content',
		'.entry-content',
		'.post-body',
		'#content',
		'#main-content',
	];

	for (const selector of contentSelectors) {
		const element = doc.querySelector(selector);
		if (element && hasSubstantialContent(element)) {
			return element;
		}
	}

	// Fall back to body
	return doc;
}
