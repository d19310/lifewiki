import { CaptureAnalyzer } from './capture-analyzer';
import type { AIProvider } from './provider';

function createProvider(): AIProvider {
	return {
		chat: jest.fn(async () => ({
			content: JSON.stringify({
				memoryEcho: '这条日记记录了评审前先收敛上下文的工作模式。',
				labels: ['工作', '项目'],
				events: [{
					title: '项目评审前置收敛',
					summary: '评审前先收敛目标、约束和证据，能减少沟通成本。',
					relatedEntityNames: [],
					confidence: 0.82
				}],
				entities: [],
				knowledgeCapsules: [{
					type: 'workflow',
					title: '评审前先收敛上下文',
					content: '复杂评审前先把目标、约束和证据收敛成一个短清单。',
					triggers: ['代码评审开始前'],
					appliesTo: ['项目协作'],
					avoid: ['直接进入细节争论'],
					relatedEntityNames: [],
					confidence: 0.88
				}],
				signals: [{
					type: 'attention',
					value: '上下文收敛',
					intensity: 'medium',
					summary: '用户注意到前置收敛对沟通质量的影响。',
					relatedEntityNames: [],
					confidence: 0.76
				}],
				openLoops: [{
					type: 'follow_up',
					title: '整理评审前置清单模板',
					context: '这个流程值得沉淀成模板。',
					nextStep: '写一个三项清单模板',
					relatedEntityNames: [],
					confidence: 0.7
				}]
			})
		})),
		analyzeBlock: jest.fn(),
		isReady: jest.fn(() => true)
	};
}

function createProviderWithContent(content: string): AIProvider {
	return {
		chat: jest.fn(async () => ({ content })),
		analyzeBlock: jest.fn(),
		isReady: jest.fn(() => true)
	};
}

function createEntityManager() {
	return {
		ensureInitialized: jest.fn(async () => undefined),
		getAllEntities: jest.fn(() => []),
		addInteraction: jest.fn(async () => undefined)
	} as any;
}

function memoryIds(result: Awaited<ReturnType<CaptureAnalyzer['analyzeBlock']>>) {
	const analysis = result.memoryAnalysis;
	return {
		events: analysis.events.map((item) => item.id),
		capsules: analysis.knowledgeCapsules.map((item) => item.id),
		signals: analysis.signals.map((item) => item.id),
		openLoops: analysis.openLoops.map((item) => item.id)
	};
}

describe('CaptureAnalyzer stable memory ids', () => {
	it('generates stable ids for the same block and structured extraction', async () => {
		const provider = createProvider();
		const analyzer = new CaptureAnalyzer(provider, createEntityManager());
		const input = {
			blockId: 'block-stable-1',
			content: '今天评审前先收敛上下文，明显让沟通更稳。'
		};

		const first = await analyzer.analyzeBlock(input);
		const second = await analyzer.analyzeBlock(input);

		expect(memoryIds(first)).toEqual(memoryIds(second));
		expect(first.memoryAnalysis.knowledgeCapsules[0].id).toBe(second.memoryAnalysis.knowledgeCapsules[0].id);
		expect(first.memoryAnalysis.labels).toEqual(['工作', '项目']);
		expect(first.analysisResult.aiResponse).not.toContain('#工作');
	});

	it('changes ids when the source block changes', async () => {
		const provider = createProvider();
		const analyzer = new CaptureAnalyzer(provider, createEntityManager());

		const first = await analyzer.analyzeBlock({
			blockId: 'block-stable-1',
			content: '今天评审前先收敛上下文，明显让沟通更稳。'
		});
		const second = await analyzer.analyzeBlock({
			blockId: 'block-stable-2',
			content: '今天评审前先收敛上下文，明显让沟通更稳。'
		});

		expect(first.memoryAnalysis.knowledgeCapsules[0].id).not.toBe(second.memoryAnalysis.knowledgeCapsules[0].id);
	});

	it('normalizes thinking-model json with string arrays into memory objects', async () => {
		const provider = createProviderWithContent(`<think>
这里是模型的思考过程。
</think>

\`\`\`json
{
  "memoryEcho": "穹彻智能的CEO主动沟通训练算力需求，这是一个潜在的商业机会，需要后续跟进。#客户需求",
  "labels": ["商务沟通", "算力", "客户需求"],
  "events": ["与穹彻智能CEO秦成LEO沟通训练算力需求"],
  "entities": ["穹彻智能", "秦成LEO"],
  "knowledgeCapsules": [],
  "signals": [],
  "openLoops": ["穹彻智能的训练算力需求具体规格未明确", "是否需要安排后续深度沟通或方案提供"],
  "confidence": 0.7
}
\`\`\``);
		const analyzer = new CaptureAnalyzer(provider, createEntityManager());

		const result = await analyzer.analyzeBlock({
			blockId: 'block-minimax-1',
			content: '今天上午和穹彻智能的CEO秦成LEO沟通了他们的训练算力的需求。'
		});

		expect(result.memoryAnalysis.memoryEcho).toContain('潜在的商业机会');
		expect(result.memoryAnalysis.events).toHaveLength(1);
		expect(result.memoryAnalysis.events[0]).toMatchObject({
			title: '与穹彻智能CEO秦成LEO沟通训练算力需求',
			confidence: 0.7
		});
		expect(result.memoryAnalysis.openLoops).toHaveLength(2);
		expect(result.memoryAnalysis.openLoops[0]).toMatchObject({
			type: 'follow_up',
			title: '穹彻智能的训练算力需求具体规格未明确'
		});
		expect(result.analysisResult.entities.people.map((entity) => entity.name)).toEqual(['穹彻智能', '秦成LEO']);
		expect(result.analysisResult.entities.things.map((entity) => entity.name)).not.toContain('秦成LEO');
		expect(result.memoryAnalysis.labels).toEqual(['工作', '项目']);
		expect(result.analysisResult.aiResponse).not.toContain('#客户需求');
	});

	it('corrects common entity type mistakes from model output', async () => {
		const provider = createProviderWithContent(JSON.stringify({
			memoryEcho: '这条日记涉及人脉、组织、项目、设备和资料，需要分开归档。',
			labels: ['工作'],
			events: [],
			entities: [
				{ name: '覃文浩', type: 'thing', context: '合作伙伴' },
				{ name: '穹彻智能', type: 'thing', context: '公司，CEO秦成LEO' },
				{ name: '32台A100项目', type: 'thing', context: '项目资源问题' },
				{ name: '英伟达H200', type: 'person', context: 'GPU服务器' },
				{ name: 'OpenClaw相关文章', type: 'thing', context: '文章资料' }
			],
			knowledgeCapsules: [],
			signals: [],
			openLoops: []
		}));
		const analyzer = new CaptureAnalyzer(provider, createEntityManager());

		const result = await analyzer.analyzeBlock({
			blockId: 'block-type-fix-1',
			content: '今天和覃文浩聊穹彻智能、32台A100项目、英伟达H200和OpenClaw相关文章。'
		});

		expect(result.analysisResult.entities.people.map((entity) => entity.name)).toEqual(['覃文浩', '穹彻智能']);
		expect(result.analysisResult.entities.projects.map((entity) => entity.name)).toEqual(['32台A100项目']);
		expect(result.analysisResult.entities.things.map((entity) => entity.name)).toEqual(['英伟达H200']);
		expect(result.analysisResult.entities.knowledge.map((entity) => entity.name)).toEqual(['OpenClaw相关文章']);
	});

	it('uses the final valid json when a model emits explanation, fenced json, and another json', async () => {
		const provider = createProviderWithContent(`<think>
先输出一个草稿。

\`\`\`json
{
  "memoryEcho": "草稿反馈。#草稿",
  "labels": ["草稿"],
  "events": ["草稿事件"],
  "entities": [],
  "knowledgeCapsules": [],
  "signals": [],
  "openLoops": []
}
\`\`\`

又补充了一些自然语言。
</think>

{"memoryEcho":"需求调研遇到阻碍时主动找人讨论是对的，但需要尽快把具体问题和后续行动记录下来。#项目管理","labels":["工作","项目管理"],"events":["与康靖媛讨论了需求调研现在面临的问题"],"entities":["康靖媛","临港实验需求调研任务"],"knowledgeCapsules":[],"signals":[],"openLoops":["需求调研当前具体面临哪些问题","问题如何解决或分解"]}`);
		const analyzer = new CaptureAnalyzer(provider, createEntityManager());

		const result = await analyzer.analyzeBlock({
			blockId: 'block-double-json-1',
			content: '今天和康靖媛讨论了需求调研现在面临的问题'
		});

		expect(result.memoryAnalysis.memoryEcho).toContain('需求调研遇到阻碍');
		expect(result.memoryAnalysis.labels).toEqual(['工作', '项目']);
		expect(result.memoryAnalysis.events[0].title).toBe('与康靖媛讨论了需求调研现在面临的问题');
		expect(result.memoryAnalysis.openLoops).toHaveLength(2);
		expect(result.analysisResult.aiResponse).not.toContain('```json');
		expect(result.analysisResult.aiResponse).not.toContain('#项目管理');
	});
});
