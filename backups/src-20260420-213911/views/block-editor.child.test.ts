/**
 * Block Editor Child Block Tests
 * Tests for child block parsing, selection, and appending functionality
 */

import { Block } from '../entities/types';

/**
 * UUID generator for tests
 */
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

interface ParsedBlock {
  id: string;
  timestamp: string;
  source: string;
  category: string;
  content: string;
  children: string[];
}

/**
 * Parse diary content into structured blocks (from block-editor.ts)
 * Format:
 * ### HH:mm [source] #category
 * Parent content;
 * - 08:55 Child content 1
 * - 09:55 Child content 2
 */
function parseBlocksFromContent(content: string): ParsedBlock[] {
  const lines = content.split('\n');
  const blocks: ParsedBlock[] = [];
  let currentBlock: ParsedBlock | null = null;
  let currentContentLines: string[] = [];
  let currentChildren: string[] = [];

  for (const line of lines) {
    // Match H3 header: ### HH:mm [source] #category
    const headerMatch = line.match(/^### (\d{2}:\d{2}) \[([^\]]+)\] #(\S+)/);

    if (headerMatch) {
      // Save previous block if exists
      if (currentBlock) {
        currentBlock.content = currentContentLines.join('\n').trim();
        currentBlock.children = [...currentChildren];
        blocks.push(currentBlock);
      }

      // Start new block
      currentBlock = {
        id: uuid(),
        timestamp: headerMatch[1],
        source: headerMatch[2],
        category: headerMatch[3],
        content: '',
        children: []
      };
      currentContentLines = [];
      currentChildren = [];
    }
    // Child block: starts with "- " with optional "HH:mm " prefix
    else if (line.startsWith('- ') && currentBlock) {
      // Extract child content (remove "- HH:mm " prefix if present)
      const childContent = line.substring(2).replace(/^\d{2}:\d{2}\s+/, '');
      if (childContent.trim()) {
        currentChildren.push(childContent.trim());
      }
    }
    // Content line (not empty, not a header)
    else if (line.trim() && currentBlock && !line.startsWith('#') && !line.startsWith('>')) {
      currentContentLines.push(line.trim());
    }
  }

  // Don't forget the last block
  if (currentBlock) {
    currentBlock.content = currentContentLines.join('\n').trim();
    currentBlock.children = currentChildren;
    blocks.push(currentBlock);
  }

  return blocks;
}

/**
 * Extract timestamp from child block line
 * Format: "- HH:mm content" -> returns "HH:mm"
 */
function extractChildTimestamp(line: string): string | null {
  const match = line.match(/^- (\d{2}:\d{2})\s+/);
  return match ? match[1] : null;
}

/**
 * Check if a child block line has a timestamp prefix
 * Format: "- HH:mm content"
 */
function hasChildTimestamp(line: string): boolean {
  return /^- \d{2}:\d{2}\s+/.test(line);
}

/**
 * Add child to parent block in memory
 */
function addChildToBlock(parentBlock: ParsedBlock, childContent: string): ParsedBlock {
  return {
    ...parentBlock,
    children: [...parentBlock.children, childContent]
  };
}

/**
 * Build child line for appending to file
 */
function buildChildLine(content: string, timestamp?: string): string {
  const ts = timestamp || new Date().toTimeString().slice(0, 5);
  return `- ${ts} ${content}`;
}

/**
 * Find parent block header line index in file content
 */
function findParentBlockIndex(lines: string[], parentTimestamp: string, parentSource: string, parentCategory: string): number {
  const parentHeader = `### ${parentTimestamp} [${parentSource}] #${parentCategory}`;
  return lines.findIndex(line => line.includes(parentHeader));
}

/**
 * Find insert position for child block (after parent header and content)
 */
function findChildInsertIndex(lines: string[], parentLineIndex: number): number {
  // Start searching after parent header
  for (let i = parentLineIndex + 1; i < lines.length; i++) {
    // If we hit another ### header, insert before it
    if (lines[i].startsWith('### ')) {
      return i;
    }
    // If we hit a blockquote or other non-content, continue
    if (lines[i].startsWith('>')) {
      continue;
    }
    // If we hit an H2 section header, insert before it
    if (lines[i].startsWith('## ')) {
      return i;
    }
  }
  return lines.length;
}

describe('Block Editor Child Block Logic', () => {
  describe('parseBlocksFromContent', () => {
    it('should parse block with children correctly', () => {
      const content = `### 08:30 [Lifewiki] #工作
和顾伟乐聊了项目情况
- 08:55 讨论了B300项目
- 09:15 确认了交付时间`;

      const blocks = parseBlocksFromContent(content);

      expect(blocks.length).toBe(1);
      expect(blocks[0].timestamp).toBe('08:30');
      expect(blocks[0].source).toBe('Lifewiki');
      expect(blocks[0].category).toBe('工作');
      expect(blocks[0].content).toBe('和顾伟乐聊了项目情况');
      expect(blocks[0].children.length).toBe(2);
      expect(blocks[0].children[0]).toBe('讨论了B300项目');
      expect(blocks[0].children[1]).toBe('确认了交付时间');
    });

    it('should parse children with timestamps correctly', () => {
      const content = `### 10:00 [Lifewiki] #个人
写代码
- 10:30 完成了第一个模块
- 11:00 遇到了bug
- 11:30 解决了问题`;

      const blocks = parseBlocksFromContent(content);

      expect(blocks.length).toBe(1);
      expect(blocks[0].children.length).toBe(3);
      expect(blocks[0].children[0]).toBe('完成了第一个模块');
      expect(blocks[0].children[1]).toBe('遇到了bug');
      expect(blocks[0].children[2]).toBe('解决了问题');
    });

    it('should parse children without timestamps correctly', () => {
      const content = `### 14:00 [Lifewiki] #工作
下午会议
- 讨论了需求
- 分配了任务
- 设置了deadline`;

      const blocks = parseBlocksFromContent(content);

      expect(blocks.length).toBe(1);
      expect(blocks[0].children.length).toBe(3);
      expect(blocks[0].children[0]).toBe('讨论了需求');
    });

    it('should handle mixed children with and without timestamps', () => {
      const content = `### 15:00 [Lifewiki] #工作
项目收尾
- 15:30 完成了代码审查
- 提交了PR
- 16:00 收到了review反馈`;

      const blocks = parseBlocksFromContent(content);

      expect(blocks.length).toBe(1);
      expect(blocks[0].children.length).toBe(3);
      expect(blocks[0].children[0]).toBe('完成了代码审查');
      expect(blocks[0].children[1]).toBe('提交了PR');
      expect(blocks[0].children[2]).toBe('收到了review反馈');
    });

    it('should parse multiple blocks with children', () => {
      const content = `### 09:00 [Lifewiki] #工作
上午工作
- 09:30 回复了邮件
- 10:00 开了站会

### 14:00 [Lifewiki] #个人
下午休息
- 14:30 喝了咖啡
- 15:00 看了书`;

      const blocks = parseBlocksFromContent(content);

      expect(blocks.length).toBe(2);
      expect(blocks[0].children.length).toBe(2);
      expect(blocks[0].children[0]).toBe('回复了邮件');
      expect(blocks[1].children.length).toBe(2);
      expect(blocks[1].children[1]).toBe('看了书');
    });

    it('should handle block with no children', () => {
      const content = `### 08:00 [Lifewiki] #工作
简单的一条记录`;

      const blocks = parseBlocksFromContent(content);

      expect(blocks.length).toBe(1);
      expect(blocks[0].children.length).toBe(0);
    });

    it('should handle empty children lines', () => {
      const content = `### 08:00 [Lifewiki] #工作
内容
-
- 有效内容`;

      const blocks = parseBlocksFromContent(content);

      expect(blocks.length).toBe(1);
      expect(blocks[0].children.length).toBe(1);
      expect(blocks[0].children[0]).toBe('有效内容');
    });
  });

  describe('extractChildTimestamp', () => {
    it('should extract timestamp from child line', () => {
      expect(extractChildTimestamp('- 08:30 内容')).toBe('08:30');
      expect(extractChildTimestamp('- 14:55 另一个内容')).toBe('14:55');
      expect(extractChildTimestamp('- 23:59 最晚时间')).toBe('23:59');
    });

    it('should return null for child line without timestamp', () => {
      expect(extractChildTimestamp('- 没有时间戳的内容')).toBeNull();
    });

    it('should return null for malformed lines', () => {
      expect(extractChildTimestamp('08:30 错误格式')).toBeNull();
      expect(extractChildTimestamp('-内容没有空格')).toBeNull();
      expect(extractChildTimestamp('')).toBeNull();
    });
  });

  describe('hasChildTimestamp', () => {
    it('should detect child lines with timestamps', () => {
      expect(hasChildTimestamp('- 08:30 有时间戳')).toBe(true);
      expect(hasChildTimestamp('- 14:55 下午')).toBe(true);
    });

    it('should return false for child lines without timestamps', () => {
      expect(hasChildTimestamp('- 没有时间戳')).toBe(false);
      expect(hasChildTimestamp('- 纯文本内容')).toBe(false);
    });
  });

  describe('addChildToBlock', () => {
    it('should add child to block children array', () => {
      const block: ParsedBlock = {
        id: 'test-id',
        timestamp: '08:00',
        source: 'Lifewiki',
        category: '工作',
        content: '原始内容',
        children: ['第一个子块']
      };

      const updated = addChildToBlock(block, '第二个子块');

      expect(updated.children.length).toBe(2);
      expect(updated.children[0]).toBe('第一个子块');
      expect(updated.children[1]).toBe('第二个子块');
      expect(updated.content).toBe('原始内容'); // Unchanged
    });

    it('should not mutate original block', () => {
      const block: ParsedBlock = {
        id: 'test-id',
        timestamp: '08:00',
        source: 'Lifewiki',
        category: '工作',
        content: '原始内容',
        children: []
      };

      addChildToBlock(block, '新子块');

      expect(block.children.length).toBe(0); // Original unchanged
    });
  });

  describe('buildChildLine', () => {
    it('should build child line with timestamp', () => {
      const line = buildChildLine('讨论了项目', '10:30');
      expect(line).toBe('- 10:30 讨论了项目');
    });

    it('should build child line with current time when no timestamp provided', () => {
      const line = buildChildLine('新内容');
      expect(line).toMatch(/^- \d{2}:\d{2} 新内容$/);
    });
  });

  describe('findParentBlockIndex', () => {
    it('should find correct parent block by header', () => {
      const lines = [
        '# 2026-04-16',
        '> 日记是AI时代人生最大的复利',
        '',
        '## Flow of Today：',
        '',
        '### 08:30 [Lifewiki] #工作',
        '和顾伟乐聊了项目'
      ];

      const index = findParentBlockIndex(lines, '08:30', 'Lifewiki', '工作');
      expect(index).toBe(5);
    });

    it('should return -1 when parent block not found', () => {
      const lines = [
        '### 08:30 [Lifewiki] #工作',
        '内容'
      ];

      const index = findParentBlockIndex(lines, '99:99', 'Lifewiki', '工作');
      expect(index).toBe(-1);
    });
  });

  describe('findChildInsertIndex', () => {
    it('should find insert position before next block', () => {
      const lines = [
        '### 08:30 [Lifewiki] #工作',
        '父block内容',
        '- 子block1',
        '### 09:00 [Lifewiki] #工作',
        '下一个block'
      ];

      // Insert index is 3 (before ### 09:00)
      // After insert, ### 09:00 will be at index 4
      const insertIndex = findChildInsertIndex(lines, 0);
      expect(insertIndex).toBe(3);
    });

    it('should return end of file when no next block', () => {
      const lines = [
        '### 08:30 [Lifewiki] #工作',
        '父block内容',
        '- 子block1'
      ];

      const insertIndex = findChildInsertIndex(lines, 0);
      expect(insertIndex).toBe(3);
    });

    it('should skip over existing children to find insert position', () => {
      const lines = [
        '### 08:30 [Lifewiki] #工作',
        '父block内容',
        '- 08:35 子block1',
        '- 08:40 子block2',
        '### 10:00 [Lifewiki] #个人'
      ];

      // Insert index is 4 (before ### 10:00)
      // After insert, ### 10:00 will be at index 5
      const insertIndex = findChildInsertIndex(lines, 0);
      expect(insertIndex).toBe(4);
    });
  });
});
