/**
 * Web Clipper
 * Extracts main content from web pages and converts to Markdown
 *
 * Supports:
 * - Generic websites using Readability-style extraction
 * - WeChat articles (mp.weixin.qq.com)
 *
 * Note: JSDOM and Turndown are optional dependencies,
 * loaded lazily when needed for generic web clipping.
 */

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

// Lazy imports for heavy dependencies
let JSDOM: any;
let TurndownService: any;

async function loadDependencies() {
	if (!JSDOM) {
		const jsdom = await import('jsdom');
		JSDOM = jsdom.JSDOM;
		const turndownModule = await import('turndown');
		TurndownService = turndownModule.default;
	}
}

// URL extraction regex
const URL_REGEX = /(https?:\/\/[^\s<>"\]\)]+)/g;

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
 * Clip generic website using JSDOM + Readability-style extraction
 */
async function clipGenericWebpage(url: string): Promise<ClipResult> {
	const result: ClipResult = {
		title: '',
		content: '',
		url,
		clippedAt: new Date().toISOString(),
	};

	// Load dependencies lazily
	await loadDependencies();

	// Fetch webpage
	const response = await fetch(url, {
		headers: {
			'User-Agent':
				'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
			Accept: 'text/html,application/xhtml+xml',
		},
	});

	if (!response.ok) {
		result.error = `Fetch failed with status ${response.status}`;
		return result;
	}

	const html = await response.text();

	// Parse with JSDOM
	const dom = new JSDOM(html);
	const doc = dom.window.document;

	// Extract title
	result.title = extractTitle(doc);

	// Extract author from meta tags
	result.author = extractAuthor(doc);

	// Extract site name
	result.siteName = extractSiteName(doc);

	// Extract main content using Readability-style extraction
	const content = extractMainContent(doc);

	// Convert HTML to Markdown
	const turndown = new TurndownService({
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
		error: undefined,
	};

	// For WeChat, we need to use requestUrl from Obsidian
	// Since this module may be used outside Obsidian context,
	// we fall back to a simple regex-based extraction
	try {
		const response = await fetch(url, {
			headers: {
				'User-Agent':
					'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
				Accept: 'text/html,application/xhtml+xml',
				Referer: 'https://mp.weixin.qq.com/',
			},
		});

		if (!response.ok) {
			result.error = `WeChat fetch failed with status ${response.status}`;
			return result;
		}

		const html = await response.text();

		// WeChat-specific extraction using regex
		// Title: class="rich_media_title"
		const titleMatch = html.match(/class="rich_media_title"[^>]*>([^<]+)<\/h1>/);
		if (titleMatch) {
			result.title = titleMatch[1].trim();
		}

		// Author: id="js_name"
		const authorMatch = html.match(/id="js_name"[^>]*>([^<]+)<\/strong>/);
		if (authorMatch) {
			result.author = authorMatch[1].trim();
		}

		// Content: id="js_content"
		const contentMatch = html.match(/id="js_content"[^>]*>([\s\S]*?)<div id="js_pc_qr_code"/);
		if (contentMatch) {
			let contentHtml = contentMatch[1];

			// Fix lazy loading images: data-src -> src
			contentHtml = contentHtml.replace(/data-src="/g, 'src="');
			// Add referrerpolicy for WeChat images
			contentHtml = contentHtml.replace(
				/<img src="([^"]+)"/g,
				'<img src="$1" referrerpolicy="no-referrer"'
			);

			// Convert to Markdown
			const turndown = new TurndownService({
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
function extractTitle(doc: Document): string {
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
function extractAuthor(doc: Document): string | undefined {
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
function extractSiteName(doc: Document): string | undefined {
	const ogSiteName = doc.querySelector('meta[property="og:site_name"]');
	if (ogSiteName?.getAttribute('content')) {
		return ogSiteName.getAttribute('content')!.trim();
	}

	return undefined;
}

/**
 * Extract main content from document using Readability-style heuristics
 */
function extractMainContent(doc: Document): Element {
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
	return doc.body;
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
