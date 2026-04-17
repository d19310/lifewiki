/**
 * Conversation Flow
 * Manages progressive entity analysis conversation
 */

import { BlockSession, AnalysisPhase, ChatMessage, AnalysisResult, EntityPreview } from '../entities/types';
import { AIProvider } from './provider';
import { SessionManager } from './session-manager';
import { EntityManager } from '../entities/manager';
import { loadAgentConfig, AgentConfig } from './agent-config';

export interface ConversationResult {
	session: BlockSession;
	initialResponse?: string;
	userMessage?: string;
	aiResponse?: string;
	error?: string;
	// Entities discovered that need user confirmation
	entityDiscovery?: Array<{
		name: string;
		inferredType: 'person' | 'project' | 'thing' | 'idea' | 'knowledge';
		reason: string;
	}>;
	// Entities to archive (user confirmed)
	archivedEntities?: Array<{
		name: string;
		type: 'person' | 'project' | 'thing' | 'idea' | 'knowledge';
		smallType: string;  // e.g., "同事", "客户", "项目", "任务", "框架", "观点"
		context: string;
	}>;
	// Entities to update (new info discovered)
	updateEntities?: Array<{
		entityId: string;
		name: string;
		updates: Array<{
			field: string;
			value: string;
		}>;
	}>;
	// Relationships to establish
	relations?: Array<{
		from: string;
		to: string;
		relation: string;
	}>;
}

export class ConversationFlow {
	private provider: AIProvider;
	private sessionManager: SessionManager;
	private entityManager: EntityManager | null = null;
	private agentConfig: AgentConfig | null = null;
	private app: any = null;

	constructor(provider: AIProvider, app: any = null) {
		this.provider = provider;
		this.app = app;
		this.sessionManager = new SessionManager(app);
	}

	/**
	 * Initialize agent config from vault files
	 */
	async initialize(): Promise<void> {
		if (this.app) {
			this.agentConfig = await loadAgentConfig(this.app);
		}
	}

	/**
	 * Set entity manager for vault access
	 */
	setEntityManager(manager: EntityManager) {
		this.entityManager = manager;
	}

	/**
	 * Start analysis for a new block
	 */
	async startBlockAnalysis(blockId: string, content: string): Promise<ConversationResult> {
		// Create or get session
		const session = this.sessionManager.getOrCreateSession(blockId);

		// Store the diary content in session
		this.sessionManager.setContent(blockId, content);

		// Add user message (the diary content) to session
		this.sessionManager.addMessage(blockId, {
			role: 'user',
					content: content
		});

		// Get existing archived entities from vault to help AI recognize known entities
		let existingEntities: { name: string; type: string }[] = [];
		if (this.entityManager) {
			try {
				const [archivedPeople, archivedProjects, archivedThings, archivedIdeas, archivedKnowledge] = await Promise.all([
					this.entityManager.getEntitiesByType('person'),
					this.entityManager.getEntitiesByType('project'),
					this.entityManager.getEntitiesByType('thing'),
					this.entityManager.getEntitiesByType('idea'),
					this.entityManager.getEntitiesByType('knowledge')
				]);

				existingEntities = [
					...archivedPeople.map(e => ({ name: e.title, type: '人脉' })),
					...archivedProjects.map(e => ({ name: e.title, type: '项目' })),
					...archivedThings.map(e => ({ name: e.title, type: '物品' })),
					...archivedIdeas.map(e => ({ name: e.title, type: '想法' })),
					...archivedKnowledge.map(e => ({ name: e.title, type: '知识' }))
				];
				console.log('[ConversationFlow] Loaded existing entities:', existingEntities.length);
			} catch (e) {
				console.log('[ConversationFlow] Failed to get existing entities:', e);
			}
		}

		// Build system prompt with block content and existing entities
		const systemPrompt = this.buildSystemPrompt(blockId, content, existingEntities);

		// Analyze block content using chat with our system prompt
		try {
			const messages = [
				{ role: 'system' as const, content: systemPrompt },
				{ role: 'user' as const, content: content }
			];
			let response = await this.provider.chat(messages);

			// Filter out thinking content and markers
			let aiResponse = response.content
				.replace(/<think>[\s\S]*?<\/think>/gi, '')
				.replace(/<THINKING>[\s\S]*?<\/THINKING>/gi, '')
				.replace(/<思考>[\s\S]*?<\/思考>/gi, '')
				.replace(/<note>[\s\S]*?<\/note>/gi, '')
				.replace(/<备注>[\s\S]*?<\/备注>/gi, '')
				.trim();

			// Check for function calls and execute them
			const { result: processedResponse, hasFunctionCalls } = await this.executeFunctionCalls(aiResponse, blockId);

			if (hasFunctionCalls) {
				console.log('[ConversationFlow] Function calls detected in startBlockAnalysis, continuing conversation...');

				// Add the AI response with function results to messages
				this.sessionManager.addMessage(blockId, {
					role: 'assistant',
					content: processedResponse
				});

				// Continue conversation with function results injected
				const continueMessages: ChatMessage[] = [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: content },
					{ role: 'assistant', content: processedResponse },
					{ role: 'user', content: '请根据函数执行结果继续分析，用自然语言回复。' }
				];

				response = await this.provider.chat(continueMessages);

				aiResponse = response.content
					.replace(/<think>[\s\S]*?<\/think>/gi, '')
					.replace(/<THINKING>[\s\S]*?<\/THINKING>/gi, '')
					.replace(/<思考>[\s\S]*?<\/思考>/gi, '')
					.replace(/<note>[\s\S]*?<\/note>/gi, '')
					.replace(/<备注>[\s\S]*?<\/备注>/gi, '')
					.trim();
			}

			// Remove markers from display
			aiResponse = this.removeMarkersWithBracketCount(aiResponse);

			// Remove function call remnants
			aiResponse = aiResponse.replace(/\[函数执行结果: [^\]]*\]/gi, '').trim();

			// Remove markers from display but keep them for parsing
			const result: AnalysisResult = {
				blockId,
				timestamp: new Date().toISOString(),
				category: '待确认',
				entities: { people: [], projects: [], things: [], ideas: [], knowledge: [] },
				needsConfirmation: [],
				aiResponse
			};

			// Store analysis result
			this.sessionManager.setAnalysisResult(blockId, result);

			// Add AI response as message
			this.sessionManager.addMessage(blockId, {
				role: 'assistant',
				content: aiResponse
			});

			return {
				session: this.sessionManager.getSession(blockId)!,
				initialResponse: result.aiResponse
			};
		} catch (error) {
			return {
				session,
				error: `Analysis failed: ${(error as Error).message}`
			};
		}
	}

	/**
	 * Continue conversation with user message
	 */
	async continueAnalysis(blockId: string, userMessage: string): Promise<ConversationResult> {
		const session = this.sessionManager.getSession(blockId);

		if (!session) {
			return {
				session: { blockId, content: '', messages: [], analysisResult: null, createdAt: '', updatedAt: '', currentPhase: AnalysisPhase.People },
				error: 'Session not found'
			};
		}

		// Add user message
		this.sessionManager.addMessage(blockId, {
			role: 'user',
			content: userMessage
		});

		// Build system prompt with context
		const systemPrompt = this.buildContinuePrompt(blockId, session);

		// Build messages with system prompt
		const messages: ChatMessage[] = [
			{ role: 'system', content: systemPrompt },
			...session.messages.map(m => ({
				role: m.role as 'user' | 'assistant',
				content: m.content
			}))
		];

		// Get AI response
		try {
			let response = await this.provider.chat(messages);

			// Filter out thinking content
			let filteredResponse = response.content
				.replace(/<think>[\s\S]*?<\/think>/gi, '')
				.replace(/<THINKING>[\s\S]*?<\/THINKING>/gi, '')
				.replace(/<思考>[\s\S]*?<\/思考>/gi, '')
				.replace(/<note>[\s\S]*?<\/note>/gi, '')
				.replace(/<备注>[\s\S]*?<\/备注>/gi, '')
				.trim();

			console.log('[ConversationFlow] Raw response:', filteredResponse);

			// Check for function calls and execute them
			const { result: processedResponse, hasFunctionCalls } = await this.executeFunctionCalls(filteredResponse, blockId);
			if (hasFunctionCalls) {
				console.log('[ConversationFlow] Function calls detected, continuing conversation...');

				// Add the AI response with function results to messages
				this.sessionManager.addMessage(blockId, {
					role: 'assistant',
					content: processedResponse
				});

				// Continue conversation with function results injected
				const continueMessages: ChatMessage[] = [
					{ role: 'system', content: systemPrompt },
					...session.messages.map(m => ({
						role: m.role as 'user' | 'assistant',
						content: m.content
					})),
					{ role: 'assistant', content: processedResponse },
					{ role: 'user', content: '请根据函数执行结果继续分析。' }
				];

				response = await this.provider.chat(continueMessages);

				filteredResponse = response.content
					.replace(/<think>[\s\S]*?<\/think>/gi, '')
					.replace(/<THINKING>[\s\S]*?<\/THINKING>/gi, '')
					.replace(/<思考>[\s\S]*?<\/思考>/gi, '')
					.replace(/<note>[\s\S]*?<\/note>/gi, '')
					.replace(/<备注>[\s\S]*?<\/备注>/gi, '')
					.trim();

				console.log('[ConversationFlow] After function calls:', filteredResponse);
			}

			// Parse all markers
			const result: ConversationResult = {
				session: this.sessionManager.getSession(blockId)!,
				userMessage,
				aiResponse: filteredResponse
			};

			// Parse [ENTITY:...] - entity discovery
			const entityMatch = filteredResponse.match(/\[ENTITY:([\s\S]*?)\]/i);
			if (entityMatch) {
				try {
					const entityData = JSON.parse(entityMatch[1]);
					if (entityData.status === 'unknown' && entityData.entities) {
						result.entityDiscovery = entityData.entities.map((e: any) => ({
							name: e.name,
							inferredType: e.inferred_type || e.type || 'person',
							reason: e.reason || ''
						}));
					}
					console.log('[ConversationFlow] Entity discovery:', result.entityDiscovery);
				} catch (e) {
					console.error('[ConversationFlow] Failed to parse ENTITY data:', e);
				}
			}

			// Parse [ARCHIVE:...] - archive confirmed entities
			const archiveStart = filteredResponse.indexOf('[ARCHIVE:');
			if (archiveStart !== -1) {
				const jsonStart = archiveStart + '[ARCHIVE:'.length;
				// Find the closing bracket by counting braces, starting from the first {
				let braceCount = 0;
				let inString = false;
				let jsonEnd = -1;

				for (let i = jsonStart; i < filteredResponse.length; i++) {
					const char = filteredResponse[i];

					// Track string boundaries, handling escaped quotes
					if (char === '"') {
						// Check if this quote is escaped (preceded by backslash not itself escaped)
						let isEscaped = false;
						let backslashCount = 0;
						let checkIdx = i - 1;
						while (checkIdx >= jsonStart && filteredResponse[checkIdx] === '\\') {
							backslashCount++;
							checkIdx--;
						}
						// If odd number of backslashes before quote, it's escaped
						if (backslashCount % 2 === 1) {
							isEscaped = true;
						}

						if (!isEscaped) {
							inString = !inString;
						}
					}

					// Only count braces outside of strings
					if (!inString) {
						if (char === '{' || char === '[') {
							braceCount++;
						} else if (char === '}' || char === ']') {
							braceCount--;
							if (braceCount === 0) {
								jsonEnd = i + 1;
								break;
							}
						}
					}
				}

				if (jsonEnd > jsonStart) {
					try {
						const archiveStr = filteredResponse.substring(jsonStart, jsonEnd);
						const archiveData = JSON.parse(archiveStr);
						if (archiveData.entities && Array.isArray(archiveData.entities)) {
							result.archivedEntities = archiveData.entities.map((e: any) => ({
								name: e.name,
								type: e.type || 'person',
								smallType: e.small_type || 'known',
								context: e.context || ''
							}));
							console.log('[ConversationFlow] Archived entities:', result.archivedEntities);
						}
					} catch (e) {
						console.error('[ConversationFlow] Failed to parse ARCHIVE data:', e, 'raw:', filteredResponse.substring(jsonStart, jsonEnd));
					}
				}
			}

			// Parse [UPDATE:...] - update existing entities
			const updateStart = filteredResponse.indexOf('[UPDATE:');
			if (updateStart !== -1) {
				const jsonStart = updateStart + '[UPDATE:'.length;
				let braceCount = 0;
				let inString = false;
				let jsonEnd = -1;

				for (let i = jsonStart; i < filteredResponse.length; i++) {
					const char = filteredResponse[i];

					if (char === '"') {
						let isEscaped = false;
						let backslashCount = 0;
						let checkIdx = i - 1;
						while (checkIdx >= jsonStart && filteredResponse[checkIdx] === '\\') {
							backslashCount++;
							checkIdx--;
						}
						if (backslashCount % 2 === 1) {
							isEscaped = true;
						}

						if (!isEscaped) {
							inString = !inString;
						}
					}

					if (!inString) {
						if (char === '{' || char === '[') {
							braceCount++;
						} else if (char === '}' || char === ']') {
							braceCount--;
							if (braceCount === 0) {
								jsonEnd = i + 1;
								break;
							}
						}
					}
				}

				if (jsonEnd > jsonStart) {
					try {
						const updateStr = filteredResponse.substring(jsonStart, jsonEnd);
						const updateData = JSON.parse(updateStr);
						if (updateData.entity_id && updateData.updates) {
							result.updateEntities = [{
								entityId: updateData.entity_id,
								name: updateData.name || '',
								updates: updateData.updates.map((u: any) => ({
									field: u.field,
									value: u.value
								}))
							}];
							console.log('[ConversationFlow] Update entities:', result.updateEntities);
						}
					} catch (e) {
						console.error('[ConversationFlow] Failed to parse UPDATE data:', e);
					}
				}
			}

			// Parse [RELATION:...] - relationships
			const relationStart = filteredResponse.indexOf('[RELATION:');
			if (relationStart !== -1) {
				const jsonStart = relationStart + '[RELATION:'.length;
				let braceCount = 0;
				let inString = false;
				let jsonEnd = -1;

				for (let i = jsonStart; i < filteredResponse.length; i++) {
					const char = filteredResponse[i];

					if (char === '"') {
						let isEscaped = false;
						let backslashCount = 0;
						let checkIdx = i - 1;
						while (checkIdx >= jsonStart && filteredResponse[checkIdx] === '\\') {
							backslashCount++;
							checkIdx--;
						}
						if (backslashCount % 2 === 1) {
							isEscaped = true;
						}

						if (!isEscaped) {
							inString = !inString;
						}
					}

					if (!inString) {
						if (char === '{' || char === '[') {
							braceCount++;
						} else if (char === '}' || char === ']') {
							braceCount--;
							if (braceCount === 0) {
								jsonEnd = i + 1;
								break;
							}
						}
					}
				}

				if (jsonEnd > jsonStart) {
					try {
						const relationStr = filteredResponse.substring(jsonStart, jsonEnd);
						const relationData = JSON.parse(relationStr);
						result.relations = [{
							from: relationData.from,
							to: relationData.to,
							relation: relationData.relation
						}];
						console.log('[ConversationFlow] Relations:', result.relations);
					} catch (e) {
						console.error('[ConversationFlow] Failed to parse RELATION data:', e);
					}
				}
			}

			// Remove all markers from displayed response using proper bracket matching
			let displayResponse = this.removeMarkersWithBracketCount(filteredResponse);

			// Add AI response
			this.sessionManager.addMessage(blockId, {
				role: 'assistant',
				content: displayResponse
			});

			result.aiResponse = displayResponse;

			return result;
		} catch (error) {
			return {
				session,
				userMessage,
				error: `Chat failed: ${(error as Error).message}`
			};
		}
	}

	/**
	 * Get session by blockId
	 */
	getSession(blockId: string): BlockSession | undefined {
		return this.sessionManager.getSession(blockId);
	}

	/**
	 * Set active block
	 */
	setActiveBlock(blockId: string): void {
		this.sessionManager.setActiveBlock(blockId);
	}

	/**
	 * Get active session
	 */
	getActiveSession(): BlockSession | null {
		return this.sessionManager.getActiveSession();
	}

	/**
	 * Build system prompt for block analysis using agent config
	 */
	private buildSystemPrompt(blockId: string, content: string, existingEntities: { name: string; type: string }[] = []): string {
		const date = new Date().toISOString().split('T')[0];

		// Format existing entities for the prompt
		const existingEntitiesStr = existingEntities.length > 0
			? existingEntities.map(e => `- ${e.name} (${e.type})`).join('\n')
			: '无';

		// Use agent config or fallback to simple prompt
		if (this.agentConfig) {
			return `${this.agentConfig.identity}

${this.agentConfig.soul}

${this.agentConfig.skills}

${this.agentConfig.wiki}

---

## 当前会话上下文

日期: ${date}

## 已知实体（在vault中已归档）
先用 list_entities 技能检查以下实体是否在日记中被提及：
${existingEntitiesStr}

## 日记内容
${content}

## 重要：函数调用格式

当需要执行技能时，必须使用以下XML格式，不要使用markdown代码块：

正确格式：
<function_calls><invoke name="list_entities"><parameter name="entityType">person</parameter></invoke></function_calls>

错误格式（不要使用）：
\`\`\`
list_entities: {"entityType": "person"}
\`\`\`

## 关键规则：发现已归档实体时必须立即更新

当调用 search_entity 返回 {"found": true} 时，意味着该实体已在vault中归档。
你必须**立即**调用 add_interaction 来更新该实体的互动记录，格式如下：

<function_calls><invoke name="search_entity"><parameter name="name">康靖媛</parameter></invoke></function_calls>
<function_calls><invoke name="add_interaction"><parameter name="entityId">实体的id</parameter><parameter name="content">在日记中讨论了公共算力平台项目</parameter></invoke></function_calls>

不要等用户确认！发现已归档实体后立即更新互动记录。

## 重要：确认后的操作

当用户确认归档后，必须在回复末尾输出以下格式的标记（不是代码块）：
[ARCHIVE:{"entities":[{"name":"实体名称","type":"person","small_type":"同事","context":"上下文"}]}]

## 关键提醒

**不要在回复文本中伪造函数执行结果！** 不要写 "[函数执行结果: ...JSON...]" 这种文本，除非是真正调用了函数后的结果会被系统自动插入。

如果需要进行操作，必须使用真实的函数调用格式：
<function_calls><invoke name="create_entity"><parameter name="name">项目名称</parameter><parameter name="entityType">project</parameter></invoke></function_calls>

请开始分析这篇日记中的人脉实体。按照SOUL.md中规定的顺序进行分析。
首先用 list_entities 技能列出所有已归档的人脉实体，检查日记中是否提及它们。`;
		}

		// Fallback simple prompt
		return `你是一个日记分析助手。

## 日记内容
${content}

## 已知实体
${existingEntitiesStr}

请开始分析这篇日记中的人脉实体。`;
	}

	/**
	 * Build system prompt for continuing conversation using agent config
	 */
	private buildContinuePrompt(blockId: string, session: any): string {
		const content = session.content || '';
		const phase = session.currentPhase || AnalysisPhase.People;

		// Get identified entities from analysis result
		const people = session.analysisResult?.entities?.people || [];
		const projects = session.analysisResult?.entities?.projects || [];
		const things = session.analysisResult?.entities?.things || [];
		const ideas = session.analysisResult?.entities?.ideas || [];
		const knowledge = session.analysisResult?.entities?.knowledge || [];

		const phaseLabel: Record<string, string> = {
			people: '人脉',
			projects: '项目/任务',
			things: '物品',
			ideas: '想法',
			knowledge: '知识',
			complete: '完成'
		};

		// Use agent config or fallback
		if (this.agentConfig) {
			return `${this.agentConfig.identity}

${this.agentConfig.soul}

${this.agentConfig.skills}

${this.agentConfig.memory}

${this.agentConfig.wiki}

---

## 重要：函数调用格式

当需要执行技能时，必须使用以下XML格式，不要使用markdown代码块：

正确格式：
<function_calls><invoke name="list_entities"><parameter name="entityType">person</parameter></invoke></function_calls>

错误格式（不要使用）：
\`\`\`
list_entities: {"entityType": "person"}
\`\`\`

## 当前会话状态

- 日期: ${new Date().toISOString().split('T')[0]}
- 当前分析阶段：${phaseLabel[phase] || phase}
- 日记内容：${content || '未知'}

## 已识别的实体
- 人脉：${people.map((e: any) => e.name).join(', ') || '无'}
- 项目：${projects.map((e: any) => e.name).join(', ') || '无'}
- 物品：${things.map((e: any) => e.name).join(', ') || '无'}
- 想法：${ideas.map((e: any) => e.name).join(', ') || '无'}
- 知识：${knowledge.map((e: any) => e.name).join(', ') || '无'}

## 对话历史
${session.messages.map((m: any) => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`).join('\n\n')}

## 重要：确认后的操作

当用户确认归档后，必须在回复末尾输出以下格式的标记（不是代码块）：
[ARCHIVE:{"entities":[{"name":"实体名称","type":"person","small_type":"同事","context":"上下文"}]}]

## 关键提醒

**不要在回复文本中伪造函数执行结果！** 不要写 "[函数执行结果: ...JSON...]" 这种文本，除非是真正调用了函数后的结果会被系统自动插入。

如果需要进行操作，必须使用真实的函数调用格式：
<function_calls><invoke name="create_entity"><parameter name="name">项目名称</parameter><parameter name="entityType">project</parameter></invoke></function_calls>

请继续分析，按照SOUL.md中规定的对话策略进行。
`;
		}

		// Fallback simple prompt
		return `你是一个日记分析助手，正在与用户对话。

## 当前状态
- 当前分析阶段：${phaseLabel[phase] || phase}
- 日记内容：${content || '未知'}

## 对话历史
${session.messages.map((m: any) => `${m.role}: ${m.content}`).join('\n')}
`;
	}

	/**
	 * Advance to next analysis phase
	 */
	advancePhase(blockId: string): boolean {
		const session = this.sessionManager.getSession(blockId);
		if (!session) return false;

		const phases = [
			AnalysisPhase.People,
			AnalysisPhase.Projects,
			AnalysisPhase.Things,
			AnalysisPhase.Ideas,
			AnalysisPhase.Knowledge,
			AnalysisPhase.Complete
		];

		const currentIndex = phases.indexOf(session.currentPhase);
		if (currentIndex < 0 || currentIndex >= phases.length - 1) {
			return false;
		}

		return this.sessionManager.updatePhase(blockId, phases[currentIndex + 1]);
	}

	/**
	 * Remove all structured markers from response using proper bracket counting
	 * This avoids issues with regex that leave trailing characters like }] behind
	 */
	private removeMarkersWithBracketCount(response: string): string {
		const markers = ['ENTITY_DATA', 'ENTITY', 'ARCHIVE', 'UPDATE', 'RELATION', 'STATUS'];

		let result = response;

		for (const marker of markers) {
			const markerTag = `[${marker}:`;
			let startIndex = result.indexOf(markerTag);

			while (startIndex !== -1) {
				const jsonStart = startIndex + markerTag.length;
				let braceCount = 0;
				let inString = false;
				let endIndex = -1;

				// Find the matching closing bracket
				for (let i = jsonStart; i < result.length; i++) {
					const char = result[i];

					// Handle string boundaries
					if (char === '"') {
						// Check if escaped
						let isEscaped = false;
						let backslashCount = 0;
						let checkIdx = i - 1;
						while (checkIdx >= jsonStart && result[checkIdx] === '\\') {
							backslashCount++;
							checkIdx--;
						}
						if (backslashCount % 2 === 1) {
							isEscaped = true;
						}

						if (!isEscaped) {
							inString = !inString;
						}
					}

					// Count brackets outside strings
					if (!inString) {
						if (char === '{' || char === '[') {
							braceCount++;
						} else if (char === '}' || char === ']') {
							braceCount--;
							if (braceCount === 0) {
								endIndex = i + 1;
								break;
							}
						}
					}
				}

				if (endIndex > jsonStart) {
					// Remove the marker block including the closing bracket
					result = result.substring(0, startIndex) + result.substring(endIndex);
				} else {
					// Couldn't find proper end, just remove the marker tag and anything until next ]
					const nextBracket = result.indexOf(']', jsonStart);
					if (nextBracket > jsonStart) {
						result = result.substring(0, startIndex) + result.substring(nextBracket + 1);
					} else {
						// Give up on this marker
						break;
					}
				}

				// Check for another occurrence
				startIndex = result.indexOf(markerTag);
			}
		}

		return result.trim();
	}

	/**
	 * Parse and execute function calls from AI response
	 * Supports formats:
	 * 1. XML format: <function_calls><invoke name="funcName"><parameter name="key">value</parameter></invoke></function_calls>
	 * 2. Code block format: ```func_name: {"key": "value"} ```
	 * 3. Inline format: func_name: {"key": "value"}
	 */
	private async executeFunctionCalls(response: string, blockId: string): Promise<{ result: string; hasFunctionCalls: boolean }> {
		let result = response;
		const replacements: Array<{ pattern: RegExp; match: RegExpExecArray; replacement: string }> = [];

		console.log('[ConversationFlow] executeFunctionCalls received response:', response.substring(0, 500));

		// Helper to execute a single function and return its result
		const executeFunction = async (funcName: string, args: Record<string, any>): Promise<string> => {
			console.log(`[ConversationFlow] Function call: ${funcName}`, args);

			switch (funcName) {
				case 'list_entities': {
					const entityType = args.entityType as 'person' | 'project' | 'thing' | 'idea' | 'knowledge';
					if (this.entityManager) {
						const entities = await this.entityManager.getEntitiesByType(entityType);
						return JSON.stringify({
							entities: entities.map(e => ({
								id: e.id,
								name: e.title,
								type: e.type,
								summary: e.summary
							}))
						}, null, 2);
					}
					return '{"error": "EntityManager not available"}';
				}

				case 'search_entity': {
					const name = args.name;
					if (this.entityManager) {
						const entity = this.entityManager.findEntity(name);
						if (entity) {
							return JSON.stringify({
								found: true,
								entity: {
									id: entity.id,
									type: entity.type,
									name: entity.title,
									summary: entity.summary
								}
							}, null, 2);
						}
						return JSON.stringify({ found: false });
					}
					return '{"error": "EntityManager not available"}';
				}

				case 'get_entity_history': {
					const entityId = args.entityId;
					if (this.entityManager) {
						const entity = this.entityManager.getEntity(entityId);
						if (entity) {
							return JSON.stringify({
								interactions: entity.interactions
							}, null, 2);
						}
						return '{"error": "Entity not found"}';
					}
					return '{"error": "EntityManager not available"}';
				}

				case 'add_interaction': {
					if (this.entityManager && args.entityId && args.content) {
						await this.entityManager.addInteraction(args.entityId, {
							timestamp: new Date().toISOString(),
							type: 'diary_mention',
							content: args.content,
							sourceBlockId: blockId
						});
						return JSON.stringify({ success: true });
					}
					return '{"error": "Missing entityId or content"}';
				}

				case 'create_entity': {
					console.log('[ConversationFlow] create_entity called, entityManager:', !!this.entityManager, 'args:', args);
					if (this.entityManager && args.name) {
						const entity = await this.entityManager.createEntity({
							type: args.entityType || 'project',
							title: args.name,
							titleRaw: args.name,
							aliases: [],
							tags: [],
							summary: args.summary || '',
							confidence: 0.8,
							verificationStatus: 'verified',
							createdAt: new Date().toISOString(),
							createdBy: 'ai',
							lastUpdated: new Date().toISOString(),
							relatedEntities: [],
							interactions: [{
								timestamp: new Date().toISOString(),
								type: 'ai_analysis',
								content: args.summary || '从日记中归档',
								sourceBlockId: blockId
							}],
							metadata: args.metadata || { status: 'active', source: 'diary' }
						});
						console.log('[ConversationFlow] create_entity success:', entity.id, entity.filePath);
						return JSON.stringify({ success: true, entityId: entity.id, path: `${entity.type}s/${entity.title}.md` });
					}
					console.log('[ConversationFlow] create_entity failed: missing entityManager or name');
					return '{"error": "Missing name or EntityManager"}';
				}

				case 'link_entities': {
					if (this.entityManager && args.entityIdA && args.entityIdB) {
						const entityA = this.entityManager.getEntity(args.entityIdA);
						if (entityA) {
							const relations = [...(entityA.relatedEntities || [])];
							relations.push({
								entityId: args.entityIdB,
								relation: args.relation || 'related',
								context: args.context || ''
							});
							await this.entityManager.updateEntity(args.entityIdA, { relatedEntities: relations });
							return JSON.stringify({ success: true });
						}
						return '{"error": "Entity not found"}';
					}
					return '{"error": "Missing entityIdA or entityIdB"}';
				}

				default:
					return `{"error": "Unknown function: ${funcName}"}`;
			}
		};

		// Collect all matches first (to avoid issues with string replacement during iteration)
		const allMatches: Array<{ match: RegExpExecArray; funcName: string; args: Record<string, any> }> = [];

		// Pattern 1: Code block format ```func_name: {"key": "value"} ```
		const codeBlockPattern = /```(\w+):\s*(\{[^}]+\})\s*```/gi;
		let codeMatch;
		while ((codeMatch = codeBlockPattern.exec(result)) !== null) {
			try {
				const args = JSON.parse(codeMatch[2]);
				allMatches.push({ match: codeMatch, funcName: codeMatch[1], args });
			} catch (e) {
				console.error(`[ConversationFlow] Failed to parse code block args: ${codeMatch[2]}`);
			}
		}

		// Pattern 2: Inline format func_name: {"key": "value"}
		const inlinePattern = /(\w+):\s*(\{"[^"]*"\})/g;
		let inlineMatch;
		while ((inlineMatch = inlinePattern.exec(result)) !== null) {
			// Skip if this looks like a marker tag
			if (['ENTITY', 'ARCHIVE', 'UPDATE', 'RELATION', 'STATUS'].includes(inlineMatch[1])) {
				continue;
			}
			try {
				const args = JSON.parse(inlineMatch[2]);
				allMatches.push({ match: inlineMatch, funcName: inlineMatch[1], args });
			} catch (e) {
				// Skip invalid JSON
			}
		}

		// Pattern 3: XML format
		const xmlPattern = /<function_calls>\s*<invoke name="(\w+)">([^<]*(?:<(?!\/invoke)[^<]*)*)<\/invoke>\s*<\/function_calls>/gi;
		let xmlMatch;
		while ((xmlMatch = xmlPattern.exec(result)) !== null) {
			const paramPattern = /<parameter name="(\w+)">([^<]*)<\/parameter>/gi;
			const args: Record<string, any> = {};
			let paramMatch;
			while ((paramMatch = paramPattern.exec(xmlMatch[2])) !== null) {
				try {
					args[paramMatch[1]] = JSON.parse(paramMatch[2]);
				} catch {
					args[paramMatch[1]] = paramMatch[2];
				}
			}
			allMatches.push({ match: xmlMatch, funcName: xmlMatch[1], args });
		}

		// Execute all function calls asynchronously
		const hasFunctionCalls = allMatches.length > 0;
		if (hasFunctionCalls) {
			// Build a map of replacements
			const replacementPromises = allMatches.map(async ({ match, funcName, args }) => {
				const funcResult = await executeFunction(funcName, args);
				return {
					startIndex: match.index,
					endIndex: match.index + match[0].length,
					replacement: `[函数执行结果: ${funcResult}]`
				};
			});

			const replacements = await Promise.all(replacementPromises);

			// Apply replacements in reverse order to maintain indices
			replacements.sort((a, b) => b.startIndex - a.startIndex);
			for (const { startIndex, endIndex, replacement } of replacements) {
				result = result.substring(0, startIndex) + replacement + result.substring(endIndex);
			}
		}

		return { result, hasFunctionCalls };
	}
}
