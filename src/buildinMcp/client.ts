import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { MCPServerConfig, Config } from '../types/config.js';
import { logger } from '../utils/logger.js';

export class MCPClient {
  private config: Config;
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, Transport> = new Map();

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * 连接所有配置的 MCP 服务器
   */
  async connectAll(): Promise<void> {
    const servers = this.config.mcpServers;
    logger.info(`找到 ${Object.keys(servers).length} 个 MCP 服务器配置`);

    for (const [serverName, serverConfig] of Object.entries(servers)) {
      await this.connectServer(serverName, serverConfig);
    }
  }

  /**
   * 连接单个 MCP 服务器
   */
  private async connectServer(serverName: string, serverConfig: MCPServerConfig): Promise<void> {
    logger.debug(`正在连接服务器: ${serverName}`);

    if (serverConfig.transport !== 'stdio') {
      logger.warn(`暂不支持 transport 类型: ${serverConfig.transport} (服务器: ${serverName})`);
      return;
    }

    try {
      logger.debug(`服务器命令: ${serverConfig.command} ${serverConfig.args.join(' ')}`);

      // 创建 stdio 传输
      const transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args,
        env: process.env as Record<string, string>,
      });

      // 创建客户端
      const client = new Client(
        {
          name: 'mcp-client',
          version: '1.0.0',
        },
        {
          capabilities: {},
        }
      );

      // 连接到服务器（会自动初始化）
      await client.connect(transport);
      logger.debug(`✓ 传输连接已建立并初始化: ${serverName}`);

      this.clients.set(serverName, client);
      this.transports.set(serverName, transport);
      logger.info(`✓ 已连接 MCP 服务器: ${serverName}`);
    } catch (error) {
      logger.error(`连接服务器 ${serverName} 时出错:`, error);
      throw error;
    }
  }

  /**
   * 列出所有或指定服务器的工具
   */
  async listTools(serverName?: string): Promise<Record<string, Tool[]>> {
    const tools: Record<string, Tool[]> = {};

    if (serverName) {
      const client = this.clients.get(serverName);
      if (!client) {
        throw new Error(`服务器 ${serverName} 未连接`);
      }
      const result = await client.listTools();
      tools[serverName] = result.tools;
    } else {
      for (const [name, client] of this.clients.entries()) {
        const result = await client.listTools();
        tools[name] = result.tools;
      }
    }

    return tools;
  }

  /**
   * 调用指定服务器的工具
   */
  async callTool(
    serverName: string,
    toolName: string,
    arguments_: Record<string, unknown>
  ): Promise<{ content: unknown[]; isError: boolean }> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`服务器 ${serverName} 未连接`);
    }

    const result = await client.callTool({
      name: toolName,
      arguments: arguments_,
    });

    const content = Array.isArray(result.content)
      ? result.content.map((item: unknown) => {
          if (
            typeof item === 'object' &&
            item !== null &&
            'type' in item &&
            item.type === 'text' &&
            'text' in item
          ) {
            return (item as { type: 'text'; text: string }).text;
          }
          return item;
        })
      : [];

    return {
      content,
      isError: Boolean(result.isError),
    };
  }

  /**
   * 断开所有服务器连接
   */
  async disconnectAll(): Promise<void> {
    for (const [name, client] of this.clients.entries()) {
      try {
        await client.close();
        logger.info(`✓ 已断开连接: ${name}`);
      } catch (error) {
        logger.warn(`断开连接 ${name} 时出错:`, error);
      }
    }
    this.clients.clear();
    this.transports.clear();
  }

  /**
   * 获取所有可用的服务器名称
   */
  getAvailableServers(): string[] {
    return Array.from(this.clients.keys());
  }
}
