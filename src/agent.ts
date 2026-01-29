import { resolve } from 'path';
import OpenAI from 'openai';
import type { Config } from './types/config.js';
import type { Skill } from './types/skill.js';
import { MCPClient } from './buildinMcp/client.js';
import {
  loadSkillsFromDir,
  loadSkillBody,
  matchSkills,
} from './skills/loader.js';
import { discoverSkillsWithLLM } from './skills/discovery.js';
import { logger } from './utils/logger.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export class MCPAgent {
  private config: Config;
  private client: OpenAI;
  private mcpClient: MCPClient | null = null;
  private availableTools: Record<string, Tool[]> = {};
  private skills: Skill[] = [];
  private skillsDir: string | null = null;

  constructor(config: Config) {
    this.config = config;
    logger.debug('初始化 MCPAgent');

    const deepseekConfig = config.deepseek;
    this.client = new OpenAI({
      apiKey: deepseekConfig.apiKey,
      baseURL: deepseekConfig.baseUrl,
    });

    logger.debug(`初始化 DeepSeek 客户端，模型: ${deepseekConfig.model}`);
  }

  /**
   * 初始化 MCP 客户端并连接所有服务器；若配置了 skills，则加载技能元数据
   */
  async initialize(): Promise<void> {
    logger.debug('创建 MCP 客户端...');
    this.mcpClient = new MCPClient(this.config);
    logger.debug('开始连接所有 MCP 服务器...');
    await this.mcpClient.connectAll();
    logger.debug('获取可用工具列表...');
    this.availableTools = await this.mcpClient.listTools();
    logger.debug(`找到 ${Object.keys(this.availableTools).length} 个服务器的工具`);

    const skillsDirConfig = this.config.skills?.directory ?? './src/buildinSkills';
    this.skillsDir = resolve(skillsDirConfig);
    try {
      this.skills = await loadSkillsFromDir(this.skillsDir);
      logger.info(`✓ 已加载 ${this.skills.length} 个技能（目录: ${this.skillsDir}）`);
    } catch (err) {
      logger.warn(`[Skills] 加载技能目录失败: ${err instanceof Error ? err.message : String(err)}`);
    }

    logger.info(
      `✓ Agent 初始化完成，已连接 ${this.mcpClient.getAvailableServers().length} 个 MCP 服务器`
    );
  }

  /**
   * 将 MCP 工具格式转换为 OpenAI 工具格式（含 skills 的 execute_script，由 MCP 服务提供）
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
   * 执行工具调用（skills__execute_script 由 MCP 服务 skills 提供）
   */
  private async executeToolCall(
    toolName: string,
    arguments_: Record<string, unknown>
  ): Promise<unknown> {
    if (!toolName.includes('__')) {
      return { error: `无效的工具名称格式: ${toolName}` };
    }

    const [serverName, actualToolName] = toolName.split('__', 2);

    if (!this.mcpClient) {
      throw new Error('MCP 客户端未初始化');
    }

    try {
      const result = await this.mcpClient.callTool(serverName, actualToolName, arguments_);
      if (result.content.length === 1 && typeof result.content[0] === 'string') {
        try {
          return JSON.parse(result.content[0]);
        } catch {
          return result.content[0];
        }
      }
      return result.content;
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 与 Agent 对话
   */
  async chat(userMessage: string, maxIterations: number = 10): Promise<string> {
    logger.debug(`收到用户消息: ${userMessage}`);

    if (!this.mcpClient) {
      logger.debug('MCP 客户端未初始化，开始初始化...');
      await this.initialize();
    }

    // 获取工具列表
    logger.debug('格式化工具列表...');
    const tools = this.formatToolsForOpenAI();
    logger.debug(`格式化完成，共 ${tools.length} 个工具`);

    // 构建系统提示：基础 + 技能元数据（Level 1）+ 匹配到的技能正文（Level 2）
    let systemPrompt = `你是一个智能助手，可以通过调用各种工具来帮助用户完成任务。

可用的工具来自多个 MCP 服务器：
- time: 时间相关工具
- calculator: 数学计算工具
- filesystem: 文件系统操作工具

当需要调用工具时，使用工具名称格式：server__tool_name（例如：calculator__add）

请根据用户的需求，选择合适的工具来完成任务。如果需要多个步骤，可以连续调用多个工具。`;

    if (this.skills.length > 0) {
      systemPrompt += `\n\n## 可用技能（按需使用）
以下技能可在相关任务时使用；触发后请遵循其 SKILL 说明。
`;
      for (const s of this.skills) {
        systemPrompt += `- **${s.metadata.name}** (技能 ID: \`${s.id}\`): ${s.metadata.description}\n`;
      }
    }

    let matchedSkills: Skill[];
    try {
      matchedSkills = await discoverSkillsWithLLM(
        this.client,
        this.config.deepseek.model,
        userMessage,
        this.skills
      );
    } catch {
      matchedSkills = matchSkills(userMessage, this.skills);
      logger.debug('[Skills] 已回退到关键词匹配');
    }
    if (matchedSkills.length > 0) {
      for (const skill of matchedSkills) {
        try {
          const body = await loadSkillBody(skill);
          if (body) {
            systemPrompt += `\n\n---\n## 技能说明: ${skill.metadata.name} (${skill.id})\n\n${body}`;
            logger.debug(`[Skills] 已注入技能正文: ${skill.id}`);
          }
        } catch (err) {
          logger.warn(`[Skills] 加载技能正文失败 ${skill.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

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
      logger.debug(`第 ${iteration} 次迭代，调用 DeepSeek API...`);

      // 调用 DeepSeek API（OpenAI 兼容接口）
      const response = await this.client.chat.completions.create({
        model: this.config.deepseek.model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ] as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        tools: tools.length > 0 ? tools : undefined,
        temperature: this.config.deepseek.temperature,
        max_tokens: 4096,
      });

      logger.debug('收到 API 响应');
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
      logger.debug(`工具调用数量: ${toolCalls.length}`);

      if (toolCalls.length === 0) {
        // 没有工具调用，返回最终回复
        logger.debug('没有工具调用，返回最终回复');
        return assistantMessage.content || '抱歉，我无法处理这个请求。';
      }

      // 执行工具调用
      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);
        logger.info(`🔧 调用工具: ${functionName} with ${JSON.stringify(functionArgs)}`);

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
   * 清理资源
   */
  async cleanup(): Promise<void> {
    if (this.mcpClient) {
      await this.mcpClient.disconnectAll();
    }
  }
}
