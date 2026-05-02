import type { AIProvider } from './provider';
import type { AnalysisResult, Entity, EntityType } from '../entities/types';
import type { EntityManager } from '../entities/manager';
import { z } from 'zod';
import { memoryAnalysisToLegacyAnalysisResult } from '../memory/legacy-adapter';
import { EntityIndex } from './langgraph/entity-index';
import type {
	BlockMemoryAnalysis,
	EventMemory,
	EvidenceRef,
	KnowledgeCapsule,
	KnowledgeCapsuleType,
	OpenLoopMemory,
	OpenLoopType,
	SignalMemory,
	SignalType
} from '../memory/types';

const knowledgeCapsuleTypes = [
	'lesson',
	'principle',
	'preference',
	'workflow',
	'decision',
	'pattern',
	'constraint',
	'open_question'
] as const;

const signalTypes = [
	'emotion',
	'energy',
	'stress',
	'attention',
	'risk',
	'relationship_shift',
	'recurring_theme'
] as const;

const openLoopTypes = [
	'follow_up',
	'unanswered_question',
	'pending_decision',
	'commitment',
	'unclear_boundary',
	'blocked_task'
] as const;

const entityTypes = ['person', 'project', 'thing', 'idea', 'knowledge'] as const;

const areaLabels = ['工作', '项目', '学习', '生活', '健康', '关系', '家庭', '财务', '创作', '旅行', '待回顾'] as const;

const areaLabelMap: Record<string, typeof areaLabels[number]> = {
	商务沟通: '工作',
	客户沟通: '工作',
	客户需求: '工作',
	商业拓展: '工作',
	会议讨论: '工作',
	项目管理: '项目',
	项目协作: '项目',
	需求调研: '项目',
	算力需求: '项目',
	技术方案: '项目',
	产品设计: '项目',
	阅读研究: '学习',
	知识管理: '学习',
	个人复盘: '生活',
	情绪状态: '健康',
	精力管理: '健康',
	人际关系: '关系',
	亲密关系: '关系'
};

const captureAnalysisSchema = z.object({
	memoryEcho: z.string().default(''),
	labels: z.array(z.string()).default([]),
	events: z.array(z.object({
		title: z.string(),
		summary: z.string(),
		relatedEntityNames: z.array(z.string()).default([]),
		confidence: z.number().min(0).max(1).default(0.7)
	})).default([]),
	entities: z.array(z.object({
		name: z.string(),
		type: z.enum(entityTypes),
		context: z.string().default(''),
		confidence: z.number().min(0).max(1).default(0.7)
	})).default([]),
	knowledgeCapsules: z.array(z.object({
		type: z.enum(knowledgeCapsuleTypes),
		title: z.string(),
		content: z.string(),
		triggers: z.array(z.string()).default([]),
		appliesTo: z.array(z.string()).default([]),
		avoid: z.array(z.string()).optional(),
		relatedEntityNames: z.array(z.string()).default([]),
		confidence: z.number().min(0).max(1).default(0.7)
	})).default([]),
	signals: z.array(z.object({
		type: z.enum(signalTypes),
		value: z.string(),
		intensity: z.enum(['low', 'medium', 'high']).optional(),
		summary: z.string(),
		relatedEntityNames: z.array(z.string()).default([]),
		confidence: z.number().min(0).max(1).default(0.7)
	})).default([]),
	openLoops: z.array(z.object({
		type: z.enum(openLoopTypes),
		title: z.string(),
		context: z.string(),
		nextStep: z.string().optional(),
		dueAt: z.string().optional(),
		relatedEntityNames: z.array(z.string()).default([]),
		confidence: z.number().min(0).max(1).default(0.7)
	})).default([])
});

type CaptureAnalysisPayload = z.infer<typeof captureAnalysisSchema>;

export interface CaptureAnalyzerResult {
	memoryAnalysis: BlockMemoryAnalysis;
	analysisResult: AnalysisResult;
	knownEntityIds: string[];
}

export class CaptureAnalyzer {
	constructor(
		private readonly provider: AIProvider,
		private readonly entityManager: EntityManager
	) {}

	async analyzeBlock(input: {
		blockId: string;
		content: string;
		parentId?: string | null;
		siblingBlocks?: Array<{ id: string; content: string }>;
	}): Promise<CaptureAnalyzerResult> {
		await this.entityManager.ensureInitialized();

		const t0 = performance.now();
		const now = new Date().toISOString();
		const entities = this.entityManager.getAllEntities();
		const index = new EntityIndex(entities);
		const t1 = performance.now();

		// Use AC scanning to find entities actually mentioned in content
		const scannedMatches = index.scanContent(input.content);
		const t2 = performance.now();

		const promptEntities = this.selectPromptEntities(entities, input.content, index, scannedMatches);
		const entityContext = this.formatEntityContext(promptEntities);

		console.debug(
			`[CaptureAnalyzer] block=${input.blockId}, ` +
			`entities=${entities.length}, acMatches=${scannedMatches.size}, ` +
			`promptEntities=${promptEntities.length}, ` +
			`indexBuild=${(t1 - t0).toFixed(1)}ms, acScan=${(t2 - t1).toFixed(1)}ms`
		);

		const response = await this.provider.chat([
			{ role: 'system', content: this.buildSystemPrompt() },
			{ role: 'user', content: this.buildUserPrompt(input.content, entityContext, input.parentId || null, input.siblingBlocks || []) }
		]);

		const payload = this.parseResponse(response.content);
		const evidence = this.createEvidence(input.blockId, input.content, now);
		const relatedEntityIds = this.resolveEntityIds([
			...payload.events.flatMap((event) => event.relatedEntityNames),
			...payload.knowledgeCapsules.flatMap((capsule) => capsule.relatedEntityNames),
			...payload.signals.flatMap((signal) => signal.relatedEntityNames),
			...payload.openLoops.flatMap((openLoop) => openLoop.relatedEntityNames),
			...payload.entities.map((entity) => entity.name)
		], index);

		const memoryAnalysis: BlockMemoryAnalysis = {
			blockId: input.blockId,
			memoryEcho: this.normalizeMemoryEcho(payload.memoryEcho),
			labels: this.normalizeLabels(payload.labels),
			events: payload.events.map((event, i) => this.toEventMemory(input.blockId, event, index, now, i)),
			knowledgeCapsules: payload.knowledgeCapsules.map((capsule, i) => this.toKnowledgeCapsule(input.blockId, capsule, index, evidence, now, i)),
			signals: payload.signals.map((signal, i) => this.toSignalMemory(input.blockId, signal, index, evidence, now, i)),
			openLoops: payload.openLoops.map((openLoop, i) => this.toOpenLoopMemory(input.blockId, openLoop, index, evidence, now, i)),
			relatedEntityIds,
			createdAt: now
		};

		return {
			memoryAnalysis,
			analysisResult: memoryAnalysisToLegacyAnalysisResult({
				blockId: input.blockId,
				memoryAnalysis,
				entityCandidates: payload.entities.map((entity) => ({
					type: entity.type,
					name: entity.name,
					confidence: entity.confidence,
					context: entity.context,
					isArchived: index.findExact(entity.name) !== null,
					newEntity: index.findExact(entity.name) === null
				})),
				timestamp: now
			}),
			knownEntityIds: relatedEntityIds
		};
	}

	private buildSystemPrompt(): string {
		return `你是 LifeWiki 2.0 的 Capture Analyzer，负责从用户的自然日记中萃取可复用的个人记忆。

你的目标不是催用户建实体，而是识别日记中真正有未来价值的内容：事件、经验、原则、偏好、流程、决策、模式、约束、信号和开放循环。

请只输出 JSON，不要输出 Markdown，不要解释字段。

输出字段：
- memoryEcho: 给用户看的自然反馈，中文，1 句话，最好指出这条日记里最值得记住的含义。不要带 #标签，不要像字段解释。
- labels: 1-3 个领域 Areas 标签，只能从 ["工作","项目","学习","生活","健康","关系","家庭","财务","创作","旅行","待回顾"] 中选择。
- events: 发生了什么。
- entities: 日记里提到的人、项目、物品、想法、知识来源。只做候选，不要求用户确认。
- knowledgeCapsules: 可复用隐形知识。没有就返回 []。
- signals: 情绪、精力、压力、注意力、风险、关系变化、反复主题等长期信号。没有就返回 []。
- openLoops: 未关闭的问题、承诺、跟进、待决策、边界不清或阻塞事项。没有就返回 []。

重要原则：
1. 不要把普通名词都当成知识胶囊。
2. 只有当内容对未来决策、行动、复盘有帮助时，才萃取 knowledgeCapsules。
3. 不要捏造日记没有表达的事实。
4. confidence 使用 0 到 1。
5. relatedEntityNames 必须使用日记中实际出现的名称或已知实体名。
6. labels 是领域层级，不是关键词。不要输出 "客户需求"、"需求调研"、"算力"、人名、公司名、项目名这类细颗粒度标签。

实体分类规则：
- person: 人名、公司名、机构名、组织名、客户、供应商、合作方、团队、部门，都归到 person。LifeWiki 的 People 档案表示人脉/组织关系，不只表示自然人。公司名或人名不确定时优先选 person。
- project: 明确的项目、任务、商机、合同、交付、需求调研、租赁、供货事项，例如 "公共算力平台项目"、"青岛B300供货项目"。
- thing: 具体物品、设备、产品型号、资产、工具或平台能力，例如 "英伟达H200"、"GPU服务器"、"某个API"。如果名称里有 "项目/任务/商机/需求调研/合同/交付"，不要归为 thing。
- idea: 想法、方案、策略、计划、方法、设计要求、问题判断、流程。
- knowledge: 文章、链接、资料、报告、文档、新闻、论文、知识来源。`;
	}

	private buildUserPrompt(
		content: string,
		entityContext: string,
		parentId: string | null,
		siblingBlocks: Array<{ id: string; content: string }>
	): string {
		const childContext = parentId
			? `\n\n这是一个子 block。父 block ID：${parentId}\n其他子 block：\n${siblingBlocks.map((block) => `- ${block.content}`).join('\n') || '无'}`
			: '';

		return `## 已知实体
${entityContext}

## 日记内容
${content}${childContext}

请输出符合要求的 JSON。`;
	}

	/**
	 * Select entities to inject into AI prompt.
	 * Uses AC scanning to find entities mentioned in content, then fills
	 * remaining slots with recently updated entities (up to 60 total).
	 */
	private selectPromptEntities(
		entities: Entity[],
		content: string,
		index: EntityIndex,
		scannedMatches: Map<Entity, number[]>
	): Entity[] {
		if (entities.length <= 60) return entities;

		// Start with entities found via AC scanning
		const matched = new Set<Entity>(scannedMatches.keys());
		const selected: Entity[] = Array.from(matched);

		// Fill remaining slots with recently updated entities
		const remaining = 60 - selected.length;
		if (remaining > 0) {
			const byRecency = entities
				.filter((e) => !matched.has(e))
				.sort((a, b) => {
					const bTime = Date.parse(b.lastUpdated || b.createdAt || '') || 0;
					const aTime = Date.parse(a.lastUpdated || a.createdAt || '') || 0;
					return bTime - aTime;
				});
			selected.push(...byRecency.slice(0, remaining));
		}

		return selected;
	}

	private normalizeForMatch(value: string): string {
		return value.toLowerCase().replace(/\s+/g, '');
	}

	private formatEntityContext(entities: Entity[]): string {
		if (entities.length === 0) return '无';
		return entities
			.map((entity) => {
				const meta = entity.metadata || {};
				const parts: string[] = [];
				if (meta.company) parts.push(`公司：${meta.company}`);
				if (meta.role) parts.push(`职位：${meta.role}`);
				if (meta.relationship_to_user) parts.push(`关系：${meta.relationship_to_user}`);
				if (meta.owner) parts.push(`负责人：${meta.owner}`);
				const metaStr = parts.length > 0 ? `，${parts.join('，')}` : '';
				return `- ${entity.title} (${entity.type})${entity.aliases.length ? `，别名：${entity.aliases.join('、')}` : ''}${metaStr}`;
			})
			.join('\n');
	}

	private parseResponse(content: string): CaptureAnalysisPayload {
		const cleaned = content
			.replace(/```json\s*/i, '')
			.replace(/```\s*$/i, '')
			.trim();

		const candidates = this.extractJsonCandidates(cleaned);
		for (const jsonText of candidates) {
			try {
				const raw = JSON.parse(jsonText);
				return captureAnalysisSchema.parse(this.normalizeRawPayload(raw));
			} catch {
				// Try the next candidate. Some thinking models emit multiple JSON blocks.
			}
		}

		console.warn('[CaptureAnalyzer] Failed to parse structured response; using natural fallback.');
		return captureAnalysisSchema.parse({
				memoryEcho: this.fallbackEcho(cleaned),
				labels: ['待回顾'],
				events: [],
				entities: [],
				knowledgeCapsules: [],
				signals: [],
				openLoops: []
		});
	}

	private extractJsonCandidates(content: string): string[] {
		const candidates: string[] = [];
		const fencedJson = /```(?:json)?\s*([\s\S]*?)```/gi;
		let match: RegExpExecArray | null;
		while ((match = fencedJson.exec(content)) !== null) {
			const block = match[1]?.trim();
			if (block?.startsWith('{')) candidates.push(block);
		}

		candidates.push(...this.extractBalancedJsonObjects(content));
		return Array.from(new Set(candidates)).reverse();
	}

	private extractBalancedJsonObjects(content: string): string[] {
		const objects: string[] = [];
		let start = -1;
		let depth = 0;
		let inString = false;
		let escaped = false;

		for (let index = 0; index < content.length; index++) {
			const char = content[index];

			if (inString) {
				if (escaped) {
					escaped = false;
				} else if (char === '\\') {
					escaped = true;
				} else if (char === '"') {
					inString = false;
				}
				continue;
			}

			if (char === '"') {
				inString = true;
				continue;
			}

			if (char === '{') {
				if (depth === 0) start = index;
				depth++;
			} else if (char === '}' && depth > 0) {
				depth--;
				if (depth === 0 && start >= 0) {
					objects.push(content.slice(start, index + 1));
					start = -1;
				}
			}
		}

		return objects;
	}

	private normalizeRawPayload(raw: unknown): Record<string, unknown> {
		const payload = raw && typeof raw === 'object' ? raw as Record<string, any> : {};
		const confidence = this.normalizeConfidence(payload.confidence, 0.7);

		return {
			...payload,
			memoryEcho: typeof payload.memoryEcho === 'string' ? payload.memoryEcho : '',
			labels: this.normalizeStringArray(payload.labels),
			events: this.normalizeObjectArray(payload.events, (item) => {
				if (typeof item === 'string') {
					return {
						title: item,
						summary: item,
						relatedEntityNames: [],
						confidence
					};
				}
				return {
					title: String(item.title || item.summary || '未命名事件'),
					summary: String(item.summary || item.title || ''),
					relatedEntityNames: this.normalizeStringArray(item.relatedEntityNames),
					confidence: this.normalizeConfidence(item.confidence, confidence)
				};
			}),
			entities: this.normalizeObjectArray(payload.entities, (item) => {
				if (typeof item === 'string') {
					return {
						name: item,
						type: this.inferEntityType(item),
						context: item,
						confidence
					};
				}
				const name = String(item.name || item.title || '');
				const context = String(item.context || item.summary || item.name || '');
				return {
					name,
					type: this.inferEntityType(name, item.type, context),
					context,
					confidence: this.normalizeConfidence(item.confidence, confidence)
				};
			}).filter((item) => item.name),
			knowledgeCapsules: this.normalizeObjectArray(payload.knowledgeCapsules, (item) => {
				if (typeof item === 'string') {
					return {
						type: 'lesson',
						title: item,
						content: item,
						triggers: [],
						appliesTo: [],
						relatedEntityNames: [],
						confidence
					};
				}
				return {
					type: knowledgeCapsuleTypes.includes(item.type) ? item.type : 'lesson',
					title: String(item.title || item.content || '未命名知识胶囊'),
					content: String(item.content || item.title || ''),
					triggers: this.normalizeStringArray(item.triggers),
					appliesTo: this.normalizeStringArray(item.appliesTo),
					avoid: Array.isArray(item.avoid) ? this.normalizeStringArray(item.avoid) : undefined,
					relatedEntityNames: this.normalizeStringArray(item.relatedEntityNames),
					confidence: this.normalizeConfidence(item.confidence, confidence)
				};
			}),
			signals: this.normalizeObjectArray(payload.signals, (item) => {
				if (typeof item === 'string') {
					return {
						type: 'recurring_theme',
						value: item,
						summary: item,
						relatedEntityNames: [],
						confidence
					};
				}
				return {
					type: signalTypes.includes(item.type) ? item.type : 'recurring_theme',
					value: String(item.value || item.summary || ''),
					intensity: ['low', 'medium', 'high'].includes(item.intensity) ? item.intensity : undefined,
					summary: String(item.summary || item.value || ''),
					relatedEntityNames: this.normalizeStringArray(item.relatedEntityNames),
					confidence: this.normalizeConfidence(item.confidence, confidence)
				};
			}).filter((item) => item.value && item.summary),
			openLoops: this.normalizeObjectArray(payload.openLoops, (item) => {
				if (typeof item === 'string') {
					return {
						type: 'follow_up',
						title: item,
						context: item,
						relatedEntityNames: [],
						confidence
					};
				}
				return {
					type: openLoopTypes.includes(item.type) ? item.type : 'follow_up',
					title: String(item.title || item.context || '未命名开放循环'),
					context: String(item.context || item.title || ''),
					nextStep: typeof item.nextStep === 'string' ? item.nextStep : undefined,
					dueAt: typeof item.dueAt === 'string' ? item.dueAt : undefined,
					relatedEntityNames: this.normalizeStringArray(item.relatedEntityNames),
					confidence: this.normalizeConfidence(item.confidence, confidence)
				};
			})
		};
	}

	private normalizeObjectArray<T>(value: unknown, mapper: (item: any) => T): T[] {
		if (!Array.isArray(value)) return [];
		return value
			.map((item) => {
				if (typeof item === 'string') return mapper(item);
				if (item && typeof item === 'object') return mapper(item);
				return null;
			})
			.filter((item): item is T => item !== null);
	}

	private normalizeStringArray(value: unknown): string[] {
		if (!Array.isArray(value)) return [];
		return value
			.map((item) => typeof item === 'string' ? item.trim() : '')
			.filter(Boolean);
	}

	private normalizeConfidence(value: unknown, fallback: number): number {
		return typeof value === 'number' && value >= 0 && value <= 1 ? value : fallback;
	}

	private inferEntityType(name: string, suggestedType?: unknown, context = ''): EntityType {
		const normalizedName = name.trim();
		const text = `${normalizedName} ${context}`.trim();
		const suggested = entityTypes.includes(suggestedType as any) ? suggestedType as EntityType : undefined;
		if (!normalizedName) return suggested || 'thing';

		if (this.looksLikeProject(normalizedName)) return 'project';
		if (this.looksLikeKnowledge(normalizedName)) return 'knowledge';
		if (this.looksLikeIdea(normalizedName)) return 'idea';
		if (this.looksLikeProductModel(normalizedName)) return 'thing';
		if (this.looksLikePersonOrOrganization(normalizedName, text)) return 'person';
		if (this.looksLikeThing(normalizedName)) return 'thing';

		if (suggested && suggested !== 'thing') return suggested;
		if (this.looksLikeProject(text)) return 'project';
		if (this.looksLikeKnowledge(text)) return 'knowledge';
		if (this.looksLikeIdea(text)) return 'idea';
		if (this.looksLikeThing(text)) return 'thing';
		if (/^[\u4e00-\u9fa5]{2,4}[A-Za-z0-9]*$/.test(normalizedName)) return 'person';
		if (/^[A-Za-z][A-Za-z0-9._ -]{1,40}$/.test(normalizedName) && /负责人|CEO|CTO|采购|客户|公司|团队|融资|合作|对接|沟通/.test(text)) return 'person';
		return suggested || 'thing';
	}

	private looksLikeProject(text: string): boolean {
		return /项目|任务|商机|合同|交付|验收|招投标|投标|供货|租赁|需求调研|运营工作|专项|POC|试点/.test(text);
	}

	private looksLikeKnowledge(text: string): boolean {
		return /文章|链接|资料|报告|文档|新闻|资讯|论文|纪要|白皮书|研究|教程|书籍|知识来源/.test(text);
	}

	private looksLikeIdea(text: string): boolean {
		return /想法|方案|策略|计划|方法|设计要求|模式|原则|流程|机制|判断|建议|问题|假设|思路|路线/.test(text);
	}

	private looksLikePersonOrOrganization(name: string, text: string): boolean {
		if (/CEO|CTO|CFO|COO|负责人|经理|同事|朋友|客户|供应商|合作方|合作伙伴|采购负责人|联系人|老师|同学/.test(text)) return true;
		if (/公司|智能|科技|集团|有限|实验室|研究院|研究所|管委会|委员会|部门|团队|机构|中心|银行|移动|电信|联通|大学|学院|医院|政府|协会|基金|资本|投资|园区/.test(name)) return true;
		if (/^[\u4e00-\u9fa5]{2,4}[A-Za-z0-9]*$/.test(name) && !/(项目|任务|方案|文档|文章|新闻|系统|服务|芯片|服务器|模型|产品|工具|平台|需求|问题|计划|流程|报告)$/.test(name)) return true;
		if (/^[A-Za-z][A-Za-z0-9._ -]{1,40}$/.test(name) && /公司|组织|团队|融资|采购|客户|合作|对接|沟通|负责人/.test(text)) return true;
		return false;
	}

	private looksLikeProductModel(text: string): boolean {
		return /(?:^|[\s\-_])(?:H100|H200|A100|A800|H800|B200|B300|GPU|CPU)(?:$|[\s\-_]|\d)/i.test(text)
			|| /[\u4e00-\u9fa5]+(?:H100|H200|A100|A800|H800|B200|B300)/i.test(text);
	}

	private looksLikeThing(text: string): boolean {
		return /H100|H200|A100|A800|H800|B200|B300|GPU|CPU|服务器|芯片|算力卡|显卡|交换机|路由器|设备|硬件|软件|工具|API|模型|平台|系统|产品|物品|资产/i.test(text);
	}

	private fallbackEcho(content: string): string {
		const withoutThinking = content
			.replace(/<think>[\s\S]*?<\/think>/gi, '')
			.replace(/```[\s\S]*?```/g, '')
			.replace(/\{[\s\S]*\}/g, '')
			.trim();
		const compact = withoutThinking.replace(/\s+/g, ' ').slice(0, 80);
		return compact ? `这条日记已记录，后续可以再补充细节：${compact} #待回顾` : '这条日记已保存为候选记忆。#待回顾';
	}

	/**
	 * Resolve entity names to IDs using EntityIndex with layered matching.
	 * Falls back to findBestMatch for fuzzy matching (alias, prefix, edit distance).
	 */
	private resolveEntityIds(names: string[], index: EntityIndex): string[] {
		const ids = new Set<string>();
		for (const name of names) {
			const match = index.findBestMatch(name);
			if (match.entity) ids.add(match.entity.id);
		}
		return Array.from(ids);
	}

	private async appendKnownEntityInteractions(
		blockId: string,
		content: string,
		payload: CaptureAnalysisPayload,
		lookup: Map<string, Entity>
	): Promise<void> {
		const names = new Set<string>(payload.entities.map((entity) => entity.name));
		for (const entity of lookup.values()) {
			if (content.includes(entity.title) || entity.aliases.some((alias) => content.includes(alias))) {
				names.add(entity.title);
			}
		}

		const updated = new Set<string>();
		for (const name of names) {
			const entity = lookup.get(name.toLowerCase());
			if (!entity || updated.has(entity.id)) continue;
			updated.add(entity.id);
			await this.entityManager.addInteraction(entity.id, {
				timestamp: new Date().toISOString(),
				type: 'diary_mention',
				content: this.summarizeInteraction(content),
				sourceBlockId: blockId
			});
		}
	}

	private summarizeInteraction(content: string): string {
		return content.length > 120 ? `${content.slice(0, 117)}...` : content;
	}

	private createEvidence(blockId: string, content: string, timestamp: string): EvidenceRef[] {
		return [{
			blockId,
			quote: content.length > 160 ? `${content.slice(0, 157)}...` : content,
			timestamp
		}];
	}

	private toEventMemory(
		blockId: string,
		event: CaptureAnalysisPayload['events'][number],
		index: EntityIndex,
		now: string,
		i: number
	): EventMemory {
		return {
			id: this.stableId('event', blockId, event.title, i),
			title: event.title,
			summary: event.summary,
			source: 'diary',
			sourceBlockIds: [blockId],
			relatedEntityIds: this.resolveEntityIds(event.relatedEntityNames, index),
			occurredAt: now,
			createdAt: now,
			confidence: event.confidence
		};
	}

	private toKnowledgeCapsule(
		blockId: string,
		capsule: CaptureAnalysisPayload['knowledgeCapsules'][number],
		index: EntityIndex,
		evidence: EvidenceRef[],
		now: string,
		i: number
	): KnowledgeCapsule {
		return {
			id: this.stableId('capsule', blockId, capsule.title, i),
			type: capsule.type as KnowledgeCapsuleType,
			title: capsule.title,
			content: capsule.content,
			triggers: capsule.triggers,
			appliesTo: capsule.appliesTo,
			avoid: capsule.avoid,
			relatedEntityIds: this.resolveEntityIds(capsule.relatedEntityNames, index),
			evidence,
			status: 'candidate',
			confidence: capsule.confidence,
			createdAt: now,
			updatedAt: now
		};
	}

	private toSignalMemory(
		blockId: string,
		signal: CaptureAnalysisPayload['signals'][number],
		index: EntityIndex,
		evidence: EvidenceRef[],
		now: string,
		i: number
	): SignalMemory {
		return {
			id: this.stableId('signal', blockId, signal.type, signal.value, i),
			type: signal.type as SignalType,
			value: signal.value,
			intensity: signal.intensity,
			summary: signal.summary,
			relatedEntityIds: this.resolveEntityIds(signal.relatedEntityNames, index),
			evidence,
			occurredAt: now,
			confidence: signal.confidence
		};
	}

	private toOpenLoopMemory(
		blockId: string,
		openLoop: CaptureAnalysisPayload['openLoops'][number],
		index: EntityIndex,
		evidence: EvidenceRef[],
		now: string,
		i: number
	): OpenLoopMemory {
		return {
			id: this.stableId('open_loop', blockId, openLoop.title, i),
			type: openLoop.type as OpenLoopType,
			title: openLoop.title,
			context: openLoop.context,
			nextStep: openLoop.nextStep,
			dueAt: openLoop.dueAt,
			relatedEntityIds: this.resolveEntityIds(openLoop.relatedEntityNames, index),
			evidence,
			status: 'open',
			confidence: openLoop.confidence,
			createdAt: now,
			updatedAt: now
		};
	}

	private normalizeLabels(labels: string[]): string[] {
		const normalized = labels
			.flatMap((label) => this.toAreaLabel(label))
			.filter(Boolean);
		const unique = Array.from(new Set(normalized));
		return (unique.length > 0 ? unique : ['待回顾']).slice(0, 3);
	}

	private normalizeMemoryEcho(memoryEcho: string): string {
		return memoryEcho
			.replace(/\s*#[^\s#]+/g, '')
			.trim() || '这条日记已经保存为候选记忆。';
	}

	private toAreaLabel(label: string): Array<typeof areaLabels[number]> {
		const clean = label.replace(/^#/, '').trim();
		if (!clean) return [];
		if ((areaLabels as readonly string[]).includes(clean)) {
			return [clean as typeof areaLabels[number]];
		}
		if (areaLabelMap[clean]) {
			return [areaLabelMap[clean]];
		}

		const rules: Array<[RegExp, typeof areaLabels[number]]> = [
			[/工作|商务|客户|沟通|会议|运营|管理|商业|职业|合作/, '工作'],
			[/项目|需求|调研|算力|平台|产品|研发|技术|系统|方案|交付/, '项目'],
			[/学习|研究|阅读|知识|课程|资料|文章|论文|复盘/, '学习'],
			[/生活|日常|个人|习惯|整理/, '生活'],
			[/健康|睡眠|运动|身体|情绪|压力|精力|注意力/, '健康'],
			[/关系|朋友|同事|人际|沟通关系/, '关系'],
			[/家庭|家人|父母|孩子|亲子/, '家庭'],
			[/财务|投资|消费|理财|收入|预算|股票/, '财务'],
			[/创作|写作|设计|表达|内容/, '创作'],
			[/旅行|出差|行程|城市/, '旅行']
		];
		const match = rules.find(([pattern]) => pattern.test(clean));
		return match ? [match[1]] : [];
	}

	private stableId(...parts: Array<string | number>): string {
		const input = parts.join('|');
		let hash = 0;
		for (let i = 0; i < input.length; i++) {
			hash = ((hash << 5) - hash) + input.charCodeAt(i);
			hash |= 0;
		}
		return `mem_${Math.abs(hash).toString(16)}`;
	}
}
