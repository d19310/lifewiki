/**
 * URL Utilities
 * Pure functions for URL extraction and validation
 */

// URL extraction regex - matches http:// or https:// followed by non-whitespace chars
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
