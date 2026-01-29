# 多 Agent 应用架构使用指南

## 一、快速开始

### 1. 基本使用

```typescript
import { AgentFactory } from './core/agent-factory.js';
import { loadConfig } from './utils/config.js';

async function main() {
  // 1. 加载配置
  const config = loadConfig();

  // 2. 创建 Agent 工厂
  const agentFactory = new AgentFactory(config);

  // 3. 创建多个 Agent（它们共享 MCP 服务器连接）
  const agent1 = await agentFactory.createAgent('agent-1');
  const agent2 = await agentFactory.createAgent('agent-2');
  const agent3 = await agentFactory.createAgent('agent-3');

  // 4. 使用 Agent
  const result1 = await agent1.chat('帮我计算 123 + 456');
  const result2 = await agent2.chat('现在几点了？');
  const result3 = await agent3.chat('列出当前目录下的文件');
}
```

### 2. 自定义系统提示词

```typescript
const mathAgent = await agentFactory.createAgent(
  'math-agent',
  '你是一个专业的数学助手，擅长各种数学计算。'
);

const timeAgent = await agentFactory.createAgent(
  'time-agent',
  '你是一个专业的时间管理助手，可以帮助用户管理时间。'
);
```

### 3. 批量创建 Agent

```typescript
// 批量创建 10 个 Agent
const agents = await agentFactory.createAgents(10, 'worker');
```

## 二、架构组件说明

### 1. MCPServiceManager（MCP 服务管理器）

**职责**：
- 统一管理所有 MCP 服务器连接
- 提供工具发现和调用接口
- 管理连接生命周期
- 缓存工具列表

**特性**：
- 单例模式（全局唯一）
- 线程安全（支持并发调用）
- 懒加载（按需初始化）
- 连接复用（所有 Agent 共享）

**使用方式**：
```typescript
// 通常不需要直接使用，AgentFactory 会自动管理
const mcpServiceManager = MCPServiceManager.getInstance(config);
await mcpServiceManager.initialize();
```

### 2. AgentFactory（Agent 工厂）

**职责**：
- 创建 Agent 实例
- 注入共享的 MCP 服务管理器
- 管理 Agent 生命周期

**使用方式**：
```typescript
const agentFactory = new AgentFactory(config);
const agent = await agentFactory.createAgent('agent-id', 'system-prompt');
```

### 3. SharedMCPAgent（共享 MCP Agent）

**职责**：
- 与用户交互
- 调用 LLM API
- 通过共享的 MCP 服务管理器调用工具

**使用方式**：
```typescript
const agent = await agentFactory.createAgent('agent-id');
const result = await agent.chat('用户消息');
```

## 三、架构优势

### 1. 资源效率

- ✅ 所有 Agent 共享 MCP 连接，减少资源消耗
- ✅ 避免重复创建 MCP 服务器进程
- ✅ 统一管理连接生命周期

### 2. 可扩展性

- ✅ 轻松添加新 Agent（只需创建实例）
- ✅ 轻松添加新 MCP 服务器（只需配置）
- ✅ 支持动态服务发现

### 3. 可维护性

- ✅ 统一的配置管理
- ✅ 集中的连接管理
- ✅ 清晰的职责分离

### 4. 故障隔离

- ✅ Agent 之间相互独立
- ✅ MCP 服务器故障不影响其他服务器
- ✅ 支持重连机制

## 四、最佳实践

### 1. Agent 生命周期管理

```typescript
// 创建 Agent
const agent = await agentFactory.createAgent('agent-id');

// 使用 Agent
const result = await agent.chat('消息');

// 不需要手动清理，MCP 服务管理器会统一管理
```

### 2. 并发使用

```typescript
// 多个 Agent 可以并发使用
const results = await Promise.all([
  agent1.chat('消息1'),
  agent2.chat('消息2'),
  agent3.chat('消息3'),
]);
```

### 3. 错误处理

```typescript
try {
  const result = await agent.chat('消息');
} catch (error) {
  // 处理错误
  logger.error('Agent 执行失败:', error);
}
```

### 4. 工具列表刷新

```typescript
// 如果 MCP 服务器添加了新工具，可以刷新工具列表
await agent.refreshTools();
```

## 五、配置说明

### config.yaml

```yaml
deepseek:
  api_key: ${DEEPSEEK_API_KEY}
  base_url: https://api.deepseek.com
  model: deepseek-chat
  temperature: 0.1

mcp_servers:
  calculator:
    command: node
    args: ["dist/buildinMcp/servers/calculator-server.js"]
    transport: stdio
    
  time:
    command: node
    args: ["dist/buildinMcp/servers/time-server.js"]
    transport: stdio
    
  filesystem:
    command: node
    args: ["dist/buildinMcp/servers/filesystem-server.js", "--root", "./data"]
    transport: stdio
```

所有 Agent 都会共享这些 MCP 服务器配置。

## 六、架构图

```
┌─────────────────────────────────────────────────────────┐
│                  Application                            │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐│
│  │   Agent 1    │  │   Agent 2    │  │   Agent 3    ││
│  │              │  │              │  │              ││
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘│
│         │                  │                  │       │
│         └──────────────────┼──────────────────┘       │
│                            │                            │
│                  ┌─────────▼─────────┐                 │
│                  │  MCP Service      │                 │
│                  │  Manager (单例)  │                 │
│                  │  - 统一管理连接  │                 │
│                  │  - 工具发现      │                 │
│                  │  - 连接池        │                 │
│                  └─────────┬─────────┘                 │
└────────────────────────────┼────────────────────────────┘
                             │
                ┌────────────┼────────────┐
                │            │            │
         ┌──────▼───┐  ┌─────▼────┐  ┌───▼────┐
         │Calculator│  │  Time    │  │FileSys │
         │  Server  │  │  Server  │  │ Server │
         └──────────┘  └──────────┘  └────────┘
```

## 七、常见问题

### Q1: 多个 Agent 会创建多个 MCP 连接吗？

**A:** 不会。所有 Agent 共享同一个 MCP 服务管理器，只会创建一次连接。

### Q2: 如何添加新的 MCP 服务器？

**A:** 只需在 `config.yaml` 中添加服务器配置，所有 Agent 会自动获得新工具。

### Q3: Agent 之间会相互影响吗？

**A:** 不会。每个 Agent 有独立的对话上下文，只是共享 MCP 服务器连接。

### Q4: 如何清理资源？

**A:** MCP 服务管理器是单例，会在应用结束时统一清理。如果需要手动清理：

```typescript
const mcpServiceManager = agentFactory.getMCPServiceManager();
await mcpServiceManager.disconnectAll();
```

### Q5: 支持并发调用吗？

**A:** 支持。MCP 服务管理器是线程安全的，可以安全地并发调用。

## 八、示例代码

详见 `src/examples/multi-agent-app.ts`
