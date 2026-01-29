/**
 * Agent Skills 加载器
 * 符合 Anthropic 规范：从目录扫描 SKILL.md，解析 frontmatter 与正文，按需匹配
 */

import { readdir, readFile, access } from 'fs/promises';
import { join, resolve } from 'path';
import { parse } from 'yaml';
import type { Skill, SkillMetadata } from '../types/skill.js';
import { logger } from '../utils/logger.js';

const SKILL_FILE = 'SKILL.md';
const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

/**
 * 解析 SKILL.md 内容：提取 YAML frontmatter 与正文
 */
export function parseSKILLMd(content: string): { metadata: SkillMetadata; body: string } {
  const match = content.trim().match(FRONTMATTER_REGEX);
  if (!match) {
    throw new Error('SKILL.md 必须包含 YAML frontmatter（--- ... ---）');
  }
  const [, yamlStr, body] = match;
  const parsed = parse(yamlStr) as Record<string, unknown>;
  const name = parsed?.name;
  const description = parsed?.description;
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('SKILL.md frontmatter 必须包含 name（非空字符串）');
  }
  if (typeof description !== 'string' || !description.trim()) {
    throw new Error('SKILL.md frontmatter 必须包含 description（非空字符串）');
  }
  return {
    metadata: { name: name.trim(), description: description.trim() },
    body: body?.trim() ?? '',
  };
}

/**
 * 从技能目录加载所有技能（仅元数据，不读正文）
 * 若目录不存在则返回空数组，不抛错
 */
export async function loadSkillsFromDir(dirPath: string): Promise<Skill[]> {
  const resolved = resolve(dirPath);
  try {
    await access(resolved);
  } catch {
    return [];
  }
  const entries = await readdir(resolved, { withFileTypes: true });
  const skills: Skill[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillDir = join(resolved, entry.name);
    const skillPath = join(skillDir, SKILL_FILE);
    try {
      const content = await readFile(skillPath, 'utf-8');
      const { metadata } = parseSKILLMd(content);
      skills.push({
        id: entry.name,
        rootPath: skillDir,
        metadata,
      });
      logger.debug(`[Skills] 已加载技能元数据: ${entry.name} (${metadata.name})`);
    } catch (err) {
      logger.warn(`[Skills] 跳过目录 ${entry.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return skills;
}

/**
 * 加载单个技能的 SKILL.md 正文（Level 2）
 */
export async function loadSkillBody(skill: Skill): Promise<string> {
  const skillPath = join(skill.rootPath, SKILL_FILE);
  const content = await readFile(skillPath, 'utf-8');
  const { body } = parseSKILLMd(content);
  return body;
}

/**
 * 根据用户消息匹配应触发的技能（简单关键词匹配：description 或 name 与消息交集）
 */
export function matchSkills(userMessage: string, skills: Skill[]): Skill[] {
  const lower = userMessage.toLowerCase().trim();
  if (!lower) return [];

  return skills.filter((skill) => {
    const desc = skill.metadata.description.toLowerCase();
    const name = skill.metadata.name.toLowerCase();
    const id = skill.id.toLowerCase();
    return (
      desc.includes(lower) ||
      lower.includes(name) ||
      lower.includes(id) ||
      desc.split(/\s+/).some((word) => word.length > 2 && lower.includes(word)) ||
      lower.split(/\s+/).some((word) => word.length > 2 && (desc.includes(word) || name.includes(word)))
    );
  });
}
