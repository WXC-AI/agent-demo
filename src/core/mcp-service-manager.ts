/**
 * MCP 服务管理器
 * 
 * 单例模式，统一管理所有 MCP 服务器连接
 * 所有 Agent 共享这个管理器，避免重复创建连接
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { MCPServerConfig, Config } from '../types/config.js';
import { logger } from '../utils/logger.js';

export class MCPServiceManager {
  private static instance: MCPServiceManager | null = null;
  private config: Config;
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, Transport> = new Map();
  private toolsCache: Record<string, Tool[]> | null = null;
  private isInitialized: boolean = false;
  private initPromise: Promise<void> | null = null;
  private readonly lock = new Map<string, Promise<void>>(); // 连接锁，防止重复连接

  private constructor(config: Config) {
    this.config = config;
  }

  /**
   * 获取单例实例
   */
  static getInstance(config?: Config): MCPServiceManager {
    if (!MCPServiceManager.instance) {
      if (!config) {
        throw new Error('首次创建 MCPServiceManager 需要提供 config');
      }
      MCPServiceManager.instance = new MCPServiceManager(config);
    }
    return MCPServiceManager.instance;
  }

  /**
   * 初始化所有 MCP 服务器连接
   * 支持并发调用，只会初始化一次
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initPromise) {
      // 如果正在初始化，等待初始化完成
      return this.initPromise;
    }

    this.initPromise = this._doInitialize();
    try {
      await this.initPromise;
      this.isInitialized = true;
    } finally {
      this.initPromise = null;
    }
  }

  private async _doInitialize(): Promise<void> {
    const servers = this.config.mcpServers;
    logger.info(`[MCPServiceManager] 初始化 ${Object.keys(servers).length} 个 MCP 服务器`);

    // 并发连接所有服务器
    const connectPromises = Object.entries(servers).map(([serverName, serverConfig]) =>
      this.connectServer(serverName, serverConfig)
    );

    await Promise.all(connectPromises);

    // 缓存工具列表
    await this.refreshToolsCache();

    logger.info(
      `[MCPServiceManager] ✓ 初始化完成，已连接 ${this.clients.size} 个 MCP 服务器`
    );
  }

  /**
   * 连接单个 MCP 服务器（带锁，防止重复连接）
   */
  private async connectServer(
    serverName: string,
    serverConfig: MCPServerConfig
  ): Promise<void> {
    // 如果已经连接，直接返回
    if (this.clients.has(serverName)) {
      logger.debug(`[MCPServiceManager] 服务器 ${serverName} 已连接，跳过`);
      return;
    }

    // 如果正在连接，等待连接完成
    if (this.lock.has(serverName)) {
      await this.lock.get(serverName);
      return;
    }

    // 创建连接锁
    const connectPromise = this._doConnectServer(serverName, serverConfig);
    this.lock.set(serverName, connectPromise);

    try {
      await connectPromise;
    } finally {
      this.lock.delete(serverName);
    }
  }

  private async _doConnectServer(
    serverName: string,
    serverConfig: MCPServerConfig
  ): Promise<void> {
    logger.debug(`[MCPServiceManager] 正在连接服务器: ${serverName}`);

    if (serverConfig.transport !== 'stdio') {
      logger.warn(
        `[MCPServiceManager] 暂不支持 transport 类型: ${serverConfig.transport} (服务器: ${serverName})`
      );
      return;
    }

    try {
      // 创建 stdio 传输
      const transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args,
        env: process.env as Record<string, string>,
      });

      // 创建客户端
      const client = new Client(
        {
          name: 'mcp-service-manager',
          version: '1.0.0',
        },
        {
          capabilities: {},
        }
      );

      // 连接到服务器（会自动初始化）
      await client.connect(transport);
      logger.debug(`[MCPServiceManager] ✓ 传输连接已建立并初始化: ${serverName}`);

      this.clients.set(serverName, client);
      this.transports.set(serverName, transport);
      logger.info(`[MCPServiceManager] ✓ 已连接 MCP 服务器: ${serverName}`);
    } catch (error) {
      logger.error(`[MCPServiceManager] 连接服务器 ${serverName} 时出错:`, error);
      throw error;
    }
  }

  /**
   * 刷新工具缓存
   */
  async refreshToolsCache(): Promise<void> {
    const tools: Record<string, Tool[]> = {};

    for (const [name, client] of this.clients.entries()) {
      try {
        const result = await client.listTools();
        tools[name] = result.tools;
      } catch (error) {
        logger.error(`[MCPServiceManager] 获取服务器 ${name} 的工具列表时出错:`, error);
        tools[name] = [];
      }
    }

    this.toolsCache = tools;
    logger.debug(
      `[MCPServiceManager] ✓ 工具缓存已刷新，共 ${Object.keys(tools).length} 个服务器`
    );
  }

  /**
   * 获取所有工具（使用缓存）
   */
  async listTools(serverName?: string): Promise<Record<string, Tool[]>> {
    // 确保已初始化
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.toolsCache) {
      await this.refreshToolsCache();
    }

    if (serverName) {
      return {
        [serverName]: this.toolsCache![serverName] || [],
      };
    }

    return { ...this.toolsCache! };
  }

  /**
   * 调用指定服务器的工具（线程安全）
   */
  async callTool(
    serverName: string,
    toolName: string,
    arguments_: Record<string, unknown>
  ): Promise<{ content: unknown[]; isError: boolean }> {
    // 确保已初始化
    if (!this.isInitialized) {
      await this.initialize();
    }

    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`[MCPServiceManager] 服务器 ${serverName} 未连接`);
    }

    try {
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
    } catch (error) {
      logger.error(
        `[MCPServiceManager] 调用工具 ${serverName}::${toolName} 时出错:`,
        error
      );
      throw error;
    }
  }

  /**
   * 获取所有可用的服务器名称
   */
  getAvailableServers(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * 检查服务器是否已连接
   */
  isServerConnected(serverName: string): boolean {
    return this.clients.has(serverName);
  }

  /**
   * 断开所有服务器连接
   */
  async disconnectAll(): Promise<void> {
    for (const [name, client] of this.clients.entries()) {
      try {
        await client.close();
        logger.info(`[MCPServiceManager] ✓ 已断开连接: ${name}`);
      } catch (error) {
        logger.warn(`[MCPServiceManager] 断开连接 ${name} 时出错:`, error);
      }
    }
    this.clients.clear();
    this.transports.clear();
    this.toolsCache = null;
    this.isInitialized = false;
  }

  /**
   * 重置单例（主要用于测试）
   */
  static resetInstance(): void {
    MCPServiceManager.instance = null;
  }
}
