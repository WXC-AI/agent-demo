#!/usr/bin/env node
import { Command } from 'commander';
import { MCPAgent } from './agent.js';
import { loadConfig } from './utils/config.js';
import { logger } from './utils/logger.js';
import * as readline from 'readline';

// 加载环境变量
import 'dotenv/config';

const program = new Command();

program
  .name('ai-agent')
  .description('基于 MCP 的 AI Agent')
  .version('1.0.0')
  .option('-c, --config <path>', '配置文件路径', 'config.yaml')
  .option('-i, --interactive', '交互式模式', false)
  .argument('[query]', '查询内容（非交互模式下必需）')
  .action(async (query: string | undefined, options: { config: string; interactive: boolean }) => {
    try {
      logger.debug(`开始初始化 Agent，配置文件: ${options.config}`);
      logger.debug(`交互模式: ${options.interactive}, 查询: ${query}`);

      const config = loadConfig(options.config);
      
      // 设置日志级别
      if (config.logging?.level) {
        logger.setLevel(config.logging.level);
      }

      const agent = new MCPAgent(config);

      logger.debug('开始初始化 Agent...');
      await agent.initialize();
      logger.debug('Agent 初始化完成');

      if (options.interactive) {
        // 交互式模式
        console.log('🤖 AI Agent 已启动（输入 \'exit\' 或 \'quit\' 退出）\n');

        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const askQuestion = (): void => {
          rl.question('你: ', async (userInput) => {
            const input = userInput.trim();

            if (!input) {
              askQuestion();
              return;
            }

            if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit' || input === '退出') {
              console.log('再见！');
              rl.close();
              await agent.cleanup();
              process.exit(0);
              return;
            }

            try {
              process.stdout.write('Agent: ');
              const response = await agent.chat(input);
              console.log(response);
              console.log();
            } catch (error) {
              console.error('错误:', error);
            }

            askQuestion();
          });
        };

        askQuestion();

        // 处理 Ctrl+C
        rl.on('SIGINT', async () => {
          console.log('\n再见！');
          rl.close();
          await agent.cleanup();
          process.exit(0);
        });
      } else {
        // 单次查询模式
        if (!query) {
          console.error('错误: 非交互模式下需要提供查询内容');
          console.error('使用 --interactive 或 -i 进入交互模式');
          process.exit(1);
        }

        const response = await agent.chat(query);
        console.log(response);
        await agent.cleanup();
      }
    } catch (error) {
      console.error('错误:', error);
      if (error instanceof Error && error.stack) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

program.parse();
