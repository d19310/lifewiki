/**
 * String Matcher
 * String matching algorithms for entity detection
 * Includes edit distance, simplified/traditional conversion, and similarity scoring
 */

// Chinese simplified/traditional conversion map (common characters)
const SIMPLIFIED_TO_TRADITIONAL: Record<string, string> = {
  '华': '華',
  '为': '為',
  '业': '業',
  '发': '發',
  '展': '展',
  '会': '會',
  '公': '公',
  '司': '司',
  '技': '技',
  '术': '術',
  '有': '有',
  '限': '限',
  '公': '公',
  '司': '司',
  '张': '張',
  '三': '三',
  '李': '李',
  '四': '四',
  '王': '王',
  '五': '五',
  '刘': '劉',
  '陈': '陳',
  '杨': '楊',
  '黄': '黃',
  '公': '公',
  '私': '私',
  '人': '人',
  '个': '個',
  '学': '學',
  '校': '校',
  '生': '生',
  '老': '老',
  '师': '師',
  '医': '醫',
  '院': '院',
  '病': '病',
  '房': '房',
  '药': '藥',
  '店': '店',
  '饭': '飯',
  '店': '店',
  '宾': '賓',
  '馆': '館',
  '酒': '酒',
  '店': '店',
  '火': '火',
  '车': '車',
  '机': '機',
  '场': '場',
  '机': '機',
  '票': '票',
  '火': '火',
  '车': '車',
  '站': '站',
  '国': '國',
  '内': '內',
  '外': '外',
  '银': '銀',
  '行': '行',
  '商': '商',
  '店': '店',
  '市': '市',
  '场': '場',
  '贸': '貿易',
  '易': '易',
  '电': '電',
  '子': '子',
  '商': '商',
  '务': '務',
  '网': '網',
  '络': '絡',
  '资': '資',
  '料': '料',
  '库': '庫',
  '数': '數',
  '据': '據',
  '据': '據',
  '结构': '結構',
  '数': '數',
  '据': '據',
  '据': '據',
  '云': '雲',
  '计': '計',
  '算': '算',
  '大': '大',
  '数': '數',
  '据': '據',
  '互': '互',
  '联': '聯',
  '网': '網',
  '程': '程',
  '序': '序',
  '码': '碼',
  '编': '編',
  '程': '程',
  '开': '開',
  '发': '發',
  '设': '設',
  '计': '計',
  '工': '工',
  '具': '具',
  '软': '軟',
  '件': '件',
  '硬': '硬',
  '件': '件',
  '网': '網',
  '络': '絡',
  '系': '系統',
  '统': '統',
  '统': '統',
  '系': '系統',
  '统': '統',
  '数': '數',
  '据': '據',
  '据': '據',
  '输': '輸',
  '输': '輸',
  '入': '入',
  '输': '輸',
  '出': '出',
  '系': '系統',
  '统': '統'
};

const TRADITIONAL_TO_SIMPLIFIED: Record<string, string> = Object.fromEntries(
  Object.entries(SIMPLIFIED_TO_TRADITIONAL).map(([k, v]) => [v, k])
);

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const aLen = a.length;
  const bLen = b.length;

  // Create matrix
  const matrix: number[][] = [];
  for (let i = 0; i <= aLen; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= bLen; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= aLen; i++) {
    for (let j = 1; j <= bLen; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = 1 + Math.min(
          matrix[i - 1][j],     // deletion
          matrix[i][j - 1],     // insertion
          matrix[i - 1][j - 1]  // substitution
        );
      }
    }
  }

  return matrix[aLen][bLen];
}

/**
 * Calculate string similarity (0-1) based on edit distance
 */
export function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);

  return 1 - distance / maxLen;
}

/**
 * Check if a character is Chinese
 */
export function isChinese(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 0x4e00 && code <= 0x9fa5;
}

/**
 * Check if string contains Chinese characters
 */
export function containsChinese(str: string): boolean {
  for (const char of str) {
    if (isChinese(char)) return true;
  }
  return false;
}

/**
 * Convert simplified Chinese to traditional Chinese
 */
export function simplifiedToTraditional(s: string): string {
  if (!containsChinese(s)) return s;

  let result = '';
  for (const char of s) {
    result += SIMPLIFIED_TO_TRADITIONAL[char] || char;
  }
  return result;
}

/**
 * Convert traditional Chinese to simplified Chinese
 */
export function traditionalToSimplified(s: string): string {
  if (!containsChinese(s)) return s;

  let result = '';
  for (const char of s) {
    result += TRADITIONAL_TO_SIMPLIFIED[char] || char;
  }
  return result;
}

/**
 * Check if two strings are similar within threshold
 */
export function isSimilar(a: string, b: string, threshold = 2): boolean {
  if (a === b) return true;

  // Quick length check
  if (Math.abs(a.length - b.length) > threshold) return false;

  const distance = levenshteinDistance(a, b);
  return distance <= threshold;
}

/**
 * Extract potential entity names from text
 * Simple regex-based extraction for Chinese and English names
 */
export function extractPotentialNames(text: string): string[] {
  const names: Set<string> = new Set();

  // Chinese names (2-4 characters)
  const chineseNameRegex = /[\u4e00-\u9fa5]{2,4}/g;
  let match;
  while ((match = chineseNameRegex.exec(text)) !== null) {
    names.add(match[0]);
  }

  // English names (capitalized words)
  const englishNameRegex = /[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g;
  while ((match = englishNameRegex.exec(text)) !== null) {
    names.add(match[0]);
  }

  return Array.from(names);
}
