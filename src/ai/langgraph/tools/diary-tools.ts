/**
 * Diary Tools for LangGraph
 * Tools for reading and summarizing diary entries
 */

import type { App } from 'obsidian';
import type { ToolExecutionResult } from '../types';

const DIARY_FOLDER = 'Daily';

export interface DiaryEntry {
	date: string;
	content: string;
}

export interface SummarizeEntriesInput {
	entries: DiaryEntry[];
	summaryType: 'daily' | 'weekly' | 'monthly';
}

/**
 * Read diary entries for a date range
 */
export async function readDiaryEntries(
	app: App,
	startDate: string,
	endDate: string,
	query?: string
): Promise<ToolExecutionResult> {
	try {
		const diaryFiles = app.vault.getMarkdownFiles()
			.filter(f => f.path.startsWith(DIARY_FOLDER + '/'));

		// Filter by date range (fileName format: YYYY-MM-DD.md)
		const filteredFiles = diaryFiles.filter(f => {
			const fileName = f.name.replace('.md', '');
			return fileName >= startDate && fileName <= endDate;
		});

		const entries: DiaryEntry[] = [];
		for (const file of filteredFiles) {
			try {
				const content = await app.vault.read(file);
				const date = file.name.replace('.md', '');

				// If query is provided, filter by content match
				if (query) {
					if (content.toLowerCase().includes(query.toLowerCase())) {
						entries.push({ date, content });
					}
				} else {
					entries.push({ date, content });
				}
			} catch {
				// Skip files that can't be read
			}
		}

		// Sort by date descending (most recent first)
		entries.sort((a, b) => b.date.localeCompare(a.date));

		return {
			success: true,
			data: {
				entries,
				total: entries.length
			}
		};
	} catch (error) {
		return { success: false, error: `Read diary entries failed: ${(error as Error).message}` };
	}
}

/**
 * Generate a formatted summary from diary entries
 * The AI will handle ignoring block IDs via prompt instructions
 */
export async function summarizeEntries(
	input: SummarizeEntriesInput
): Promise<ToolExecutionResult> {
	try {
		const { entries, summaryType } = input;

		if (entries.length === 0) {
			return {
				success: true,
				data: {
					summary: `${summaryType === 'daily' ? '今日' : summaryType === 'weekly' ? '本周' : '本月'}暂无日记记录。`
				}
			};
		}

		// Format entries for the prompt
		const formattedEntries = entries.map(e =>
			`【${e.date}】\n${e.content}`
		).join('\n\n---\n\n');

		// Build the review prompt
		const dateRangeText = entries.length === 1
			? entries[0].date
			: `${entries[entries.length - 1].date} 至 ${entries[0].date}`;

		const summary = `你现在需要分析${dateRangeText}的日记，${summaryType === 'daily' ? '是有时间线的流水账式日记' : '跨越多天'}，生成一份${summaryType === 'daily' ? '每日' : summaryType === 'weekly' ? '每周' : '每月'}复盘报告。

## 要求：

### 第一部分：今日概述
- **核心事件**（≤5条，合并同类）：
  - 每条格式：事件摘要 | 涉及人员 | 项目关联
- **工作总结**：
  - ✅ 有效投入：...（列出具体做了什么有价值的事）
  - ❌ 无效投入：...（列出低效或浪费时间的具体事项）
- 客观理性简洁，不要鸡汤，只讲事实和改进

### 第二部分：重要事项进展
- 列出当天记录的重要事项和项目进展
- 每条格式：项目名 | 进展描述 | 状态变化

---

## 输出格式：

\`\`\`
## 第一部分：今日概述
- **核心事件**（≤5条，合并同类）
  - 事件摘要 | 涉及人员 | 项目关联
  - ...

- **工作总结**
  - ✅ 有效投入：...
  - ❌ 无效投入：...

## 第二部分：重要事项进展
- 项目名 | 进展描述 | 状态变化
- ...
\`\`\`

---

## 原始日记内容：

${formattedEntries}

---
**注意**：日记内容中可能包含 block ID 格式（如 <sub>uuid</sub> 或 <!-- uuid -->），请忽略这些标记，只处理有意义的文本内容。`;

		return {
			success: true,
			data: {
				summary
			}
		};
	} catch (error) {
		return { success: false, error: `Summarize entries failed: ${(error as Error).message}` };
	}
}
