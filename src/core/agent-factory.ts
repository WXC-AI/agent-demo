/**
 * Agent 工厂
 * 
 * 负责创建 Agent 实例，并注入共享的 MCP 服务管理器
 */

import type { Config } from '../types/config.js';
import { MCPServiceManager } from './mcp-service-manager.js';
import { SharedMCPAgent } from './shared-mcp-agent.js';
import { logger } from '../utils/logger.js';

export class AgentFactory {
  private mcpServiceManager: MCPServiceManager;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    // 获取或创建 MCP 服务管理器单例
    this.mcpServiceManager = MCPServiceManager.getInstance(config);
  }

  /**
   * 创建 Agent 实例
   * 
   * @param agentId - Agent 的唯一标识符（可选）
   * @param systemPrompt - 自定义系统提示词（可选）
   * @returns Agent 实例
   */
  async createAgent(
    agentId?: string,
    systemPrompt?: string
  ): Promise<SharedMCPAgent> {
    logger.debug(`[AgentFactory] 创建 Agent: ${agentId || 'anonymous'}`);

    // 确保 MCP 服务管理器已初始化
    await this.mcpServiceManager.initialize();

    // 创建 Agent 实例，注入共享的 MCP 服务管理器
    const agent = new SharedMCPAgent(
      this.config,
      this.mcpServiceManager,
      agentId,
      systemPrompt
    );

    logger.info(`[AgentFactory] ✓ Agent 创建成功: ${agentId || 'anonymous'}`);
    return agent;
  }

  /**
   * 批量创建 Agent
   */
  async createAgents(
    count: number,
    agentIdPrefix: string = 'agent'
  ): Promise<SharedMCPAgent[]> {
    logger.debug(`[AgentFactory] 批量创建 ${count} 个 Agent`);

    const agents: SharedMCPAgent[] = [];
    for (let i = 0; i < count; i++) {
      const agentId = `${agentIdPrefix}-${i + 1}`;
      const agent = await this.createAgent(agentId);
      agents.push(agent);
    }

    logger.info(`[AgentFactory] ✓ 批量创建完成，共 ${agents.length} 个 Agent`);
    return agents;
  }

  /**
   * 获取 MCP 服务管理器（用于高级操作）
   */
  getMCPServiceManager(): MCPServiceManager {
    return this.mcpServiceManager;
  }
}
