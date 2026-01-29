# MCP (Model Context Protocol) 详解

## 一、MCP 是什么？

**MCP (Model Context Protocol)** 是由 Anthropic 开发的一个**开放标准协议**，用于在 AI 应用和外部工具/数据源之间建立**标准化的通信接口**。

### 核心概念

MCP 定义了一套标准协议，让：
- **工具提供者**（MCP 服务器）可以以统一的方式暴露工具
- **工具消费者**（MCP 客户端）可以以统一的方式发现和使用工具
- **AI Agent** 可以动态地连接和使用多个独立的工具服务器

### 类比理解

把 MCP 想象成：
- **USB 协议**：定义了标准接口，任何符合 USB 标准的设备都可以插到任何支持 USB 的电脑上
- **REST API**：定义了标准的 HTTP 接口，任何服务都可以通过 REST 方式暴露功能
- **插件系统**：定义了标准的插件接口，任何插件都可以被主程序加载

## 二、没有 MCP 的情况

### 传统方式：硬编码工具

```typescript
// ❌ 没有 MCP：工具直接硬编码在 Agent 中
class SimpleAgent {
  // 工具定义直接写在代码里
  private tools = [
    {
      type: 'function',
      function: {
        name: 'add',
        description: '加法运算',
        parameters: {
          type: 'object',
          properties: {
            a: { type: 'number' },
            b: { type: 'number' }
          },
          required: ['a', 'b']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_time',
        description: '获取当前时间',
        parameters: { type: 'object', properties: {} }
      }
    }
  ];

  // 工具执行逻辑也直接写在 Agent 中
  private async executeTool(name: string, args: any) {
    if (name === 'add') {
      return { result: args.a + args.b };
    }
    if (name === 'get_time') {
      return { time: new Date().toISOString() };
    }
    throw new Error(`未知工具: ${name}`);
  }

  async chat(message: string) {
    // 调用 LLM API
    const response = await this.client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: message }],
      tools: this.tools  // 使用硬编码的工具
    });

    // 处理工具调用
    if (response.choices[0].message.tool_calls) {
      for (const toolCall of response.choices[0].message.tool_calls) {
        const result = await this.executeTool(
          toolCall.function.name,
          JSON.parse(toolCall.function.arguments)
        );
        // ... 继续处理
      }
    }
  }
}
```

### 传统方式的问题

1. **紧耦合**：工具和 Agent 代码混在一起
2. **难以扩展**：添加新工具需要修改 Agent 代码
3. **无法复用**：工具无法被其他 Agent 使用
4. **难以管理**：工具多了代码会变得混乱
5. **无法动态发现**：无法在运行时发现新工具

## 三、有 MCP 的情况

### MCP 方式：工具作为独立服务器

```typescript
// ✅ 有 MCP：工具作为独立的服务器运行

// 1. Calculator 服务器（独立进程）
// calculator-server.ts
const server = new Server({
  name: 'calculator-server',
  version: '1.0.0'
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'add',
        description: '执行加法运算',
        inputSchema: {
          type: 'object',
          properties: {
            a: { type: 'number' },
            b: { type: 'number' }
          },
          required: ['a', 'b']
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'add') {
    const { a, b } = request.params.arguments;
    return {
      content: [{ type: 'text', text: JSON.stringify({ result: a + b })}]
    };
  }
});

// 2. Time 服务器（独立进程）
// time-server.ts
const server = new Server({
  name: 'time-server',
  version: '1.0.0'
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_current_time',
        description: '获取当前时间',
        inputSchema: { type: 'object', properties: {} }
      }
    ]
  };
});

// 3. Agent（通过 MCP 客户端连接服务器）
class MCPAgent {
  private mcpClient: MCPClient;

  async initialize() {
    // 连接所有配置的 MCP 服务器
    this.mcpClient = new MCPClient(config);
    await this.mcpClient.connectAll();
    
    // 动态发现所有工具
    this.availableTools = await this.mcpClient.listTools();
  }

  async chat(message: string) {
    // 将 MCP 工具转换为 OpenAI 格式
    const tools = this.formatToolsForOpenAI();
    
    // 调用 LLM API
    const response = await this.client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: message }],
      tools: tools  // 动态获取的工具
    });

    // 执行工具调用（通过 MCP 客户端）
    if (response.choices[0].message.tool_calls) {
      for (const toolCall of response.choices[0].message.tool_calls) {
        const [serverName, toolName] = toolCall.function.name.split('__');
        const result = await this.mcpClient.callTool(
          serverName,
          toolName,
          JSON.parse(toolCall.function.arguments)
        );
        // ... 继续处理
      }
    }
  }
}
```

## 四、MCP 的核心优势

### 1. **解耦和模块化**

**没有 MCP**：
```
Agent 代码
├── 工具1的实现
├── 工具2的实现
├── 工具3的实现
└── ... 所有工具混在一起
```

**有 MCP**：
```
Agent 代码（只负责协调）
├── MCP 客户端（标准接口）
    ├── Calculator 服务器（独立进程）
    ├── Time 服务器（独立进程）
    └── Filesystem 服务器（独立进程）
```

### 2. **动态发现和连接**

```typescript
// config.yaml
mcp_servers:
  calculator:
    command: node
    args: ["dist/buildinMcp/servers/calculator-server.js"]
    transport: stdio
    
  time:
    command: node
    args: ["dist/buildinMcp/servers/time-server.js"]
    transport: stdio

  # 添加新工具？只需在配置文件中添加，无需修改代码！
  weather:
    command: node
    args: ["dist/buildinMcp/servers/weather-server.js"]
    transport: stdio
```

Agent 启动时自动：
1. 读取配置文件
2. 连接所有服务器
3. 发现所有工具
4. 无需修改任何代码！

### 3. **工具复用**

同一个 MCP 服务器可以被多个 Agent 使用：

```
Calculator 服务器
    ├── Agent A（使用）
    ├── Agent B（使用）
    └── Agent C（使用）
```

### 4. **独立开发和部署**

每个 MCP 服务器可以：
- 独立开发
- 独立测试
- 独立部署
- 独立更新
- 使用不同的编程语言（只要实现 MCP 协议）

### 5. **标准化接口**

所有 MCP 服务器都遵循相同的协议：

```typescript
// 所有服务器都实现这两个接口
1. listTools() -> 返回工具列表
2. callTool(name, arguments) -> 执行工具
```

Agent 不需要知道工具的具体实现，只需要知道标准接口。

### 6. **进程隔离**

每个 MCP 服务器运行在独立进程中：
- **安全性**：一个服务器崩溃不会影响其他服务器
- **资源隔离**：每个服务器有独立的资源限制
- **可扩展性**：可以单独扩展某个服务器

## 五、MCP 架构详解

### 架构图

```
┌─────────────────────────────────────────────────────────┐
│                    AI Agent                             │
│  ┌──────────────────────────────────────────────────┐  │
│  │         MCP Client (标准客户端)                    │  │
│  │  - connectAll()                                   │  │
│  │  - listTools()                                    │  │
│  │  - callTool()                                     │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │ MCP 协议（标准接口）
         ┌───────────┴───────────┬───────────────┐
         │                       │               │
         ▼                       ▼               ▼
┌──────────────┐      ┌──────────────┐  ┌──────────────┐
│ Calculator   │      │ Time Server  │  │ Filesystem   │
│ Server       │      │              │  │ Server       │
│              │      │              │  │              │
│ - add()      │      │ - get_time() │  │ - read_file()│
│ - subtract() │      │              │  │ - write_file()│
│ - multiply() │      │              │  │              │
└──────────────┘      └──────────────┘  └──────────────┘
   (独立进程)            (独立进程)        (独立进程)
```

### 通信流程

```
1. Agent 启动
   ↓
2. MCP Client 读取 config.yaml
   ↓
3. 为每个服务器创建子进程（stdio 通信）
   ↓
4. 调用 listTools() 发现所有工具
   ↓
5. 将 MCP 工具转换为 OpenAI 格式
   ↓
6. LLM 决定调用工具
   ↓
7. MCP Client 路由到对应的服务器
   ↓
8. 服务器执行工具并返回结果
   ↓
9. 结果返回给 LLM
```

## 六、实际代码对比

### 场景：添加一个新的"天气查询"工具

#### 没有 MCP（传统方式）

```typescript
// 1. 修改 Agent 代码，添加工具定义
class Agent {
  private tools = [
    // ... 现有工具
    {
      type: 'function',
      function: {
        name: 'get_weather',
        description: '获取天气信息',
        parameters: {
          type: 'object',
          properties: {
            city: { type: 'string' }
          },
          required: ['city']
        }
      }
    }
  ];

  // 2. 添加工具执行逻辑
  private async executeTool(name: string, args: any) {
    // ... 现有逻辑
    if (name === 'get_weather') {
      // 调用天气 API
      const response = await fetch(`https://api.weather.com/${args.city}`);
      return await response.json();
    }
  }
}

// 3. 重新编译和部署整个 Agent
```

**问题**：
- 需要修改 Agent 核心代码
- 需要重新编译和部署
- 工具逻辑和 Agent 逻辑混在一起

#### 有 MCP（MCP 方式）

```typescript
// 1. 创建独立的天气服务器
// weather-server.ts
const server = new Server({
  name: 'weather-server',
  version: '1.0.0'
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [{
      name: 'get_weather',
      description: '获取天气信息',
      inputSchema: {
        type: 'object',
        properties: {
          city: { type: 'string' }
        },
        required: ['city']
      }
    }]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { city } = request.params.arguments;
  const response = await fetch(`https://api.weather.com/${city}`);
  const data = await response.json();
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }]
  };
});

// 2. 在 config.yaml 中添加配置
mcp_servers:
  weather:
    command: node
    args: ["dist/buildinMcp/servers/weather-server.js"]
    transport: stdio

// 3. 完成！Agent 无需任何修改
```

**优势**：
- ✅ 无需修改 Agent 代码
- ✅ 独立开发和测试
- ✅ 可以单独部署和更新
- ✅ 工具逻辑完全隔离

## 七、MCP 的核心价值

### 1. **标准化**

MCP 定义了标准协议，就像：
- **HTTP** 让所有网站可以互相访问
- **SQL** 让所有数据库可以统一查询
- **MCP** 让所有工具可以统一使用

### 2. **可组合性**

可以像搭积木一样组合不同的工具：

```
Agent = LLM + MCP Client + 多个 MCP 服务器
```

### 3. **生态系统**

MCP 正在建立一个工具生态系统：
- 社区可以开发各种 MCP 服务器
- 任何 Agent 都可以使用这些服务器
- 工具可以跨项目、跨团队复用

### 4. **未来扩展**

当需要新功能时：
- 不需要修改现有代码
- 只需要添加新的 MCP 服务器
- 或者使用社区已有的服务器

## 八、总结

### MCP 解决了什么问题？

1. **工具管理混乱** → 标准化的工具接口
2. **代码耦合严重** → 工具独立部署
3. **难以扩展** → 动态发现和连接
4. **无法复用** → 工具作为独立服务
5. **开发效率低** → 模块化开发

### 没有 MCP 可以吗？

**可以！** 但你会遇到：
- 工具和 Agent 代码混在一起
- 添加新工具需要修改核心代码
- 工具无法复用
- 代码越来越难维护

### 有 MCP 的好处

- ✅ **解耦**：工具和 Agent 完全分离
- ✅ **动态**：运行时发现和连接工具
- ✅ **复用**：工具可以被多个 Agent 使用
- ✅ **标准化**：统一的工具接口
- ✅ **可扩展**：轻松添加新工具
- ✅ **模块化**：独立开发和部署

### 类比

| 概念 | 没有 MCP | 有 MCP |
|------|---------|--------|
| **工具定义** | 硬编码在 Agent 中 | 独立的服务器 |
| **工具发现** | 编译时确定 | 运行时动态发现 |
| **工具复用** | 无法复用 | 可以被多个 Agent 使用 |
| **添加工具** | 修改 Agent 代码 | 添加配置文件 |
| **工具隔离** | 混在一起 | 独立进程 |
| **标准化** | 各自为政 | 统一协议 |

**MCP 就像是给 AI Agent 世界建立了一个"插件标准"，让工具可以像插件一样即插即用！**
