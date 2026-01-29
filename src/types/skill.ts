/**
 * Agent Skills 类型定义（符合 Anthropic 规范）
 * @see https://docs.anthropic.com/en/docs/agents-and-tools/agent-skills/overview
 */

/** SKILL.md 的 YAML frontmatter 元数据 */
export interface SkillMetadata {
  /** 技能名称：小写字母、数字、连字符，最多 64 字符 */
  name: string;
  /** 简短描述：说明技能做什么、何时使用，最多 1024 字符 */
  description: string;
}

/** 单个技能的完整信息 */
export interface Skill {
  /** 技能 ID，通常为目录名 */
  id: string;
  /** 技能根目录的绝对路径 */
  rootPath: string;
  /** 元数据（来自 SKILL.md frontmatter） */
  metadata: SkillMetadata;
  /** SKILL.md 正文内容（Level 2 按需加载） */
  body?: string;
}

/** 技能脚本执行参数 */
export interface SkillScriptExecuteParams {
  /** 技能 ID（目录名） */
  skill_id: string;
  /** 脚本相对路径，如 scripts/run.js 或 fill_form.py */
  script_path: string;
  /** 传递给脚本的参数（字符串数组，对应命令行 args） */
  args?: string[];
}
