/**
 * 使用 LLM 发现与用户请求相关的技能
 * 根据用户消息和技能元数据，调用 LLM 返回应触发的 skill_id 列表
 */

import type OpenAI from 'openai';
import type { Skill } from '../types/skill.js';
import { logger } from '../utils/logger.js';

const DISCOVERY_SYSTEM = `你是一个技能选择器。根据用户的消息和下面的技能列表，判断哪些技能与用户请求相关（可能 0 个、1 个或多个）。
只输出一个 JSON 数组，包含相关技能的 id（目录名），不要输出任何其他文字、解释或 markdown。
例如：["example","pdf-export"]
若无相关技能则输出：[]`;

function buildDiscoveryUserMessage(userMessage: string, skills: Skill[]): string {
  const list = skills
    .map((s) => `- id: "${s.id}", name: ${s.metadata.name}, description: ${s.metadata.description}`)
    .join('\n');
  return `可用技能：\n${list}\n\n用户消息：\n${userMessage}\n\n请输出相关技能的 id 组成的 JSON 数组：`;
}

function parseSkillIds(content: string | null): string[] {
  if (!content || !content.trim()) return [];
  const trimmed = content.trim();
  // 允许被 markdown 代码块包裹
  const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
  const jsonStr = jsonMatch ? jsonMatch[0] : trimmed;
  try {
    const arr = JSON.parse(jsonStr) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

/**
 * 使用 LLM 发现与用户消息相关的技能
 * @param client OpenAI 兼容客户端
 * @param model 模型名
 * @param userMessage 用户消息
 * @param skills 全部技能（仅用 id 与 metadata）
 * @returns 相关技能列表；失败时返回空数组
 */
export async function discoverSkillsWithLLM(
  client: OpenAI,
  model: string,
  userMessage: string,
  skills: Skill[]
): Promise<Skill[]> {
  if (skills.length === 0) return [];

  const systemContent = DISCOVERY_SYSTEM;
  const userContent = buildDiscoveryUserMessage(userMessage, skills);

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent },
      ],
      max_tokens: 256,
      temperature: 0,
    });

    const content = response.choices[0]?.message?.content ?? null;
    const ids = parseSkillIds(content);
    const idSet = new Set(ids);
    const matched = skills.filter((s) => idSet.has(s.id));
    logger.info(`[Skills] LLM 发现技能: ${ids.length} 个 -> ${matched.map((s) => s.id).join(', ') || '无'}`);
    return matched;
  } catch (err) {
    logger.warn(`[Skills] LLM 发现技能失败: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}
