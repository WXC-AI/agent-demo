/**
 * 技能脚本执行器
 * 在技能目录下安全执行脚本（工作目录为技能根目录），支持 .py / .sh / .js
 */

import { spawn } from 'child_process';
import { join, resolve } from 'path';
import type { Skill } from '../types/skill.js';
import { logger } from '../utils/logger.js';

const ALLOWED_EXTENSIONS = new Set(['.py', '.sh', '.js', '.mjs']);
const DEFAULT_TIMEOUT_MS = 30_000;

export interface ExecuteResult {
  stdout: string;
  stderr: string;
  code: number | null;
  error?: string;
}

/**
 * 根据技能根目录与 ID 执行脚本（供 MCP 等服务调用，无需 Skill 对象）
 */
export async function executeSkillScriptInDir(
  skillsDir: string,
  skillId: string,
  scriptRelativePath: string,
  args: string[] = [],
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<ExecuteResult> {
  const { resolve, join } = await import('path');
  const rootPath = resolve(join(resolve(skillsDir), skillId));
  const skill: Skill = {
    id: skillId,
    rootPath,
    metadata: { name: '', description: '' },
  };
  return executeSkillScript(skill, scriptRelativePath, args, timeoutMs);
}

/**
 * 在技能目录下执行脚本
 * @param skill 技能对象（含 rootPath）
 * @param scriptRelativePath 相对路径，如 scripts/run.py 或 fill_form.py
 * @param args 命令行参数
 * @param timeoutMs 超时毫秒
 */
export async function executeSkillScript(
  skill: Skill,
  scriptRelativePath: string,
  args: string[] = [],
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<ExecuteResult> {
  const normalized = scriptRelativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const ext = normalized.includes('.') ? normalized.slice(normalized.lastIndexOf('.')) : '';
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      stdout: '',
      stderr: '',
      code: null,
      error: `不允许的脚本扩展名: ${ext}，仅支持: ${[...ALLOWED_EXTENSIONS].join(', ')}`,
    };
  }

  const absolutePath = resolve(join(skill.rootPath, normalized));
  if (!absolutePath.startsWith(resolve(skill.rootPath))) {
    return {
      stdout: '',
      stderr: '',
      code: null,
      error: '脚本路径不能超出技能目录',
    };
  }

  const { access } = await import('fs/promises');
  try {
    await access(absolutePath);
  } catch {
    return {
      stdout: '',
      stderr: '',
      code: null,
      error: `脚本不存在: ${normalized}`,
    };
  }

  return new Promise((resolvePromise) => {
    const isJs = ext === '.js' || ext === '.mjs';
    const cmd = isJs ? 'node' : ext === '.py' ? 'python3' : 'sh';
    const cmdArgs = isJs ? [absolutePath, ...args] : ext === '.py' ? [absolutePath, ...args] : [absolutePath, ...args];

    const child = spawn(cmd, cmdArgs, {
      cwd: skill.rootPath,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      resolvePromise({
        stdout,
        stderr: stderr || '执行超时，已终止',
        code: null,
        error: `执行超时（${timeoutMs}ms）`,
      });
    }, timeoutMs);

    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      logger.info(`[Skills] 脚本执行结束: ${skill.id}/${normalized} code=${code} signal=${signal}`);
      resolvePromise({
        stdout,
        stderr,
        code,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      resolvePromise({
        stdout,
        stderr,
        code: null,
        error: err.message,
      });
    });
  });
}
