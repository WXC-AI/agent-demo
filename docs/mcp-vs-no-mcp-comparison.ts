/**
 * MCP vs 无 MCP 对比示例
 * 
 * 这个文件展示了有 MCP 和没有 MCP 的代码对比
 */

// ============================================
// 场景：实现一个支持计算器、时间查询、文件操作的 Agent
// ============================================

// ============================================
// 方案一：没有 MCP（传统硬编码方式）
// ============================================

class AgentWithoutMCP {
  private client: any; // OpenAI 客户端

  // ❌ 问题 1: 所有工具定义都硬编码在这里
  private tools = [
    {
      type: 'function' as const,
      function: {
        name: 'add',
        description: '执行加法运算',
        parameters: {
          type: 'object',
          properties: {
            a: { type: 'number', description: '第一个数字' },
            b: { type: 'number', description: '第二个数字' },
          },
          required: ['a', 'b'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'get_current_time',
        description: '获取当前时间',
        parameters: {
          type: 'object',
          properties: {
            timezone: { type: 'string', description: '时区' },
          },
          required: [],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'read_file',
        description: '读取文件内容',
        parameters: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: '文件路径' },
          },
          required: ['file_path'],
        },
      },
    },
  ];

  // ❌ 问题 2: 所有工具执行逻辑都混在 Agent 中
  private async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'add': {
        const a = args.a as number;
        const b = args.b as number;
        return { result: a + b };
      }

      case 'get_current_time': {
        const timezone = (args.timezone as string) || 'UTC';
        return {
          current_time: new Date().toISOString(),
          timezone,
        };
      }

      case 'read_file': {
        const fs = await import('fs/promises');
        const filePath = args.file_path as string;
        const content = await fs.readFile(filePath, 'utf-8');
        return { content };
      }

      default:
        throw new Error(`未知工具: ${name}`);
    }
  }

  async chat(message: string): Promise<string> {
    // 调用 LLM API
    const response = await this.client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: message }],
      tools: this.tools, // 使用硬编码的工具
    });

    const assistantMessage = response.choices[0]?.message;
    if (!assistantMessage) {
      return '抱歉，我无法处理这个请求。';
    }

    // 处理工具调用
    if (assistantMessage.tool_calls) {
      for (const toolCall of assistantMessage.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        // 执行工具
        const result = await this.executeTool(functionName, functionArgs);

        // 继续对话...
      }
    }

    return assistantMessage.content || '';
  }

  // ❌ 问题 3: 添加新工具需要修改这个类
  // 例如：添加天气查询工具
  // 1. 在 tools 数组中添加工具定义
  // 2. 在 executeTool 中添加执行逻辑
  // 3. 重新编译整个 Agent
}

// ============================================
// 方案二：有 MCP（模块化方式）
// ============================================

// ✅ 优势 1: 工具作为独立的服务器

// Calculator 服务器（独立文件：calculator-server.ts）
class CalculatorServer {
  // 这个服务器可以独立开发、测试、部署
  getTools() {
    return [
      {
        name: 'add',
        description: '执行加法运算',
        inputSchema: {
          type: 'object',
          properties: {
            a: { type: 'number' },
            b: { type: 'number' },
          },
          required: ['a', 'b'],
        },
      },
    ];
  }

  async executeTool(name: string, args: Record<string, unknown>) {
    if (name === 'add') {
      const a = args.a as number;
      const b = args.b as number;
      return { result: a + b };
    }
    throw new Error(`未知工具: ${name}`);
  }
}

// Time 服务器（独立文件：time-server.ts）
class TimeServer {
  getTools() {
    return [
      {
        name: 'get_current_time',
        description: '获取当前时间',
        inputSchema: {
          type: 'object',
          properties: {
            timezone: { type: 'string' },
          },
          required: [],
        },
      },
    ];
  }

  async executeTool(name: string, args: Record<string, unknown>) {
    if (name === 'get_current_time') {
      const timezone = (args.timezone as string) || 'UTC';
      return {
        current_time: new Date().toISOString(),
        timezone,
      };
    }
    throw new Error(`未知工具: ${name}`);
  }
}

// Filesystem 服务器（独立文件：filesystem-server.ts）
class FilesystemServer {
  getTools() {
    return [
      {
        name: 'read_file',
        description: '读取文件内容',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: { type: 'string' },
          },
          required: ['file_path'],
        },
      },
    ];
  }

  async executeTool(name: string, args: Record<string, unknown>) {
    if (name === 'read_file') {
      const fs = await import('fs/promises');
      const filePath = args.file_path as string;
      const content = await fs.readFile(filePath, 'utf-8');
      return { content };
    }
    throw new Error(`未知工具: ${name}`);
  }
}

// ✅ 优势 2: Agent 通过 MCP 客户端连接服务器
class AgentWithMCP {
  private client: any; // OpenAI 客户端
  private mcpClient: MCPClient; // MCP 客户端
  private availableTools: Record<string, any[]> = {};

  async initialize() {
    // 连接所有配置的 MCP 服务器
    this.mcpClient = new MCPClient({
      mcpServers: {
        calculator: {
          command: 'node',
          args: ['dist/buildinMcp/servers/calculator-server.js'],
          transport: 'stdio',
        },
        time: {
          command: 'node',
          args: ['dist/buildinMcp/servers/time-server.js'],
          transport: 'stdio',
        },
        filesystem: {
          command: 'node',
          args: ['dist/buildinMcp/servers/filesystem-server.js'],
          transport: 'stdio',
        },
      },
    });

    await this.mcpClient.connectAll();

    // ✅ 优势 3: 动态发现所有工具
    this.availableTools = await this.mcpClient.listTools();
  }

  // ✅ 优势 4: 将 MCP 工具转换为 OpenAI 格式
  private formatToolsForOpenAI() {
    const openaiTools: any[] = [];

    for (const [serverName, tools] of Object.entries(this.availableTools)) {
      for (const tool of tools) {
        openaiTools.push({
          type: 'function',
          function: {
            name: `${serverName}__${tool.name}`,
            description: `[来自 ${serverName} 服务器] ${tool.description}`,
            parameters: tool.inputSchema,
          },
        });
      }
    }

    return openaiTools;
  }

  async chat(message: string): Promise<string> {
    // 动态获取工具列表
    const tools = this.formatToolsForOpenAI();

    // 调用 LLM API
    const response = await this.client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: message }],
      tools: tools, // 动态获取的工具
    });

    const assistantMessage = response.choices[0]?.message;
    if (!assistantMessage) {
      return '抱歉，我无法处理这个请求。';
    }

    // 处理工具调用
    if (assistantMessage.tool_calls) {
      for (const toolCall of assistantMessage.tool_calls) {
        const [serverName, toolName] = toolCall.function.name.split('__');
        const functionArgs = JSON.parse(toolCall.function.arguments);

        // ✅ 优势 5: 通过 MCP 客户端调用工具（自动路由到对应服务器）
        const result = await this.mcpClient.callTool(serverName, toolName, functionArgs);

        // 继续对话...
      }
    }

    return assistantMessage.content || '';
  }

  // ✅ 优势 6: 添加新工具只需：
  // 1. 创建新的服务器文件（如 weather-server.ts）
  // 2. 在配置文件中添加服务器配置
  // 3. 无需修改 Agent 代码！
}

// ============================================
// 对比总结
// ============================================

/**
 * 没有 MCP 的问题：
 * 
 * 1. ❌ 紧耦合：工具和 Agent 代码混在一起
 * 2. ❌ 难以扩展：添加新工具需要修改 Agent 代码
 * 3. ❌ 无法复用：工具无法被其他 Agent 使用
 * 4. ❌ 难以测试：工具逻辑和 Agent 逻辑混在一起
 * 5. ❌ 难以维护：工具多了代码会变得混乱
 * 6. ❌ 无法动态发现：工具在编译时确定
 */

/**
 * 有 MCP 的优势：
 * 
 * 1. ✅ 解耦：工具作为独立的服务器
 * 2. ✅ 易于扩展：添加新工具只需添加服务器和配置
 * 3. ✅ 可复用：工具可以被多个 Agent 使用
 * 4. ✅ 易于测试：每个服务器可以独立测试
 * 5. ✅ 易于维护：工具逻辑完全隔离
 * 6. ✅ 动态发现：运行时发现和连接工具
 * 7. ✅ 标准化：统一的工具接口
 * 8. ✅ 进程隔离：服务器崩溃不影响其他服务器
 */

// ============================================
// 实际场景：添加天气查询工具
// ============================================

// 没有 MCP：需要修改 Agent 类
class AgentWithoutMCP_AfterAddingWeather {
  // 1. 修改 tools 数组
  private tools = [
    // ... 现有工具
    {
      type: 'function' as const,
      function: {
        name: 'get_weather', // 新增
        description: '获取天气信息',
        parameters: {
          type: 'object',
          properties: {
            city: { type: 'string' },
          },
          required: ['city'],
        },
      },
    },
  ];

  // 2. 修改 executeTool 方法
  private async executeTool(name: string, args: Record<string, unknown>) {
    // ... 现有逻辑
    if (name === 'get_weather') {
      // 新增逻辑
      const city = args.city as string;
      const response = await fetch(`https://api.weather.com/${city}`);
      return await response.json();
    }
  }

  // 3. 重新编译和部署整个 Agent
}

// 有 MCP：只需添加服务器和配置
class AgentWithMCP_AfterAddingWeather {
  async initialize() {
    this.mcpClient = new MCPClient({
      mcpServers: {
        // ... 现有服务器
        weather: {
          // ✅ 只需添加这个配置
          command: 'node',
          args: ['dist/buildinMcp/servers/weather-server.js'],
          transport: 'stdio',
        },
      },
    });

    // ✅ Agent 代码无需任何修改
    // ✅ 工具会自动被发现和连接
    await this.mcpClient.connectAll();
    this.availableTools = await this.mcpClient.listTools();
  }
}

// Weather 服务器（独立文件：weather-server.ts）
class WeatherServer {
  getTools() {
    return [
      {
        name: 'get_weather',
        description: '获取天气信息',
        inputSchema: {
          type: 'object',
          properties: {
            city: { type: 'string' },
          },
          required: ['city'],
        },
      },
    ];
  }

  async executeTool(name: string, args: Record<string, unknown>) {
    if (name === 'get_weather') {
      const city = args.city as string;
      const response = await fetch(`https://api.weather.com/${city}`);
      return await response.json();
    }
    throw new Error(`未知工具: ${name}`);
  }
}

// ============================================
// 关键区别总结
// ============================================

/**
 * 核心区别：
 * 
 * 没有 MCP：
 * - 工具是 Agent 的一部分
 * - 工具定义和执行都在 Agent 中
 * - 添加工具 = 修改 Agent
 * 
 * 有 MCP：
 * - 工具是独立的服务器
 * - 工具定义和执行在服务器中
 * - 添加工具 = 添加服务器 + 配置
 * - Agent 只负责协调，不关心工具实现
 */

export {
  AgentWithoutMCP,
  AgentWithMCP,
  CalculatorServer,
  TimeServer,
  FilesystemServer,
  WeatherServer,
};
