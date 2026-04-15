/**
 * Skill executor that coordinates AI provider and entity manager
 * Provides unified Skill interface for Block Editor
 */
import { analyzeBlockWithSkills } from './analyzer';
import { searchVault, createEntityWithSkill, updateEntityWithSkill } from './vault';
export function createSkillExecutor(app, provider, entityManager) {
    return {
        async analyzeBlock(block) {
            const result = await analyzeBlockWithSkills(block, provider, entityManager, app);
            return {
                ...result,
                skillsUsed: ['analyze_entity', 'search_vault'],
                entitiesAnalyzed: result.entities.people.length +
                    result.entities.projects.length +
                    result.entities.things.length +
                    result.entities.ideas.length +
                    result.entities.knowledge.length
            };
        },
        async search(query, type = 'all') {
            return searchVault(app, query, type);
        },
        async createEntity(entityType, data, entityManager) {
            return createEntityWithSkill(app, entityType, data, entityManager);
        },
        async updateEntity(entityId, updates, entityManager) {
            return updateEntityWithSkill(app, entityId, updates, entityManager);
        }
    };
}
