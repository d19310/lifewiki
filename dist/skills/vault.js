/**
 * Vault Skills
 * Handles file operations and search with Skill functions
 */
import { EntityManager } from '../entities/manager';
const DIARY_FOLDER = 'Daily';
const ENTITY_FOLDERS = {
    person: 'People',
    project: 'Projects',
    thing: 'Things',
    idea: 'Ideas',
    knowledge: 'Knowledge'
};
export async function searchVault(app, query, type = 'all') {
    const results = {
        entities: [],
        diaryEntries: []
    };
    // Search entities (always available as Skill)
    results.entities = await searchEntities(app, query, type === 'entity' ? [] : undefined);
    // Search diary entries if not restricted
    if (type !== 'entity') {
        results.diaryEntries = await searchDiary(app, query);
    }
    return results;
}
async function searchEntities(app, query, types) {
    // Use EntityManager search
    const entityManager = new EntityManager(app);
    return entityManager.searchEntities(query, types);
}
async function searchDiary(app, query) {
    const vault = app.vault;
    const files = vault.getMarkdownFiles();
    const results = [];
    for (const file of files) {
        if (file.path.startsWith(DIARY_FOLDER + '/')) {
            const content = await vault.read(file);
            if (content.toLowerCase().includes(query.toLowerCase())) {
                results.push({
                    file: file.path,
                    content: content.substring(0, 200)
                });
            }
        }
    }
    return results;
}
export async function createEntityWithSkill(app, entityType, data, entityManager) {
    // Validate required fields
    if (!data.title) {
        throw new Error('Entity title is required');
    }
    // Use Skill to create entity
    const entity = await entityManager.createEntity({
        type: entityType,
        title: data.title,
        titleRaw: data.titleRaw || data.title,
        aliases: data.aliases || [],
        tags: data.tags || [],
        summary: data.summary || '',
        confidence: data.confidence || 0.5,
        verificationStatus: 'pending',
        createdAt: new Date().toISOString(),
        createdBy: 'ai',
        lastUpdated: new Date().toISOString(),
        relatedEntities: (data.relatedEntities || []).map((id) => ({ entityId: id, relation: 'about', context: '' })),
        interactions: data.interactions || [],
        metadata: data.metadata || {}
    });
    return entity;
}
export async function updateEntityWithSkill(app, entityId, updates, entityManager) {
    return entityManager.updateEntity(entityId, updates);
}
