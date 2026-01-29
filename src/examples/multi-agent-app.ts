/**
 * 多 Agent 应用示例
 * 
 * 演示如何使用 AgentFactory 创建多个 Agent，
 * 这些 Agent 共享统一的 MCP 服务器连接
 */

import { AgentFactory } from '../core/agent-factory.js';
import { loadConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';

async function main() {
  logger.info('=== 多 Agent 应用示例 ===\n');

  // 1. 加载配置
  const config = loadConfig();
  logger.info('✓ 配置加载完成\n');

  // 2. 创建 Agent 工厂
  const agentFactory = new AgentFactory(config);
  logger.info('✓ Agent 工厂创建完成\n');

  // 3. 创建多个 Agent（它们将共享 MCP 服务器连接）
  logger.info('创建多个 Agent...');
  const agent1 = await agentFactory.createAgent('agent-1', '你是一个专业的数学助手。');
  const agent2 = await agentFactory.createAgent('agent-2', '你是一个专业的时间管理助手。');
  const agent3 = await agentFactory.createAgent('agent-3', '你是一个专业的文件管理助手。');
  logger.info('✓ 所有 Agent 创建完成\n');

  // 4. 并发使用多个 Agent
  logger.info('=== 并发使用多个 Agent ===\n');

  const tasks = [
    {
      agent: agent1,
      message: '帮我计算 123 + 456 的结果',
      description: 'Agent 1: 数学计算',
    },
    {
      agent: agent2,
      message: '现在几点了？',
      description: 'Agent 2: 时间查询',
    },
    {
      agent: agent3,
      message: '列出当前目录下的文件',
      description: 'Agent 3: 文件操作',
    },
  ];

  // 并发执行所有任务
  const results = await Promise.all(
    tasks.map(async (task) => {
      logger.info(`开始执行: ${task.description}`);
      const startTime = Date.now();
      const result = await task.agent.chat(task.message);
      const duration = Date.now() - startTime;
      logger.info(`✓ 完成: ${task.description} (耗时: ${duration}ms)\n`);
      return {
        agent: task.agent.getId(),
        description: task.description,
        result,
        duration,
      };
    })
  );

  // 5. 显示结果
  logger.info('=== 执行结果 ===\n');
  for (const result of results) {
    logger.info(`[${result.agent}] ${result.description}`);
    logger.info(`结果: ${result.result}`);
    logger.info(`耗时: ${result.duration}ms\n`);
  }

  // 6. 验证所有 Agent 共享同一个 MCP 服务管理器
  const mcpServiceManager = agentFactory.getMCPServiceManager();
  const servers = mcpServiceManager.getAvailableServers();
  logger.info(`=== MCP 服务器状态 ===`);
  logger.info(`所有 Agent 共享的 MCP 服务器: ${servers.join(', ')}`);
  logger.info(`服务器数量: ${servers.length}\n`);

  // 7. 清理资源（可选，因为 MCP 服务管理器是单例，可能被其他 Agent 使用）
  // await mcpServiceManager.disconnectAll();
}

// 运行示例
main().catch((error) => {
  logger.error('应用运行出错:', error);
  process.exit(1);
});
