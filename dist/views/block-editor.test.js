/**
 * Block Editor Core Logic Tests
 * Tests for pure functions that don't depend on Obsidian runtime
 */
/**
 * Generate a UUID v4 string for block IDs
 */
export function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
/**
 * Format a Date object as YYYY-MM-DD string
 */
export function formatDate(date) {
    return date.toISOString().split('T')[0];
}
/**
 * Parse block content string into Block array
 * Format: ### HH:mm [source] #category\ncontent\n- child items...
 */
export function parseBlocksFromContent(content) {
    const lines = content.split('\n');
    const blocks = [];
    let currentBlock = null;
    let currentContent = [];
    for (const line of lines) {
        const headerMatch = line.match(/^### (\d{2}:\d{2}) \[([^\]]+)\] (#\S+)?/);
        if (headerMatch) {
            if (currentBlock && currentContent.length > 0) {
                blocks.push({
                    id: uuid(),
                    timestamp: currentBlock.timestamp,
                    content: currentContent.join('\n').trim(),
                    parentId: null,
                    children: [],
                    category: currentBlock.category || '工作',
                    source: currentBlock.source || 'Lifewiki'
                });
            }
            currentBlock = {
                timestamp: headerMatch[1],
                source: headerMatch[2],
                category: headerMatch[3]?.replace('#', '') === '个人' ? '个人' : '工作'
            };
            currentContent = [];
        }
        else if (line.startsWith('- ') && currentBlock) {
            currentContent.push(line.substring(2));
        }
        else if (currentBlock && line.trim()) {
            currentContent.push(line);
        }
    }
    if (currentBlock && currentContent.length > 0) {
        blocks.push({
            id: uuid(),
            timestamp: currentBlock.timestamp,
            content: currentContent.join('\n').trim(),
            parentId: null,
            children: [],
            category: currentBlock.category || '工作',
            source: currentBlock.source || 'Lifewiki'
        });
    }
    return blocks;
}
/**
 * Format a Block into markdown string representation
 */
export function formatBlock(block, parentId) {
    const prefix = parentId ? '- ' : '\n### ';
    const header = parentId ? '' : `${block.timestamp} [${block.source}] #${block.category}`;
    return `\n${header}${prefix}${block.content}`;
}
/**
 * Validate that content does not exceed 250 characters
 */
export function validateContentLength(content) {
    const MAX_LENGTH = 250;
    return content.length <= MAX_LENGTH;
}
/**
 * Get character count for content
 */
export function getContentLength(content) {
    return content.length;
}
describe('Block Editor Core Logic', () => {
    describe('uuid', () => {
        it('should generate valid UUID v4 format', () => {
            const id = uuid();
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            expect(id).toMatch(uuidRegex);
        });
        it('should generate unique IDs', () => {
            const ids = new Set(Array.from({ length: 100 }, () => uuid()));
            expect(ids.size).toBe(100);
        });
    });
    describe('formatDate', () => {
        it('should format date as YYYY-MM-DD', () => {
            const date = new Date('2026-04-12T08:30:00Z');
            expect(formatDate(date)).toBe('2026-04-12');
        });
        it('should pad single digit month and day', () => {
            const date = new Date('2026-01-05T10:00:00Z');
            expect(formatDate(date)).toBe('2026-01-05');
        });
    });
    describe('parseBlocksFromContent', () => {
        it('should parse single block from content', () => {
            const content = `### 08:30 [Lifewiki] #工作
和顾伟乐聊了青岛移动B300项目的情况`;
            const blocks = parseBlocksFromContent(content);
            expect(blocks.length).toBe(1);
            expect(blocks[0].timestamp).toBe('08:30');
            expect(blocks[0].source).toBe('Lifewiki');
            expect(blocks[0].category).toBe('工作');
            expect(blocks[0].content).toBe('和顾伟乐聊了青岛移动B300项目的情况');
        });
        it('should parse multiple blocks', () => {
            const content = `### 08:30 [Lifewiki] #工作
和顾伟乐聊了项目

### 09:15 [Lifewiki] #个人
写代码到一半`;
            const blocks = parseBlocksFromContent(content);
            expect(blocks.length).toBe(2);
            expect(blocks[0].timestamp).toBe('08:30');
            expect(blocks[1].timestamp).toBe('09:15');
            expect(blocks[1].category).toBe('个人');
        });
        it('should parse block with child items', () => {
            const content = `### 08:30 [Lifewiki] #工作
和顾伟乐聊了项目
- 子Block内容1
- 子Block内容2`;
            const blocks = parseBlocksFromContent(content);
            expect(blocks.length).toBe(1);
            expect(blocks[0].content).toBe('和顾伟乐聊了项目\n子Block内容1\n子Block内容2');
        });
        it('should handle personal category', () => {
            const content = `### 14:00 [Lifewiki] #个人
下午茶时间`;
            const blocks = parseBlocksFromContent(content);
            expect(blocks.length).toBe(1);
            expect(blocks[0].category).toBe('个人');
        });
        it('should return empty array for empty content', () => {
            const blocks = parseBlocksFromContent('');
            expect(blocks.length).toBe(0);
        });
        it('should handle multiline block content', () => {
            const content = `### 10:00 [Lifewiki] #工作
第一行内容
第二行内容
第三行内容`;
            const blocks = parseBlocksFromContent(content);
            expect(blocks.length).toBe(1);
            expect(blocks[0].content).toBe('第一行内容\n第二行内容\n第三行内容');
        });
    });
    describe('formatBlock', () => {
        it('should format parent block correctly', () => {
            const block = {
                id: 'test-id',
                timestamp: '08:30',
                content: '测试内容',
                parentId: null,
                children: [],
                category: '工作',
                source: 'Lifewiki'
            };
            const formatted = formatBlock(block, null);
            expect(formatted).toContain('08:30 [Lifewiki] #工作');
            expect(formatted).toContain('测试内容');
        });
        it('should format child block correctly', () => {
            const block = {
                id: 'test-id',
                timestamp: '08:30',
                content: '子Block内容',
                parentId: 'parent-id',
                children: [],
                category: '工作',
                source: 'Lifewiki'
            };
            const formatted = formatBlock(block, 'parent-id');
            expect(formatted).toContain('- 子Block内容');
            expect(formatted).not.toContain('###');
        });
    });
    describe('input validation', () => {
        it('should validate 250 character limit', () => {
            const maxLength = 250;
            const content = 'a'.repeat(250);
            expect(content.length).toBe(maxLength);
            expect(validateContentLength(content)).toBe(true);
        });
        it('should reject content exceeding 250 characters', () => {
            const maxLength = 250;
            const content = 'a'.repeat(251);
            expect(content.length).toBeGreaterThan(maxLength);
            expect(validateContentLength(content)).toBe(false);
        });
        it('should get correct content length', () => {
            const content = 'hello world';
            expect(getContentLength(content)).toBe(11);
        });
    });
});
