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
 * Smarter extraction for Chinese and English names
 */
export function extractPotentialNames(text: string): string[] {
  const names: Set<string> = new Set();

  // Common Chinese surnames (partial list - most common)
  const surnames = new Set([
    '李', '王', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴',
    '徐', '孙', '胡', '朱', '高', '林', '何', '郭', '马', '罗',
    '梁', '宋', '郑', '谢', '韩', '唐', '冯', '于', '董', '萧',
    '程', '曹', '袁', '邓', '许', '傅', '沈', '曾', '彭', '吕',
    '苏', '卢', '蒋', '蔡', '贾', '丁', '魏', '薛', '叶', '阎',
    '余', '潘', '杜', '戴', '夏', '钟', '汪', '田', '任', '姜',
    '范', '方', '石', '姚', '谭', '廖', '邹', '熊', '金', '陆',
    '郝', '孔', '白', '崔', '康', '毛', '邱', '秦', '江', '史',
    '顾', '侯', '邵', '孟', '龙', '万', '段', '雷', '钱', '汤',
    '尹', '黎', '易', '常', '武', '乔', '贺', '赖', '龚', '文'
  ]);

  // Common words/phrases that are NOT names (to filter out)
  const notNamePatterns = [
    '我们', '你们', '他们', '这个', '那个', '什么', '怎么', '如何',
    '因为', '所以', '但是', '如果', '虽然', '或者', '以及',
    '开始', '进行', '完成', '工作', '生活', '学习', '问题',
    '今天', '明天', '昨天', '现在', '已经', '正在', '将要',
    '公司', '项目', '会议', '讨论', '沟通', '提高', '效率',
    '一个', '一些', '一样', '一起', '一直', '一定', '不能',
    '没有', '有些', '其中', '可以', '需要', '应该', '关于'
  ];
  const notNameSet = new Set(notNamePatterns);

  // Extract 2-character Chinese strings
  const twoCharRegex = /[\u4e00-\u9fa5]{2}/g;
  let match;
  while ((match = twoCharRegex.exec(text)) !== null) {
    const name = match[0];
    // Filter out obvious non-names
    if (notNameSet.has(name)) continue;
    // 2-char name should start with a common surname or be a known name pattern
    if (surnames.has(name[0])) {
      names.add(name);
    }
  }

  // Extract 3-character Chinese strings (less common names or title+name)
  const threeCharRegex = /[\u4e00-\u9fa5]{3}/g;
  while ((match = threeCharRegex.exec(text)) !== null) {
    const name = match[0];
    if (notNameSet.has(name)) continue;
    // 3-char name: surname + 2-char given name is most common
    if (surnames.has(name[0])) {
      names.add(name);
    }
  }

  // English names (capitalized words)
  const englishNameRegex = /[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g;
  while ((match = englishNameRegex.exec(text)) !== null) {
    names.add(match[0]);
  }

  return Array.from(names);
}

