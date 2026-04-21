/**
 * read_local_document Executor
 * 读取本地文件系统中的 Markdown 文档内容
 */

import * as fs from 'fs';
import * as path from 'path';
import type { App, TFile } from 'obsidian';
import type { ToolExecutionResult } from '../../types';

export interface ReadLocalDocumentInput {
  path: string;
}

// Max file size: 100KB
const MAX_FILE_SIZE = 100 * 1024;

// Max content size to return: 20KB (prevent LLM overload)
const MAX_CONTENT_SIZE = 20 * 1024;

/**
 * Expand ~ to user home directory
 */
function expandPath(filePath: string): string {
  if (filePath.startsWith('~/')) {
    const os = require('os');
    return filePath.replace('~', os.homedir());
  }
  return filePath;
}

/**
 * Validate local file path for security
 * Prevents path traversal attacks
 */
function isValidLocalPath(filePath: string): boolean {
  // Must be absolute path
  if (!filePath.startsWith('/') && !filePath.startsWith('~/')) {
    return false;
  }
  // Prevent directory traversal
  if (filePath.includes('..')) {
    return false;
  }
  // Prevent ~ expansion in middle of path
  if (filePath.includes('~') && !filePath.startsWith('~/')) {
    return false;
  }
  return true;
}

/**
 * Parse frontmatter from markdown content
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, any>; body: string } {
  const frontmatter: Record<string, any> = {};
  let body = content;

  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (frontmatterMatch) {
    const frontmatterStr = frontmatterMatch[1];
    body = frontmatterMatch[2];

    // Parse frontmatter lines
    const lines = frontmatterStr.split('\n');
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        let value: any = line.substring(colonIndex + 1).trim();
        // Handle arrays like [tag1, tag2]
        if (value.startsWith('[') && value.endsWith(']')) {
          value = value.slice(1, -1).split(',').map((s: string) => s.trim().replace(/['"]/g, ''));
        }
        frontmatter[key] = value;
      }
    }
  }

  return { frontmatter, body };
}

/**
 * Extract title from content or frontmatter
 */
function extractTitle(body: string, frontmatter: Record<string, any>, filePath: string): string {
  // Try frontmatter title first
  if (frontmatter.title) {
    return frontmatter.title;
  }

  // Try first H1 heading
  const h1Match = body.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1];
  }

  // Fallback to filename
  const filenameMatch = filePath.match(/\/([^/]+)\.md$/);
  if (filenameMatch) {
    return filenameMatch[1];
  }

  return '';
}

export async function readLocalDocumentExecutor(
  app: App,
  input: ReadLocalDocumentInput
): Promise<ToolExecutionResult> {
  try {
    // Validate path
    if (!input.path || input.path.trim() === '') {
      return {
        success: false,
        error: 'File path is required'
      };
    }

    if (!isValidLocalPath(input.path)) {
      return {
        success: false,
        error: 'Invalid path: must be an absolute path and cannot contain ".."'
      };
    }

    // Normalize path (expand ~)
    const normalizedPath = expandPath(input.path);

    // Check if file exists
    if (!fs.existsSync(normalizedPath)) {
      return {
        success: false,
        error: `File not found: ${input.path}`
      };
    }

    // Check file extension
    if (!normalizedPath.endsWith('.md')) {
      return {
        success: false,
        error: `File is not markdown: ${input.path}`
      };
    }

    // Get file stats
    const stats = fs.statSync(normalizedPath);
    if (stats.size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `File too large: maximum size is ${MAX_FILE_SIZE / 1024}KB`
      };
    }

    // Read file content
    let content = fs.readFileSync(normalizedPath, 'utf-8');

    // Parse frontmatter and body
    const { frontmatter, body } = parseFrontmatter(content);

    // Extract title
    const title = extractTitle(body, frontmatter, input.path);

    // Truncate content if needed
    let truncatedContent = body.trim();
    let wasTruncated = false;
    if (truncatedContent.length > MAX_CONTENT_SIZE) {
      truncatedContent = truncatedContent.substring(0, MAX_CONTENT_SIZE);
      truncatedContent += '\n\n[内容已截断，原文档过长]';
      wasTruncated = true;
    }

    return {
      success: true,
      data: {
        success: true,
        path: input.path,
        title,
        content: truncatedContent,
        frontmatter,
        extractedAt: new Date().toISOString(),
        originalLength: body.trim().length,
        wasTruncated
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to read file: ${(error as Error).message}`
    };
  }
}
