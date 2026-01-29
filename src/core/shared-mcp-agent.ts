/**
 * 共享 MCP Agent
 * 
 * 使用共享的 MCP 服务管理器，而不是每个 Agent 创建独立的连接
 */

import OpenAI from 'openai';
import type { Config } from '../types/config.js';
import { MCPServiceManager } from './mcp-service-manager.js';
import { logger } from '../utils/logger.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export class SharedMCPAgent {
  private config: Config;
  private client: OpenAI;
  private mcpServiceManager: MCPServiceManager;
  private agentId: string;
  private systemPrompt: string;
  private availableTools: Record<string, Tool[]> = {};

  constructor(
    config: Config,
    mcpServiceManager: MCPServiceManager,
    agentId: string = 'anonymous',
    systemPrompt?: string
  ) {
    this.config = config;
    this.mcpServiceManager = mcpServiceManager;
    this.agentId = agentId;

    // 初始化 OpenAI 客户端
    const deepseekConfig = config.deepseek;
    this.client = new OpenAI({
      apiKey: deepseekConfig.apiKey,
      baseURL: deepseekConfig.baseUrl,
    });

    // 设置系统提示词
    this.systemPrompt =
      systemPrompt ||
      `你是一个智能助手（Agent ID: ${agentId}），可以通过调用各种工具来帮助用户完成任务。

可用的工具来自多个 MCP 服务器：
- time: 时间相关工具
- calculator: 数学计算工具
- filesystem: 文件系统操作工具

当需要调用工具时，使用工具名称格式：server__tool_name（例如：calculator__add）

请根据用户的需求，选择合适的工具来完成任务。如果需要多个步骤，可以连续调用多个工具。`;

    logger.debug(`[SharedMCPAgent:${agentId}] Agent 初始化完成`);
  }

  /**
   * 初始化 Agent（加载工具列表）
   */
  async initialize(): Promise<void> {
    logger.debug(`[SharedMCPAgent:${this.agentId}] 开始初始化...`);

    // 确保 MCP 服务管理器已初始化
    await this.mcpServiceManager.initialize();

    // 从共享的 MCP 服务管理器获取工具列表
    this.availableTools = await this.mcpServiceManager.listTools();

    logger.info(
      `[SharedMCPAgent:${this.agentId}] ✓ 初始化完成，可用工具来自 ${Object.keys(this.availableTools).length} 个服务器`
    );
  }

  /**
   * 将 MCP 工具格式转换为 OpenAI 工具格式
   */
  private formatToolsForOpenAI(): OpenAI.Chat.Completions.ChatCompletionTool[] {
    const openaiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [];

    for (const [serverName, tools] of Object.entries(this.availableTools)) {
      for (const tool of tools) {
        openaiTools.push({
          type: 'function',
          function: {
            name: `${serverName}__${tool.name}`,
            description: `[来自 ${serverName} 服务器] ${tool.description || '无描述'}`,
            parameters: tool.inputSchema as OpenAI.FunctionParameters,
          },
        });
      }
    }

    return openaiTools;
  }

  /**
   * 执行工具调用（通过共享的 MCP 服务管理器）
   */
  private async executeToolCall(
    toolName: string,
    arguments_: Record<string, unknown>
  ): Promise<unknown> {
    if (!toolName.includes('__')) {
      return { error: `无效的工具名称格式: ${toolName}` };
    }

    const [serverName, actualToolName] = toolName.split('__', 2);

    try {
      // 通过共享的 MCP 服务管理器调用工具
      const result = await this.mcpServiceManager.callTool(
        serverName,
        actualToolName,
        arguments_
      );

      // 解析 JSON 字符串结果
      if (result.content.length === 1 && typeof result.content[0] === 'string') {
        try {
          return JSON.parse(result.content[0]);
        } catch {
          return result.content[0];
        }
      }
      return result.content;
    } catch (error) {
      logger.error(
        `[SharedMCPAgent:${this.agentId}] 执行工具调用失败: ${toolName}`,
        error
      );
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 与 Agent 对话
   */
  async chat(userMessage: string, maxIterations: number = 10): Promise<string> {
    logger.debug(`[SharedMCPAgent:${this.agentId}] 收到用户消息: ${userMessage}`);

    // 确保已初始化
    if (Object.keys(this.availableTools).length === 0) {
      await this.initialize();
    }

    // 获取工具列表
    const tools = this.formatToolsForOpenAI();
    logger.debug(
      `[SharedMCPAgent:${this.agentId}] 格式化完成，共 ${tools.length} 个工具`
    );

    const messages: Array<{
      role: 'system' | 'user' | 'assistant' | 'tool';
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
      tool_call_id?: string;
      name?: string;
    }> = [
      {
        role: 'user',
        content: userMessage,
      },
    ];

    let iteration = 0;
    while (iteration < maxIterations) {
      iteration++;
      logger.debug(
        `[SharedMCPAgent:${this.agentId}] 第 ${iteration} 次迭代，调用 DeepSeek API...`
      );

      // 调用 DeepSeek API（OpenAI 兼容接口）
      const response = await this.client.chat.completions.create({
        model: this.config.deepseek.model,
        messages: [
          { role: 'system', content: this.systemPrompt },
          ...messages,
        ] as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        tools: tools.length > 0 ? tools : undefined,
        temperature: this.config.deepseek.temperature,
        max_tokens: 4096,
      });

      logger.debug(`[SharedMCPAgent:${this.agentId}] 收到 API 响应`);
      const assistantMessage = response.choices[0]?.message;
      if (!assistantMessage) {
        return '抱歉，我无法处理这个请求。';
      }

      // 添加助手消息
      const assistantMsg: {
        role: 'assistant';
        content: string | null;
        tool_calls?: Array<{
          id: string;
          type: 'function';
          function: {
            name: string;
            arguments: string;
          };
        }>;
      } = {
        role: 'assistant',
        content: assistantMessage.content,
      };

      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        assistantMsg.tool_calls = assistantMessage.tool_calls.map((tc) => ({
          id: tc.id,
          type: tc.type,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        }));
      }

      messages.push(assistantMsg);

      // 检查是否有工具调用
      const toolCalls = assistantMessage.tool_calls || [];
      logger.debug(
        `[SharedMCPAgent:${this.agentId}] 工具调用数量: ${toolCalls.length}`
      );

      if (toolCalls.length === 0) {
        // 没有工具调用，返回最终回复
        logger.debug(`[SharedMCPAgent:${this.agentId}] 没有工具调用，返回最终回复`);
        return assistantMessage.content || '抱歉，我无法处理这个请求。';
      }

      // 执行工具调用
      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);
        logger.info(
          `[SharedMCPAgent:${this.agentId}] 🔧 调用工具: ${functionName} with ${JSON.stringify(functionArgs)}`
        );

        const result = await this.executeToolCall(functionName, functionArgs);

        // 添加工具结果消息
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: functionName,
          content: JSON.stringify(result),
        });
      }
    }

    return '已达到最大迭代次数，请简化您的请求。';
  }

  /**
   * 获取 Agent ID
   */
  getId(): string {
    return this.agentId;
  }

  /**
   * 获取可用的工具列表
   */
  getAvailableTools(): Record<string, Tool[]> {
    return { ...this.availableTools };
  }

  /**
   * 刷新工具列表（从 MCP 服务管理器重新获取）
   */
  async refreshTools(): Promise<void> {
    await this.mcpServiceManager.refreshToolsCache();
    this.availableTools = await this.mcpServiceManager.listTools();
    logger.debug(
      `[SharedMCPAgent:${this.agentId}] ✓ 工具列表已刷新`
    );
  }
}
