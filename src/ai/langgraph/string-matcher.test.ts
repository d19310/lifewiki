/**
 * String Matcher Tests
 * Tests for edit distance, simplified/traditional conversion, and string similarity
 */

import {
  levenshteinDistance,
  stringSimilarity,
  simplifiedToTraditional,
  traditionalToSimplified,
  isChinese,
  isSimilar
} from './string-matcher';

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0);
  });

  it('returns 1 for single character difference', () => {
    expect(levenshteinDistance('cat', 'bat')).toBe(1);
    expect(levenshteinDistance('张三', '张山')).toBe(1);
  });

  it('returns distance for insertions', () => {
    expect(levenshteinDistance('cat', 'cats')).toBe(1);
    expect(levenshteinDistance('cat', 'chat')).toBe(1);
  });

  it('returns distance for deletions', () => {
    expect(levenshteinDistance('cats', 'cat')).toBe(1);
  });

  it('returns distance for substitutions', () => {
    expect(levenshteinDistance('hello', 'hallo')).toBe(1);
  });

  it('handles empty strings', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
    expect(levenshteinDistance('', '')).toBe(0);
  });

  it('handles Chinese characters', () => {
    expect(levenshteinDistance('你好', '你好')).toBe(0);
    expect(levenshteinDistance('华为', '华为技术')).toBe(2);
  });
});

describe('stringSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(stringSimilarity('hello', 'hello')).toBe(1);
  });

  it('returns higher similarity for closer strings', () => {
    const similar = stringSimilarity('cat', 'cats');
    const different = stringSimilarity('cat', 'dog');
    expect(similar).toBeGreaterThan(different);
  });

  it('returns 0 for completely different strings', () => {
    expect(stringSimilarity('abc', 'xyz')).toBe(0);
  });

  it('handles Chinese characters', () => {
    expect(stringSimilarity('华为', '华为')).toBe(1);
  });
});

describe('simplifiedToTraditional', () => {
  it('converts simplified to traditional Chinese', () => {
    expect(simplifiedToTraditional('华为技术有限公司')).toBe('華為技術有限公司');
  });

  it('handles English and numbers unchanged', () => {
    expect(simplifiedToTraditional('ABC123')).toBe('ABC123');
  });

  it('handles mixed content', () => {
    const result = simplifiedToTraditional('张三ABC');
    // Should convert Chinese chars, keep English
    expect(result).toBe('張三ABC');
  });

  it('returns empty string for empty input', () => {
    expect(simplifiedToTraditional('')).toBe('');
  });
});

describe('traditionalToSimplified', () => {
  it('converts traditional to simplified Chinese', () => {
    expect(traditionalToSimplified('華為技術有限公司')).toBe('华为技术有限公司');
  });

  it('handles English and numbers unchanged', () => {
    expect(traditionalToSimplified('ABC123')).toBe('ABC123');
  });

  it('is inverse of simplifiedToTraditional', () => {
    const original = '华为技术有限公司';
    const converted = simplifiedToTraditional(original);
    const restored = traditionalToSimplified(converted);
    expect(restored).toBe(original);
  });
});

describe('isChinese', () => {
  it('returns true if string is entirely Chinese', () => {
    expect(isChinese('华为')).toBe(true);
    expect(isChinese('华为技术有限公司')).toBe(true);
  });

  it('returns false for English', () => {
    expect(isChinese('abc')).toBe(false);
    expect(isChinese('ABC')).toBe(false);
  });

  it('returns false for numbers', () => {
    expect(isChinese('123')).toBe(false);
  });
});

describe('isSimilar', () => {
  it('returns true for identical strings', () => {
    expect(isSimilar('hello', 'hello')).toBe(true);
  });

  it('returns true for strings within threshold', () => {
    expect(isSimilar('cat', 'cats', 1)).toBe(true);
    expect(isSimilar('华为', '华为技术', 2)).toBe(true);
  });

  it('returns false for strings beyond threshold', () => {
    expect(isSimilar('cat', 'dog', 2)).toBe(false);
    expect(isSimilar('华为', '阿里巴巴', 3)).toBe(false);
  });

  it('handles Chinese characters', () => {
    expect(isSimilar('张三', '张山', 1)).toBe(true);
    expect(isSimilar('张三', '李四', 1)).toBe(false);
  });

  it('uses default threshold of 2', () => {
    expect(isSimilar('张三', '张山')).toBe(true);  // same surname
    expect(isSimilar('张三', '李四', 1)).toBe(false);  // different surname, distance 1 but different characters
  });
});
