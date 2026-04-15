/**
 * Conversation Flow
 * Manages progressive entity analysis conversation
 */

import { BlockSession, AnalysisPhase, ChatMessage, AnalysisResult, EntityPreview } from '../entities/types';
import { AIProvider } from './provider';
import { SessionManager } from './session-manager';

export interface ConversationResult {
	session: BlockSession;
	initialResponse?: string;
	userMessage?: string;
	aiResponse?: string;
	error?: string;
}

export class ConversationFlow {
	private provider: AIProvider;
	private sessionManager: SessionManager;

	constructor(provider: AIProvider) {
		this.provider = provider;
		this.sessionManager = new SessionManager();
	}

	/**
	 * Start analysis for a new block
	 */
	async startBlockAnalysis(blockId: string, content: string): Promise<ConversationResult> {
		// Create or get session
		const session = this.sessionManager.getOrCreateSession(blockId);

		// Build system prompt with block content
		const systemPrompt = this.buildSystemPrompt(blockId, content);

		// Analyze block content
		try {
			const result = await this.provider.analyzeBlock({
				id: blockId,
				content,
				timestamp: new Date().toISOString(),
				category: '待确认',
				source: 'Lifewiki'
			} as any);

			// Store analysis result
			this.sessionManager.setAnalysisResult(blockId, result);

			// Add AI response as message
			this.sessionManager.addMessage(blockId, {
				role: 'assistant',
				content: result.aiResponse
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
				session: { blockId, messages: [], analysisResult: null, createdAt: '', updatedAt: '', currentPhase: AnalysisPhase.People },
				error: 'Session not found'
			};
		}

		// Add user message
		this.sessionManager.addMessage(blockId, {
			role: 'user',
			content: userMessage
		});

		// Build conversation context
		const messages: ChatMessage[] = session.messages.map(m => ({
			role: m.role,
			content: m.content
		}));

		// Get AI response
		try {
			const response = await this.provider.chat(messages);

			// Add AI response
			this.sessionManager.addMessage(blockId, {
				role: 'assistant',
				content: response.content
			});

			return {
				session: this.sessionManager.getSession(blockId)!,
				userMessage,
				aiResponse: response.content
			};
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
	 * Build system prompt for block analysis
	 */
	private buildSystemPrompt(blockId: string, content: string): string {
		const date = new Date().toISOString().split('T')[0];

		return `你是一个日记分析助手，专门帮助用户从日常日记中识别和归档实体。

## 当前任务
分析以下日记内容，识别其中的人脉、项目、任务、物品、想法和知识。

## 日记内容
${content}

## 分析要求
1. 每次只分析一个大类：人脉 -> 项目/任务 -> 物品 -> 想法 -> 知识
2. 对于未在已归档实体中找到的名称，询问用户确认
3. 用 **加粗** 格式标注实体名称
4. 回复简洁，不超过 100 字

## 实体分类
- 人脉 (People): 同事、客户、朋友等
- 项目 (Projects): 以"项目"结尾
- 任务 (Tasks): 以"任务"结尾
- 物品 (Things): 产品、工具等
- 想法 (Ideas): 观点、想法
- 知识 (Knowledge): 文档、链接

请开始分析这篇日记中的人脉实体。`;
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
}
