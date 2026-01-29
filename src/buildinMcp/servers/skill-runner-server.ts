#!/usr/bin/env node
/**
 * Agent Skills 脚本执行 MCP 服务
 * 在技能目录下执行 .py / .sh / .js 脚本，供 Agent 通过 MCP 调用
 */
import { resolve } from 'path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { executeSkillScriptInDir } from '../../skills/executor.js';

let SKILLS_DIR = resolve('./src/buildinSkills');
const skillsDirIndex = process.argv.indexOf('--skills-dir');
if (skillsDirIndex !== -1 && process.argv[skillsDirIndex + 1]) {
  SKILLS_DIR = resolve(process.argv[skillsDirIndex + 1]);
}

const server = new Server(
  {
    name: 'skill-runner-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'execute_script',
        description:
          '在某个技能目录下执行脚本。当技能说明中要求运行脚本时使用。skill_id 为技能目录名，script_path 为相对路径（如 scripts/run.py）。',
        inputSchema: {
          type: 'object',
          properties: {
            skill_id: { type: 'string', description: '技能 ID（目录名）' },
            script_path: {
              type: 'string',
              description: '脚本相对路径，如 scripts/fill_form.py',
            },
            args: {
              type: 'array',
              items: { type: 'string' },
              description: '传递给脚本的命令行参数',
            },
          },
          required: ['skill_id', 'script_path'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== 'execute_script') {
    throw new Error(`未知工具: ${request.params.name}`);
  }
  const raw = request.params.arguments as Record<string, unknown>;
  const skillId = raw?.skill_id as string;
  const scriptPath = raw?.script_path as string;
  const args = Array.isArray(raw?.args) ? (raw.args as string[]) : [];

  if (!skillId || !scriptPath) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: '缺少 skill_id 或 script_path',
          }),
        },
      ],
    };
  }

  const result = await executeSkillScriptInDir(
    SKILLS_DIR,
    skillId,
    scriptPath,
    args
  );

  const payload = result.error
    ? { error: result.error, stdout: result.stdout, stderr: result.stderr }
    : { stdout: result.stdout, stderr: result.stderr, code: result.code };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload),
      },
    ],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`skill-runner 已启动，技能目录: ${SKILLS_DIR}`);
}

main().catch((err) => {
  console.error('skill-runner 错误:', err);
  process.exit(1);
});
