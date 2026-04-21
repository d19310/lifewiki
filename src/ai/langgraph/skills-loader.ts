/**
 * Skills Loader
 * Dynamically loads skill definitions from .lifewiki/skills/ directory in vault
 */

import type { App, TFile } from 'obsidian';

const SKILLS_DIR = '.lifewiki/skills';

export interface SkillMetadata {
  name: string;
  description: string;
  triggers: string[];
  inputFormat: string;
  outputFormat: string;
  flow: string[];
  errorHandling: string[];
}

/**
 * Load skill metadata from a SKILL.md file
 */
async function loadSkillFromFile(app: App, skillDir: string): Promise<SkillMetadata | null> {
  const skillFilePath = `${skillDir}/SKILL.md`;
  const file = app.vault.getAbstractFileByPath(skillFilePath);

  if (!file || !(file instanceof TFile)) {
    return null;
  }

  try {
    const content = await app.vault.read(file);
    return parseSkillMetadata(content, file.name);
  } catch (error) {
    console.error(`[SkillsLoader] Failed to load skill from ${skillFilePath}:`, error);
    return null;
  }
}

/**
 * Parse skill metadata from SKILL.md content
 */
function parseSkillMetadata(content: string, dirName: string): SkillMetadata {
  const lines = content.split('\n');
  let currentSection = '';
  let currentContent: string[] = [];

  const metadata: Partial<SkillMetadata> = {
    name: dirName,
    triggers: [],
    flow: [],
    errorHandling: []
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Section headers
    if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
      // Main title - skip
      continue;
    }

    if (trimmed === '## 基本信息') {
      currentSection = 'basic';
      currentContent = [];
    } else if (trimmed === '## 输入参数' || trimmed === '## 输出格式') {
      currentSection = trimmed.substring(3).trim();
      currentContent = [];
    } else if (trimmed === '## 执行流程' || trimmed === '## 错误处理') {
      currentSection = trimmed.substring(3).trim();
      currentContent = [];
    } else if (trimmed.startsWith('## ')) {
      currentSection = 'other';
      currentContent = [];
    }
    // Key-value pairs in basic info
    else if (currentSection === 'basic' && trimmed.includes(':')) {
      const colonIndex = trimmed.indexOf(':');
      const key = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim();

      switch (key) {
        case '**名称**':
        case '名称':
          metadata.name = value.replace(/\*\*/g, '');
          break;
        case '**功能**':
        case '功能':
          metadata.description = value.replace(/\*\*/g, '');
          break;
        case '**调用时机**':
        case '调用时机':
          metadata.triggers = value.split(/[,，]/).map(t => t.trim()).filter(Boolean);
          break;
      }
    }
    // Flow steps
    else if (currentSection === '执行流程' && trimmed.match(/^\d+\./)) {
      metadata.flow?.push(trimmed);
    }
    // Error handling
    else if (currentSection === '错误处理' && trimmed.includes(':')) {
      metadata.errorHandling?.push(trimmed);
    }
    // Code blocks for input/output format
    else if (trimmed.startsWith('```') && currentContent.length > 0) {
      // Skip code block markers
    }
    else if (currentSection === '输入参数' || currentSection === '输出格式') {
      if (trimmed && !trimmed.startsWith('```json') && !trimmed.startsWith('```')) {
        currentContent.push(trimmed);
      }
    }
  }

  return metadata as SkillMetadata;
}

/**
 * Load all skills from the vault
 */
export async function loadAllSkills(app: App): Promise<SkillMetadata[]> {
  const skillsDir = app.vault.getAbstractFileByPath(SKILLS_DIR);

  if (!skillsDir || !(skillsDir instanceof Object)) {
    console.log('[SkillsLoader] Skills directory not found:', SKILLS_DIR);
    return [];
  }

  const skills: SkillMetadata[] = [];

  // Iterate through skill directories
  // Note: This assumes TFolder - in Obsidian API we need to check
  const dir = skillsDir as any;
  if (dir.children) {
    for (const child of dir.children) {
      if (child instanceof Object && child.constructor.name === 'TFolder') {
        const skill = await loadSkillFromFile(app, `${SKILLS_DIR}/${child.name}`);
        if (skill) {
          skills.push(skill);
        }
      }
    }
  }

  return skills;
}

/**
 * Build skills section for system prompt from loaded skills
 */
export function buildSkillsSectionForPrompt(skills: SkillMetadata[]): string {
  if (skills.length === 0) {
    return '';
  }

  const lines: string[] = [
    '## 可用技能',
    '',
    '| 技能 | 功能 | 调用时机 |',
    '|------|------|---------|'
  ];

  for (const skill of skills) {
    const triggers = skill.triggers?.join(', ') || '-';
    lines.push(`| ${skill.name} | ${skill.description || '-'} | ${triggers} |`);
  }

  lines.push('');
  lines.push('详细技能定义请查阅 .lifewiki/skills/{skill_name}/SKILL.md');

  return lines.join('\n');
}

/**
 * Get skill names for quick reference
 */
export function getSkillNames(skills: SkillMetadata[]): string[] {
  return skills.map(s => s.name);
}
