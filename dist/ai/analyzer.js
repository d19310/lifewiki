/**
 * AI Analyzer
 * Coordinates AI analysis for journal blocks
 */
export class AIAnalyzer {
    constructor(provider, entityManager) {
        this.provider = provider;
        this.entityManager = entityManager;
    }
    /**
     * Analyze a single block
     */
    async analyzeBlock(block) {
        // Use AI provider to analyze
        const result = await this.provider.analyzeBlock(block.content);
        // Cross-reference with existing entities
        const enrichedResult = await this.enrichWithExistingEntities(result);
        return enrichedResult;
    }
    /**
     * Enrich analysis results with existing entity information
     */
    async enrichWithExistingEntities(result) {
        const enrichEntityList = async (entities) => {
            const enriched = [];
            for (const entity of entities) {
                const existing = this.entityManager.findEntity(entity.name);
                enriched.push({
                    ...entity,
                    isArchived: !!existing,
                    newEntity: !existing
                });
                // If entity exists, add its interactions
                if (existing) {
                    await this.entityManager.addInteraction(existing.id, {
                        timestamp: new Date().toISOString(),
                        type: 'diary_mention',
                        content: entity.context,
                        sourceBlockId: result.blockId
                    });
                }
            }
            return enriched;
        };
        return {
            ...result,
            entities: {
                people: await enrichEntityList(result.entities.people),
                projects: await enrichEntityList(result.entities.projects),
                things: await enrichEntityList(result.entities.things),
                ideas: await enrichEntityList(result.entities.ideas),
                knowledge: await enrichEntityList(result.entities.knowledge)
            }
        };
    }
    /**
     * Generate follow-up questions for unconfirmed entities
     */
    generateFollowUpQuestions(result) {
        const questions = [];
        // Check for unarchived entities that need confirmation
        for (const [type, entities] of Object.entries(result.entities)) {
            for (const entity of entities) {
                if (entity.newEntity && result.needsConfirmation.length > 0) {
                    questions.push(`是否要将「${entity.name}」归档为${this.getTypeName(type)}？`);
                }
            }
        }
        // Check category confirmation
        if (result.category === '待确认') {
            questions.push('这条日记是工作内容还是个人内容？');
        }
        return questions;
    }
    getTypeName(type) {
        const typeNames = {
            people: '人脉',
            projects: '项目',
            things: '物品',
            ideas: '想法',
            knowledge: '知识'
        };
        return typeNames[type] || type;
    }
    /**
     * Create new entities from analysis results
     */
    async createNewEntities(result) {
        const created = [];
        for (const [type, entities] of Object.entries(result.entities)) {
            for (const entityPreview of entities) {
                if (entityPreview.newEntity) {
                    const entity = await this.entityManager.createEntity({
                        type: entityPreview.type,
                        title: entityPreview.name,
                        titleRaw: entityPreview.name,
                        aliases: [],
                        tags: [],
                        summary: entityPreview.context,
                        confidence: entityPreview.confidence,
                        verificationStatus: 'pending',
                        createdAt: new Date().toISOString(),
                        createdBy: 'ai',
                        lastUpdated: new Date().toISOString(),
                        relatedEntities: [],
                        interactions: [{
                                timestamp: new Date().toISOString(),
                                type: 'ai_analysis',
                                content: `AI 分析识别: ${entityPreview.context}`,
                                sourceBlockId: result.blockId
                            }],
                        metadata: {
                            status: 'active',
                            source: 'diary'
                        }
                    });
                    created.push(entity);
                }
            }
        }
        return created;
    }
}
