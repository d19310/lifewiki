/**
 * Simple State Machine for Block Analysis
 * A lightweight replacement for LangGraph, designed for Obsidian plugin environment
 *
 * Architecture:
 * - State: manages current analysis state per block
 * - Nodes: LLM call, Tool execution
 * - Checkpointing: in-memory with optional persistence
 */

import { AIMessage, ToolMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';
import type { AIProviderAdapter } from './adapter';
import type { EntityTools } from './tools/entity-tools';
import { summarizeEntries } from './tools/diary-tools';
import type { WebClipperTools } from './tools/web-clipper-tools';
import { AnalysisPhase as Phase } from '../../entities/types';

// Tool definitions
const TOOLS = [
	{
		name: 'search_entity',
		description: 'Search for an existing entity by name in the vault',
		parameters: {
			type: 'object',
			properties: {
				name: { type: 'string', description: 'Entity name to search for' }
			},
			required: ['name']
		}
	},
	{
		name: 'create_entity',
		description: 'Create a new entity in the vault',
		parameters: {
			type: 'object',
			properties: {
				entityType: {
					type: 'string',
					enum: ['person', 'project', 'thing', 'idea', 'knowledge'],
					description: 'Type of entity'
				},
				name: { type: 'string', description: 'Entity name' },
				summary: { type: 'string', description: 'One-line summary' },
				metadata: { type: 'object', description: 'Additional metadata' }
			},
			required: ['entityType', 'name']
		}
	},
	{
		name: 'update_entity',
		description: 'Update an existing entity',
		parameters: {
			type: 'object',
			properties: {
				entityId: { type: 'string', description: 'Entity ID to update' },
				updates: { type: 'object', description: 'Fields to update' }
			},
			required: ['entityId', 'updates']
		}
	},
	{
		name: 'add_interaction',
		description: 'Add an interaction record to an entity',
		parameters: {
			type: 'object',
			properties: {
				entityId: { type: 'string', description: 'Entity ID' },
				content: { type: 'string', description: 'Interaction content' },
				sourceBlockId: { type: 'string', description: 'Source block ID' }
			},
			required: ['entityId', 'content']
		}
	},
	{
		name: 'link_entities',
		description: 'Create a relationship between two entities',
		parameters: {
			type: 'object',
			properties: {
				entityIdA: { type: 'string', description: 'First entity ID' },
				entityIdB: { type: 'string', description: 'Second entity ID' },
				relation: { type: 'string', description: 'Relationship type' },
				context: { type: 'string', description: 'Relationship context' }
			},
			required: ['entityIdA', 'entityIdB', 'relation']
		}
	},
	{
		name: 'list_entities',
		description: 'List all entities of a specific type',
		parameters: {
			type: 'object',
			properties: {
				entityType: {
					type: 'string',
					enum: ['person', 'project', 'thing', 'idea', 'knowledge'],
					description: 'Entity type'
				},
				status: {
					type: 'string',
					enum: ['active', 'all'],
					description: 'Filter by status'
				}
			},
			required: ['entityType']
		}
	},
	{
		name: 'get_entity_history',
		description: 'Get interaction history for an entity',
		parameters: {
			type: 'object',
			properties: {
				entityId: { type: 'string', description: 'Entity ID' }
			},
			required: ['entityId']
		}
	},
	{
		name: 'get_diary_entries',
		description: 'Get diary entries within a date range. Used for chat mode when user asks about diary content or wants summarization/reflection. Returns entries sorted by date (most recent first).',
		parameters: {
			type: 'object',
			properties: {
				startDate: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
				endDate: { type: 'string', description: 'End date in YYYY-MM-DD format' },
				query: { type: 'string', description: 'Optional search query to filter entries by content' }
			},
			required: ['startDate', 'endDate']
		}
	},
	{
		name: 'summarize_entries',
		description: 'Generate a formatted daily/weekly/monthly review from diary entries. Takes the output of read_diary_entries and produces a structured summary.',
		parameters: {
			type: 'object',
			properties: {
				entries: {
					type: 'array',
					description: 'Array of diary entries with date and content',
					items: {
						type: 'object',
						properties: {
							date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
							content: { type: 'string', description: 'Diary content' }
						}
					}
				},
				summaryType: {
					type: 'string',
					enum: ['daily', 'weekly', 'monthly'],
					description: 'Type of summary to generate'
				}
			},
			required: ['entries', 'summaryType']
		}
	},
	{
		name: 'clip_webpage',
		description: 'Clip a webpage and convert to Markdown. Supports generic websites and WeChat articles. Returns title, content, author, and site name.',
		parameters: {
			type: 'object',
			properties: {
				url: { type: 'string', description: 'URL of the webpage to clip' }
			},
			required: ['url']
		}
	},
	{
		name: 'summarize_content',
		description: 'Summarize Markdown content using AI. Returns a concise summary (100-200 characters).',
		parameters: {
			type: 'object',
			properties: {
				content: { type: 'string', description: 'Markdown content to summarize' },
				title: { type: 'string', description: 'Optional title of the content' },
				url: { type: 'string', description: 'Optional source URL' },
				author: { type: 'string', description: 'Optional author name' }
			},
			required: ['content']
		}
	},
	{
		name: 'clip_and_summarize',
		description: 'Clip a webpage and summarize its content in one step. This is more efficient than calling clip_webpage and summarize_content separately.',
		parameters: {
			type: 'object',
			properties: {
				url: { type: 'string', description: 'URL of the webpage to clip and summarize' }
			},
			required: ['url']
		}
	},
	{
		name: 'search_vault',
		description: 'Search vault documents by content query. Used in chat mode for full-text search across all vault documents.',
		parameters: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Search query to find in vault documents' }
			},
			required: ['query']
		}
	},
	{
		name: 'read_document',
		description: 'Read a document by path. Used in chat mode to read full content of a specific document.',
		parameters: {
			type: 'object',
			properties: {
				path: { type: 'string', description: 'Path to the document to read' }
			},
			required: ['path']
		}
	},
	{
		name: 'read_local_document',
		description: 'Read a local Markdown file from the filesystem. Used when user provides an absolute path like /Users/xxx/Documents/xxx.md or path starting with ~.',
		parameters: {
			type: 'object',
			properties: {
				path: { type: 'string', description: 'Local file path to the Markdown document (must be absolute path starting with / or ~)' }
			},
			required: ['path']
		}
	},
	{
		name: 'summarize_document',
		description: 'Summarize and extract key information from a Markdown document. Used after archiving a document to generate AI summary.',
		parameters: {
			type: 'object',
			properties: {
				content: { type: 'string', description: 'Document content to summarize' },
				entityType: { type: 'string', enum: ['person', 'project', 'thing', 'idea', 'knowledge'], description: 'Entity type for context-aware summarization' },
				title: { type: 'string', description: 'Document title for additional context' }
			},
			required: ['content', 'entityType']
		}
	},
	{
		name: 'get_related_entities',
		description: 'Get related entities for an entity. Used in chat mode to explore entity relationships.',
		parameters: {
			type: 'object',
			properties: {
				entityId: { type: 'string', description: 'Entity ID to get related entities for' }
			},
			required: ['entityId']
		}
	}
];

// Phase order
const PHASES = [
	Phase.People,
	Phase.Projects,
	Phase.Things,
	Phase.Ideas,
	Phase.Knowledge,
	Phase.Complete
];

export interface AnalysisState {
	blockId: string;
	blockContent: string;
	messages: BaseMessage[];
	currentPhase: AnalysisPhase;
	entities: {
		people: any[];
		projects: any[];
		things: any[];
		ideas: any[];
		knowledge: any[];
	};
	pendingConfirmations: any[];
	confirmedEntities: any[];
	updateEntities: any[];
	relations: any[];
	aiResponse: string;
	error: string | null;
}

/**
 * Create initial state for a new analysis
 */
export function createInitialState(blockId: string, content: string): AnalysisState {
	return {
		blockId,
		blockContent: content,
		messages: [new HumanMessage({ content })],
		currentPhase: Phase.People,
		entities: {
			people: [],
			projects: [],
			things: [],
			ideas: [],
			knowledge: []
		},
		pendingConfirmations: [],
		confirmedEntities: [],
		updateEntities: [],
		relations: [],
		aiResponse: '',
		error: null
	};
}

/**
 * Simple state machine for block analysis
 */
export class BlockAnalysisMachine {
	private state: AnalysisState;
	private llm: AIProviderAdapter;
	private tools: EntityTools;
	private webClipperTools?: WebClipperTools;
	private systemPrompt: string;
	private recentFunctionCalls: Array<{ name: string; args: string }> = [];
	private isChatMode: boolean = false;

	constructor(
		state: AnalysisState,
		llm: AIProviderAdapter,
		tools: EntityTools,
		systemPrompt: string,
		webClipperTools?: WebClipperTools,
		isChatMode: boolean = false
	) {
		this.state = state;
		this.llm = llm;
		this.tools = tools;
		this.systemPrompt = systemPrompt;
		this.webClipperTools = webClipperTools;
		this.isChatMode = isChatMode;
	}

	/**
	 * Get current state
	 */
	getState(): AnalysisState {
		return this.state;
	}

	/**
	 * Get current phase
	 */
	getCurrentPhase(): AnalysisPhase {
		return this.state.currentPhase;
	}

	/**
	 * Advance to next phase
	 */
	advancePhase(): boolean {
		const currentIndex = PHASES.indexOf(this.state.currentPhase);
		if (currentIndex < 0 || currentIndex >= PHASES.length - 1) {
			return false;
		}
		this.state.currentPhase = PHASES[currentIndex + 1];
		return true;
	}

	/**
	 * Build context message for continued analysis
	 */
	private buildContinueContext(): string {
		const phase = this.state.currentPhase;
		const phaseLabel: Record<string, string> = {
			people: '人脉（People）',
			projects: '项目（Projects）',
			things: '物品（Things）',
			ideas: '想法（Ideas）',
			knowledge: '知识（Knowledge）',
			complete: '完成（Complete）'
		};

		const entities = this.state.entities;
		const identifiedEntities = [];
		if (entities.people.length > 0) identifiedEntities.push(`人脉：${entities.people.map((e: any) => e.name || e.title || '未知').join(', ')}`);
		if (entities.projects.length > 0) identifiedEntities.push(`项目：${entities.projects.map((e: any) => e.name || e.title || '未知').join(', ')}`);
		if (entities.things.length > 0) identifiedEntities.push(`物品：${entities.things.map((e: any) => e.name || e.title || '未知').join(', ')}`);
		if (entities.ideas.length > 0) identifiedEntities.push(`想法：${entities.ideas.map((e: any) => e.name || e.title || '未知').join(', ')}`);
		if (entities.knowledge.length > 0) identifiedEntities.push(`知识：${entities.knowledge.map((e: any) => e.name || e.title || '未知').join(', ')}`);

		return `【继续分析上下文】

当前阶段：${phaseLabel[phase] || phase}
日记内容：${this.state.blockContent.substring(0, 200)}${this.state.blockContent.length > 200 ? '...' : ''}

已识别的实体：
${identifiedEntities.length > 0 ? identifiedEntities.join('\n') : '暂无'}

对话历史（最近几条）：
${this.state.messages.slice(-4).map((m: any) => {
			const role = m._getType?.() === 'ai' ? 'AI' : m._getType?.() === 'human' ? '用户' : '系统';
			const content = typeof m.content === 'string' ? m.content.substring(0, 100) : JSON.stringify(m.content).substring(0, 100);
			return `${role}：${content}`;
		}).join('\n')}

## 重要提醒

1. 当前处于 ${phaseLabel[phase] || phase} 阶段，请继续该阶段的分析
2. 如果需要创建实体，必须使用函数调用格式：
<function_calls><invoke name="create_entity"><parameter name="name">实体名称</parameter><parameter name="entityType">project</parameter><parameter name="summary">简短描述</parameter></invoke></function_calls>
3. 如果需要更新已存在的实体，先搜索再添加互动记录
4. 不要重复创建已存在的实体

请继续分析，用户可能会提供更多信息或确认。`;
	}

	/**
	 * Add user message and continue
	 */
	async sendUserMessage(message: string): Promise<AnalysisState> {
		// Inject continue context only for analysis mode, not chat mode
		if (!this.isChatMode) {
			const continueContext = this.buildContinueContext();
			this.state.messages.push(new HumanMessage({ content: continueContext }));
		}
		this.state.messages.push(new HumanMessage({ content: message }));
		return this.runCycle();
	}

	/**
	 * Run one cycle of the state machine
	 * Returns the updated state
	 */
	async runCycle(maxIterations: number = 5): Promise<AnalysisState> {
		try {
			// Step 1: Call LLM with tools
			const response = await this.callLLM();
			console.log('[BlockAnalysis] LLM response type:', response._getType());
			console.log('[BlockAnalysis] LLM response content:', typeof response.content === 'string' ? response.content.substring(0, 200) : JSON.stringify(response.content).substring(0, 200));

			// Step 2: Check for tool calls (both structured and text-based)
			const toolCalls = (response as any).tool_calls;
			const textContent = this.extractText(response);
			console.log('[BlockAnalysis] textContent after extract:', textContent.substring(0, 100));

			// Try structured tool calls first (OpenAI/Claude format)
			if (toolCalls && toolCalls.length > 0) {
				console.log('[BlockAnalysis] Found structured tool_calls:', toolCalls.length);
				this.state.messages.push(response);
				await this.executeTools(toolCalls);
				if (maxIterations > 0) {
					return this.runCycle(maxIterations - 1);
				}
				console.log('[BlockAnalysis] Max iterations reached, returning current response');
				this.state.aiResponse = textContent;
				return this.state;
			}

			// Try text-based function calls (MiniMax/other LLM format)
			const textBasedCalls = this.parseTextFunctionCalls(textContent);
			console.log('[BlockAnalysis] textBasedCalls count:', textBasedCalls.length);
			if (textBasedCalls.length > 0) {
				// Check for loops: same function called 3+ times
				const callKey = JSON.stringify(textBasedCalls[0]);
				this.recentFunctionCalls.push(callKey);
				if (this.recentFunctionCalls.filter(c => c === callKey).length >= 3) {
					console.log('[BlockAnalysis] Loop detected! Same function called 3+ times');
					// Force a text response by clearing the function call content
					const forcedResponse = '抱歉，我似乎卡在同一个地方了。请您直接告诉我后续的指示。';
					this.state.aiResponse = forcedResponse;
					this.state.messages.push(new AIMessage({ content: forcedResponse }));
					this.recentFunctionCalls = [];
					return this.state;
				}

				console.log('[BlockAnalysis] Found text-based function calls:', textBasedCalls.length);
				// Add the AI's function call message to conversation
				this.state.messages.push(new AIMessage({ content: textContent }));
				// Execute the parsed function calls (adds ToolMessages internally)
				await this.executeTextBasedCalls(textBasedCalls);
				// Continue to get AI's response to tool results
				if (maxIterations > 0) {
					return this.runCycle(maxIterations - 1);
				}
				console.log('[BlockAnalysis] Max iterations reached');
				return this.state;
			}

			// No tool calls - sanitize response to remove false action claims
			console.log('[BlockAnalysis] No function calls found, final response');
			const sanitizedText = this.sanitizeResponse(textContent);
			this.state.aiResponse = sanitizedText;
			this.state.messages.push(new AIMessage({ content: sanitizedText }));
			return this.state;
		} catch (error) {
			this.state.error = `Analysis failed: ${(error as Error).message}`;
			console.error('[BlockAnalysis] Error in runCycle:', error);
			return this.state;
		}
	}

	/**
	 * Parse function calls from text content (for LLMs that don't support structured tool_calls)
	 */
	private parseTextFunctionCalls(text: string): Array<{ name: string; args: Record<string, any> }> {
		const calls: Array<{ name: string; args: Record<string, any> }> = [];

		// Pattern: XML format <function_calls><invoke name="funcName">...
		const xmlPattern = /<function_calls>\s*<invoke name="(\w+)">([^<]*(?:<(?!\/invoke)[^<]*)*)<\/invoke>\s*<\/function_calls>/gi;
		let match;
		while ((match = xmlPattern.exec(text)) !== null) {
			const funcName = match[1];
			const argsStr = match[2];
			const args: Record<string, any> = {};
			const paramPattern = /<parameter name="(\w+)">([^<]*)<\/parameter>/gi;
			let paramMatch;
			while ((paramMatch = paramPattern.exec(argsStr)) !== null) {
				try {
					args[paramMatch[1]] = JSON.parse(paramMatch[2]);
				} catch {
					args[paramMatch[1]] = paramMatch[2];
				}
			}
			calls.push({ name: funcName, args });
		}

		// Fallback: Try to detect natural language intent for get_diary_entries
		// Some models say "call get_diary_entries" without outputting proper XML
		if (calls.length === 0) {
			const nlPattern = /(?:call|calls|calling|使用|调用)\s+(?:get_diary_entries|日记)/i;
			if (nlPattern.test(text)) {
				// Try to extract date from context - look for "今天" or date patterns
				const today = new Date().toISOString().split('T')[0];
				const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

				// Check if text mentions "今天" (today)
				if (/今天|今日|current date/i.test(text)) {
					calls.push({ name: 'get_diary_entries', args: { startDate: today, endDate: today } });
				} else if (/昨天|yesterday/i.test(text)) {
					calls.push({ name: 'get_diary_entries', args: { startDate: yesterday, endDate: yesterday } });
				} else {
					// Default to today
					calls.push({ name: 'get_diary_entries', args: { startDate: today, endDate: today } });
				}
				console.log('[BlockAnalysis] Detected natural language intent, created fallback call:', calls[calls.length - 1]);
			}
		}

		return calls;
	}

	/**
	 * Execute text-based function calls
	 */
	private async executeTextBasedCalls(calls: Array<{ name: string; args: Record<string, any> }>): Promise<void> {
		for (const call of calls) {
			console.log(`[BlockAnalysis] Executing text-based call: ${call.name}`, call.args);
			let result: any;

			// Map to tool executor methods
			switch (call.name) {
				case 'list_entities':
					result = await this.tools.listEntities(call.args);
					break;
				case 'create_entity':
					result = await this.tools.createEntity(call.args);
					break;
				case 'update_entity':
					result = await this.tools.updateEntity(call.args);
					break;
				case 'add_interaction':
					result = await this.tools.addInteraction(call.args);
					break;
				case 'search_entity':
					result = await this.tools.searchEntity(call.args);
					break;
				case 'link_entities':
					result = await this.tools.linkEntities(call.args);
					break;
				case 'get_entity_history':
					result = await this.tools.getEntityHistory(call.args);
					break;
				case 'get_diary_entries':
					result = await this.tools.getDiaryEntries(call.args);
					break;
				case 'summarize_entries':
					result = await summarizeEntries(call.args);
					break;
				case 'clip_webpage':
					result = this.webClipperTools
						? await this.webClipperTools.clipWebpageTool(call.args)
						: { success: false, error: 'Web clipper not available' };
					break;
				case 'summarize_content':
					result = this.webClipperTools
						? await this.webClipperTools.summarizeContentTool(call.args)
						: { success: false, error: 'Web clipper not available' };
					break;
				case 'clip_and_summarize':
					result = this.webClipperTools
						? await this.webClipperTools.clipAndSummarize(call.args)
						: { success: false, error: 'Web clipper not available' };
					break;
				case 'search_vault':
					result = await this.tools.searchVault(call.args);
					break;
				case 'read_document':
					result = await this.tools.readDocument(call.args);
					break;
				case 'read_local_document':
					result = await this.tools.readLocalDocument(call.args);
					break;
				case 'summarize_document':
					result = await this.tools.summarizeDocument(call.args);
					break;
				case 'get_related_entities':
					result = await this.tools.getRelatedEntitiesFromVault(call.args);
					break;
				default:
					result = { success: false, error: `Unknown tool: ${call.name}` };
			}

			// Add tool result as ToolMessage so AI sees the response
			console.log(`[BlockAnalysis] Tool result for ${call.name}:`, JSON.stringify(result).substring(0, 300));
			this.state.messages.push(
				new ToolMessage({
					content: JSON.stringify(result),
					tool_call_id: `call_${call.name}`
				})
			);
		}
	}

	/**
	 * Call LLM with tools bound
	 */
	private async callLLM(): Promise<BaseMessage> {
		// Build messages: system prompt + all conversation messages
		const allMessages: BaseMessage[] = [
			new HumanMessage({ content: this.systemPrompt }),
			...this.state.messages
		];

		console.log('[BlockAnalysis] callLLM with', allMessages.length, 'messages');
		for (let i = 0; i < allMessages.length; i++) {
			const msg = allMessages[i];
			const content = typeof msg.content === 'string' ? msg.content.substring(0, 80) : JSON.stringify(msg.content).substring(0, 80);
			console.log(`[BlockAnalysis]   msg[${i}]: ${msg._getType()} - ${content}`);
		}

		// Invoke LLM - tools are parsed from text response since
		// not all providers support structured tool_calls
		const result = await this.llm.invoke(allMessages);
		return result;
	}

	/**
	 * Execute tool calls
	 */
	private async executeTools(toolCalls: any[]): Promise<void> {
		for (const call of toolCalls) {
			const { name, arguments: args } = call;
			let result: any;

			console.log(`[BlockAnalysis] Executing tool: ${name}`, args);

			switch (name) {
				case 'search_entity':
					result = await this.tools.searchEntity(args);
					break;
				case 'create_entity':
					result = await this.tools.createEntity(args);
					break;
				case 'update_entity':
					result = await this.tools.updateEntity(args);
					break;
				case 'add_interaction':
					result = await this.tools.addInteraction(args);
					break;
				case 'link_entities':
					result = await this.tools.linkEntities(args);
					break;
				case 'list_entities':
					result = await this.tools.listEntities(args);
					break;
				case 'get_entity_history':
					result = await this.tools.getEntityHistory(args);
					break;
				case 'get_diary_entries':
					result = await this.tools.getDiaryEntries(args);
					break;
				case 'summarize_entries':
					result = await summarizeEntries(args);
					break;
				case 'clip_webpage':
					result = this.webClipperTools
						? await this.webClipperTools.clipWebpageTool(args)
						: { success: false, error: 'Web clipper not available' };
					break;
				case 'summarize_content':
					result = this.webClipperTools
						? await this.webClipperTools.summarizeContentTool(args)
						: { success: false, error: 'Web clipper not available' };
					break;
				case 'clip_and_summarize':
					result = this.webClipperTools
						? await this.webClipperTools.clipAndSummarize(args)
						: { success: false, error: 'Web clipper not available' };
					break;
				case 'search_vault':
					result = await this.tools.searchVault(args);
					break;
				case 'read_document':
					result = await this.tools.readDocument(args);
					break;
				case 'read_local_document':
					result = await this.tools.readLocalDocument(args);
					break;
				case 'summarize_document':
					result = await this.tools.summarizeDocument(args);
					break;
				case 'get_related_entities':
					result = await this.tools.getRelatedEntitiesFromVault(args);
					break;
				default:
					result = { success: false, error: `Unknown tool: ${name}` };
			}

			console.log(`[BlockAnalysis] Tool result:`, result);

			// Add tool result as message
			this.state.messages.push(
				new ToolMessage({
					content: JSON.stringify(result),
					tool_call_id: call.id || `call_${name}`
				})
			);
		}
	}

	/**
	 * Extract final response from Qwen-style thinking process
	 * Qwen models output thinking as numbered steps, followed by the actual response
	 * Pattern: "Final Output Generation. (Just the text).\n Actual response"
	 */
	private extractFinalResponse(text: string): string {
		// Check if this is a thinking process format
		if (!text.includes('Thinking Process:')) {
			return text;
		}

		console.log('[BlockAnalysis] Detected thinking process format, extracting final response');

		// Strategy: Find the last substantial Chinese text block which is usually the actual response
		// Split by lines and find Chinese content that comes after analysis steps

		// First, completely remove the Thinking Process header and all numbered steps
		// This regex removes everything up to and including "Final Output Generation" or "Final Output:"
		let cleaned = text;

		// Remove "Thinking Process:" header
		cleaned = cleaned.replace(/^Thinking Process:\s*/gim, '');

		// Remove numbered analysis steps (1. **Analyze...**, 2. **Check...**, etc.)
		cleaned = cleaned.replace(/^\d+\.\s+\*\*[^*]+\*\*[:：]?\s*/gm, '');

		// Remove numbered steps without bold (1. Analyze..., 2. Check..., etc.)
		cleaned = cleaned.replace(/^\d+\.\s+[A-Z][^:\n]*[:：]?\s*/gm, '');

		// Remove bullet points in thinking (* Analyze..., * Check..., etc.)
		cleaned = cleaned.replace(/^\s*[*\-]\s+/gm, '');

		// Remove "Final Output Generation" and similar markers
		cleaned = cleaned.replace(/Final Output Generation\.?\s*/gi, '');
		cleaned = cleaned.replace(/Final Output:\s*/gi, '');
		cleaned = cleaned.replace(/最终输出|Final Output/gi, '');

		// Remove "(Just the text)" and similar meta comments
		cleaned = cleaned.replace(/\(Just the text\)\.?\s*/g, '');
		cleaned = cleaned.replace(/\(只需文本\)\.?\s*/g, '');

		// Remove any remaining markdown bold markers used for labels
		cleaned = cleaned.replace(/\*\*([^*]+)\*\*[:：]?\s*/g, '');

		// Now find the actual Chinese response
		const chineseLines: string[] = [];
		for (const line of cleaned.split('\n')) {
			const trimmed = line.trim();
			// Keep lines that contain substantial Chinese text
			if (trimmed.length > 5 && /[\u4e00-\u9fa5]/.test(trimmed)) {
				chineseLines.push(trimmed);
			}
		}

		if (chineseLines.length > 0) {
			// Return the last substantial Chinese line (usually the final response)
			const response = chineseLines[chineseLines.length - 1].trim();
			console.log('[BlockAnalysis] Extracted Chinese response:', response.substring(0, 100));
			return response;
		}

		// Fallback: return cleaned text if no Chinese found
		const finalCleaned = cleaned.replace(/\s+/g, ' ').trim();
		console.log('[BlockAnalysis] Fallback cleaned response:', finalCleaned.substring(0, 100));
		return finalCleaned || text;
	}

	/**
	 * Remove false action claims from response when no tools were called.
	 * AI sometimes claims "已更新"、"已创建" etc. without actually calling tools.
	 */
	private sanitizeResponse(text: string): string {
		// Patterns that indicate the AI is claiming to have performed an action
		const falseActionPatterns = [
			/已更新[^。]*档案?/gi,
			/已创建[^。]*档案?/gi,
			/已归档[^。]*档案?/gi,
			/已将[^。]*更新/gi,
			/已把[^。]*加入/gi,
			/已添加[^。]*档案/gi,
			/已经记录/gi,
			/已经写入/gi,
		];

		let result = text;
		for (const pattern of falseActionPatterns) {
			result = result.replace(pattern, '');
		}

		// Clean up any resulting empty lines or orphaned punctuation
		result = result
			.replace(/\n{3,}/g, '\n\n')  // Max 2 consecutive newlines
			.trim();

		// If response is now empty, return a neutral fallback
		if (!result || result.length < 5) {
			return '好的，我了解了。';
		}

		return result;
	}

	/**
	 * Extract text from LLM response
	 */
	private extractText(response: BaseMessage): string {
		let text: string;

		if (typeof response.content === 'string') {
			text = response.content;
		} else if (Array.isArray(response.content)) {
			text = response.content
				.filter(c => c.type === 'text')
				.map(c => (c as any).text)
				.join('\n');
		} else {
			text = '';
		}

		console.log('[BlockAnalysis] extractText raw:', text.substring(0, 500));

		// Remove Qwen/Tongyi style thinking process (plain text format)
		text = this.extractFinalResponse(text);
		console.log('[BlockAnalysis] after extractFinalResponse:', text.substring(0, 200));

		// Try to extract function calls from inside thinking tags before stripping
		// Some models put tool calls inside thinking
		const thinkingPattern = /<thinking>[\s\S]*?<\/thinking>/gi;
		const matches = text.match(thinkingPattern);
		let extractedCalls = '';
		if (matches) {
			for (const match of matches) {
				// Extract any <invoke> tags from within thinking
				const invokeMatches = match.match(/<invoke[^>]*>[\s\S]*?<\/invoke>/gi);
				if (invokeMatches) {
					extractedCalls += invokeMatches.join('\n');
				}
			}
			console.log('[BlockAnalysis] Extracted calls from thinking:', extractedCalls.substring(0, 200));
		}

		// Completely remove all thinking tags and their contents
		text = text
			.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
			.replace(/<THINKING>[\s\S]*?<\/THINKING>/gi, '')
			.replace(/<思考>[\s\S]*?<\/思考>/gi, '')
			.replace(/<note>[\s\S]*?<\/note>/gi, '')
			.replace(/<备注>[\s\S]*?<\/备注>/gi, '')
			// XML format: <thinking>...</thinking> or <Thinking>...</Thinking>
			.replace(/<[Tt]hinking>[\s\S]*?<\/[Tt]hinking>/gi, '')
			// XML format: <think>...</ thinkers> or </think> variants
			.replace(/<[Tt]hink>[\s\S]*?<\/[Tt]hink>/gi, '')
			.replace(/<think>[\s\S]*?\/think>/gi, '')
			// Fallback: remove any standalone thinking tags that might slip through
			.replace(/<\/?[Tt]hink>/g, '')
			.replace(/\/think>/gi, '')
			.replace(/<\/?[Tt]hinking>/g, '')
			.trim();

		// Normalize whitespace
		text = text.replace(/\s+/g, ' ').trim();

		// Prepend any extracted calls from thinking
		if (extractedCalls) {
			text = extractedCalls + '\n' + text;
		}

		return text;
	}
}

/**
 * Build the analysis machine for a block
 */
export function buildAnalysisMachine(
	llm: AIProviderAdapter,
	tools: EntityTools,
	systemPrompt: string,
	blockId: string,
	content: string,
	webClipperTools?: WebClipperTools
): BlockAnalysisMachine {
	const initialState = createInitialState(blockId, content);
	return new BlockAnalysisMachine(initialState, llm, tools, systemPrompt, webClipperTools);
}
