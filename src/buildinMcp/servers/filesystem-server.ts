#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, unlinkSync, rmdirSync } from 'fs';
import { resolve, join } from 'path';
import { existsSync } from 'fs';

// 默认根目录
let ROOT_DIR = resolve('./data');

// 从命令行参数获取根目录
const rootIndex = process.argv.indexOf('--root');
if (rootIndex !== -1 && process.argv[rootIndex + 1]) {
  ROOT_DIR = resolve(process.argv[rootIndex + 1]);
}

// 确保根目录存在
mkdirSync(ROOT_DIR, { recursive: true });

const server = new Server(
  {
    name: 'filesystem-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * 安全检查：确保路径在根目录内
 */
function validatePath(filePath: string): string {
  const fullPath = resolve(ROOT_DIR, filePath);
  const rootResolved = resolve(ROOT_DIR);
  
  if (!fullPath.startsWith(rootResolved)) {
    throw new Error(`路径 ${filePath} 超出允许范围`);
  }
  
  return fullPath;
}

// 列出可用工具
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'read_file',
        description: '读取文件内容',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: '文件路径（相对于根目录）' },
          },
          required: ['file_path'],
        },
      },
      {
        name: 'write_file',
        description: '写入文件内容',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: '文件路径（相对于根目录）' },
            content: { type: 'string', description: '要写入的内容' },
            mode: {
              type: 'string',
              enum: ['w', 'a'],
              description: "写入模式，'w' 覆盖，'a' 追加",
              default: 'w',
            },
          },
          required: ['file_path', 'content'],
        },
      },
      {
        name: 'list_directory',
        description: '列出目录内容',
        inputSchema: {
          type: 'object',
          properties: {
            dir_path: {
              type: 'string',
              description: '目录路径（相对于根目录），默认为当前目录',
              default: '.',
            },
          },
        },
      },
      {
        name: 'create_directory',
        description: '创建目录',
        inputSchema: {
          type: 'object',
          properties: {
            dir_path: { type: 'string', description: '目录路径（相对于根目录）' },
          },
          required: ['dir_path'],
        },
      },
      {
        name: 'delete_file',
        description: '删除文件或目录',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: '文件或目录路径（相对于根目录）' },
          },
          required: ['file_path'],
        },
      },
    ],
  };
});

// 处理工具调用
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    throw new Error('工具参数不能为空');
  }

  try {
    switch (name) {
      case 'read_file': {
        const filePath = args.file_path as string;
        const fullPath = validatePath(filePath);

        if (!existsSync(fullPath)) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: `文件不存在: ${filePath}`, path: filePath }),
              },
            ],
            isError: true,
          };
        }

        const stats = statSync(fullPath);
        if (!stats.isFile()) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: `路径不是文件: ${filePath}`, path: filePath }),
              },
            ],
            isError: true,
          };
        }

        const content = readFileSync(fullPath, 'utf-8');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                content,
                path: filePath,
                size: content.length,
              }),
            },
          ],
        };
      }

      case 'write_file': {
        const filePath = args.file_path as string;
        const content = args.content as string;
        const mode = (args.mode as 'w' | 'a') || 'w';
        const fullPath = validatePath(filePath);

        // 确保目录存在
        const dir = resolve(fullPath, '..');
        mkdirSync(dir, { recursive: true });

        if (mode === 'a' && existsSync(fullPath)) {
          const existing = readFileSync(fullPath, 'utf-8');
          writeFileSync(fullPath, existing + content, 'utf-8');
        } else {
          writeFileSync(fullPath, content, 'utf-8');
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                path: filePath,
                size: content.length,
                mode,
              }),
            },
          ],
        };
      }

      case 'list_directory': {
        const dirPath = (args.dir_path as string) || '.';
        const fullPath = validatePath(dirPath);

        if (!existsSync(fullPath)) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: `目录不存在: ${dirPath}`, path: dirPath }),
              },
            ],
            isError: true,
          };
        }

        const stats = statSync(fullPath);
        if (!stats.isDirectory()) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: `路径不是目录: ${dirPath}`, path: dirPath }),
              },
            ],
            isError: true,
          };
        }

        const items = readdirSync(fullPath).map((item) => {
          const itemPath = join(fullPath, item);
          const itemStats = statSync(itemPath);
          return {
            name: item,
            type: itemStats.isDirectory() ? 'directory' : 'file',
            size: itemStats.isFile() ? itemStats.size : null,
          };
        });

        items.sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                path: dirPath,
                items,
                count: items.length,
              }),
            },
          ],
        };
      }

      case 'create_directory': {
        const dirPath = args.dir_path as string;
        const fullPath = validatePath(dirPath);

        mkdirSync(fullPath, { recursive: true });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                path: dirPath,
              }),
            },
          ],
        };
      }

      case 'delete_file': {
        const filePath = args.file_path as string;
        const fullPath = validatePath(filePath);

        if (!existsSync(fullPath)) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: `路径不存在: ${filePath}`, path: filePath }),
              },
            ],
            isError: true,
          };
        }

        const stats = statSync(fullPath);
        if (stats.isFile()) {
          unlinkSync(fullPath);
        } else if (stats.isDirectory()) {
          // 递归删除目录
          const deleteRecursive = (dir: string): void => {
            const files = readdirSync(dir);
            for (const file of files) {
              const filePath = join(dir, file);
              const fileStats = statSync(filePath);
              if (fileStats.isDirectory()) {
                deleteRecursive(filePath);
              } else {
                unlinkSync(filePath);
              }
            }
            rmdirSync(dir);
          };
          deleteRecursive(fullPath);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                path: filePath,
              }),
            },
          ],
        };
      }

      default:
        throw new Error(`未知工具: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            path: (args as { file_path?: string; dir_path?: string }).file_path ||
              (args as { file_path?: string; dir_path?: string }).dir_path ||
              'unknown',
          }),
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`文件系统服务器已启动，根目录: ${ROOT_DIR}`);
}

main().catch((error) => {
  console.error('服务器错误:', error);
  process.exit(1);
});
