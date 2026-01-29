#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  {
    name: 'calculator-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 列出可用工具
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'add',
        description: '执行加法运算',
        inputSchema: {
          type: 'object',
          properties: {
            a: { type: 'number', description: '第一个数字' },
            b: { type: 'number', description: '第二个数字' },
          },
          required: ['a', 'b'],
        },
      },
      {
        name: 'subtract',
        description: '执行减法运算',
        inputSchema: {
          type: 'object',
          properties: {
            a: { type: 'number', description: '被减数' },
            b: { type: 'number', description: '减数' },
          },
          required: ['a', 'b'],
        },
      },
      {
        name: 'multiply',
        description: '执行乘法运算',
        inputSchema: {
          type: 'object',
          properties: {
            a: { type: 'number', description: '第一个数字' },
            b: { type: 'number', description: '第二个数字' },
          },
          required: ['a', 'b'],
        },
      },
      {
        name: 'divide',
        description: '执行除法运算',
        inputSchema: {
          type: 'object',
          properties: {
            a: { type: 'number', description: '被除数' },
            b: { type: 'number', description: '除数' },
          },
          required: ['a', 'b'],
        },
      },
      {
        name: 'power',
        description: '计算幂运算',
        inputSchema: {
          type: 'object',
          properties: {
            base: { type: 'number', description: '底数' },
            exponent: { type: 'number', description: '指数' },
          },
          required: ['base', 'exponent'],
        },
      },
      {
        name: 'calculate',
        description: '计算数学表达式（支持基本数学运算）',
        inputSchema: {
          type: 'object',
          properties: {
            expression: { type: 'string', description: '数学表达式字符串' },
          },
          required: ['expression'],
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
      case 'add': {
        const result = (args.a as number) + (args.b as number);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                result,
                operation: 'add',
                a: args.a,
                b: args.b,
              }),
            },
          ],
        };
      }

      case 'subtract': {
        const result = (args.a as number) - (args.b as number);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                result,
                operation: 'subtract',
                a: args.a,
                b: args.b,
              }),
            },
          ],
        };
      }

      case 'multiply': {
        const result = (args.a as number) * (args.b as number);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                result,
                operation: 'multiply',
                a: args.a,
                b: args.b,
              }),
            },
          ],
        };
      }

      case 'divide': {
        if ((args.b as number) === 0) {
          throw new Error('除数不能为0');
        }
        const result = (args.a as number) / (args.b as number);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                result,
                operation: 'divide',
                a: args.a,
                b: args.b,
              }),
            },
          ],
        };
      }

      case 'power': {
        const result = Math.pow(args.base as number, args.exponent as number);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                result,
                operation: 'power',
                base: args.base,
                exponent: args.exponent,
              }),
            },
          ],
        };
      }

      case 'calculate': {
        // 安全的表达式计算（仅支持基本数学运算）
        const expression = args.expression as string;
        // 移除所有非数字、运算符和空格的字符以提高安全性
        const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '');
        try {
          // 使用 Function 构造函数而不是 eval，更安全
          const result = new Function('return ' + sanitized)();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  result,
                  expression,
                }),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: error instanceof Error ? error.message : String(error),
                  expression,
                }),
              },
            ],
            isError: true,
          };
        }
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
  console.error('计算器服务器已启动');
}

main().catch((error) => {
  console.error('服务器错误:', error);
  process.exit(1);
});
