"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/vault/vault.ts
var vault_exports = {};
__export(vault_exports, {
  VaultOperations: () => VaultOperations
});
module.exports = __toCommonJS(vault_exports);
var DIARY_FOLDER = "Daily";
var ENTITY_FOLDERS = {
  person: "People",
  project: "Projects",
  thing: "Things",
  idea: "Ideas",
  knowledge: "Knowledge"
};
function isTFile(file) {
  return file !== null && typeof file === "object" && "path" in file;
}
var VaultOperations = class {
  constructor(app, entityManager, aiProvider, skillExecutor) {
    this.app = app;
    this.entityManager = entityManager;
    this.aiProvider = aiProvider;
    this.skillExecutor = skillExecutor;
  }
  async readDiary(date) {
    const filePath = `${DIARY_FOLDER}/${date}.md`;
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!isTFile(file)) {
      return "";
    }
    return this.app.vault.read(file);
  }
  async appendBlock(date, block) {
    const filePath = `${DIARY_FOLDER}/${date}.md`;
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!isTFile(file)) {
      return;
    }
    const existingContent = await this.app.vault.read(file);
    const blockContent = this.formatBlock(block);
    const newContent = existingContent + "\n" + blockContent;
    await this.app.vault.modify(file, newContent);
  }
  formatBlock(block) {
    const source = block.source ? ` [${block.source}]` : "";
    const category = block.category ? ` #${block.category}` : "";
    return `### ${block.timestamp}${source}${category}
${block.content}`;
  }
  async createEntity(entity) {
    const folder = ENTITY_FOLDERS[entity.type];
    const fileName = `${entity.title}.md`;
    const filePath = `${folder}/${fileName}`;
    const content = this.formatEntityContent(entity);
    await this.app.vault.create(filePath, content);
    await this.entityManager.indexFile(this.app.vault.getAbstractFileByPath(filePath), entity.type);
    return { filePath };
  }
  async updateEntity(entity) {
    const content = this.formatEntityContent(entity);
    await this.app.vault.adapter.write(entity.filePath, content);
    await this.entityManager.indexFile(this.app.vault.getAbstractFileByPath(entity.filePath), entity.type);
    return { filePath: entity.filePath };
  }
  formatEntityContent(entity) {
    const lines = [
      "---",
      `entity_type: "${entity.type}"`,
      `title: "${entity.title}"`,
      `title_raw: "${entity.titleRaw}"`,
      `aliases: [${entity.aliases.map((a) => `"${a}"`).join(", ")}]`,
      `tags: [${entity.tags.map((t) => `"${t}"`).join(", ")}]`,
      `summary: "${entity.summary}"`,
      `confidence: ${entity.confidence}`,
      `verification_status: "${entity.verificationStatus}"`,
      `created_at: "${entity.createdAt}"`,
      `created_by: "${entity.createdBy}"`,
      `last_updated: "${entity.lastUpdated}"`,
      `related_entities: [${entity.relatedEntities.map((r) => `"${r.entityId}"`).join(", ")}]`,
      `metadata: ${JSON.stringify(entity.metadata)}`,
      "---",
      "",
      `# ${entity.title}`,
      ""
    ];
    return lines.join("\n");
  }
  async searchEntities(query, types) {
    return this.entityManager.searchEntities(query, types);
  }
  async findEntity(name) {
    return this.entityManager.findEntity(name);
  }
  async getEntityById(id) {
    return this.entityManager.getEntity(id);
  }
  async analyzeDiaryContent(content) {
    if (!this.aiProvider || !this.aiProvider.analyzeBlock) {
      return {
        entities: { people: [], projects: [], things: [], ideas: [], knowledge: [] },
        needsConfirmation: [],
        aiResponse: "AI provider not available"
      };
    }
    return this.aiProvider.analyzeBlock(content);
  }
  async processDiaryEntry(date, content) {
    const analysis = await this.analyzeDiaryContent(content);
    if (analysis.entities) {
      const createdEntities = await this.skillExecutor.createNewEntitiesWithSkills(
        analysis,
        this.entityManager,
        this.app
      );
      if (analysis.entities.people.length > 0 || analysis.entities.projects.length > 0 || analysis.entities.things.length > 0) {
        await this.skillExecutor.analyzeBlock({
          content,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
    }
    return analysis;
  }
  async searchDiary(query) {
    const vault = this.app.vault;
    const files = vault.getMarkdownFiles();
    const results = [];
    const lowerQuery = query.toLowerCase();
    for (const file of files) {
      if (file.path.startsWith(DIARY_FOLDER + "/")) {
        const content = await vault.read(file);
        if (content.toLowerCase().includes(lowerQuery)) {
          results.push({
            file: file.path,
            content: content.substring(0, 200)
          });
        }
      }
    }
    return results;
  }
  async exportEntities(type) {
    const entities = type ? this.entityManager.getEntitiesByType(type) : Array.from(this.entityManager["entityCache"].values());
    return JSON.stringify(entities, null, 2);
  }
  async importEntities(data) {
    const imported = [];
    for (const entityData of data) {
      try {
        const entity = await this.entityManager.createEntity({
          type: entityData.type,
          title: entityData.title,
          titleRaw: entityData.titleRaw,
          aliases: entityData.aliases,
          tags: entityData.tags,
          summary: entityData.summary,
          confidence: entityData.confidence,
          verificationStatus: entityData.verificationStatus,
          createdAt: entityData.createdAt,
          createdBy: entityData.createdBy,
          lastUpdated: entityData.lastUpdated,
          relatedEntities: entityData.relatedEntities,
          interactions: entityData.interactions,
          metadata: entityData.metadata
        });
        imported.push(entity);
      } catch (error) {
        console.error(`Failed to import entity ${entityData.title}:`, error);
      }
    }
    return imported;
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  VaultOperations
});
