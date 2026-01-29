# 多 Agent 应用架构总结

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                      Application Layer                        │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │   Agent 1    │  │   Agent 2    │  │   Agent N    │        │
│  │  (独立实例)   │  │  (独立实例)   │  │  (独立实例)   │        │
│  │              │  │              │  │              │        │
│  │ - chat()     │  │ - chat()     │  │ - chat()     │        │
│  │ - 独立上下文  │  │ - 独立上下文  │  │ - 独立上下文  │        │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘        │
│         │                  │                  │              │
│         └──────────────────┼──────────────────┘              │
│                            │                                  │
│                  ┌─────────▼─────────┐                       │
│                  │  AgentFactory     │                       │
│                  │  (工厂模式)       │                       │
│                  │  - createAgent()  │                       │
│                  └─────────┬─────────┘                       │
│                            │                                  │
│                  ┌─────────▼─────────┐                       │
│                  │ MCPServiceManager │                       │
│                  │  (单例模式)       │                       │
│                  │  - 统一管理连接   │                       │
│                  │  - 工具发现        │                       │
│                  │  - 连接复用        │                       │
│                  └─────────┬─────────┘                       │
└────────────────────────────┼──────────────────────────────────┘
                             │ MCP Protocol
                ┌────────────┼────────────┐
                │            │            │
         ┌──────▼───┐  ┌─────▼────┐  ┌───▼────┐
         │Calculator│  │  Time    │  │FileSys │
         │  Server  │  │  Server  │  │ Server │
         │(独立进程) │  │(独立进程) │  │(独立进程)│
         └──────────┘  └──────────┘  └────────┘
```

## 核心组件

### 1. MCPServiceManager（MCP 服务管理器）

**设计模式**：单例模式

**职责**：
- 统一管理所有 MCP 服务器连接
- 提供工具发现和调用接口
- 管理连接生命周期
- 缓存工具列表

**关键特性**：
- ✅ 单例：全局唯一实例
- ✅ 线程安全：支持并发调用
- ✅ 懒加载：按需初始化
- ✅ 连接复用：所有 Agent 共享

**使用方式**：
```typescript
// 获取单例（首次需要提供 config）
const manager = MCPServiceManager.getInstance(config);
await manager.initialize();

// 后续使用（不需要 config）
const manager = MCPServiceManager.getInstance();
```

### 2. AgentFactory（Agent 工厂）

**设计模式**：工厂模式

**职责**：
- 创建 Agent 实例
- 注入共享的 MCP 服务管理器
- 管理 Agent 生命周期

**使用方式**：
```typescript
const factory = new AgentFactory(config);
const agent = await factory.createAgent('agent-id', 'system-prompt');
```

### 3. SharedMCPAgent（共享 MCP Agent）

**设计模式**：依赖注入

**职责**：
- 与用户交互
- 调用 LLM API
- 通过共享的 MCP 服务管理器调用工具

**关键特性**：
- ✅ 独立上下文：每个 Agent 有独立的对话历史
- ✅ 共享工具：所有 Agent 共享 MCP 服务器
- ✅ 线程安全：支持并发调用

## 数据流

### 1. 初始化流程

```
Application Start
    ↓
Load Config
    ↓
Create AgentFactory
    ↓
Create MCPServiceManager (Singleton)
    ↓
Connect to MCP Servers
    ↓
Cache Tools List
    ↓
Ready to Create Agents
```

### 2. Agent 创建流程

```
AgentFactory.createAgent()
    ↓
Get MCPServiceManager (Singleton)
    ↓
Ensure MCP Servers Connected
    ↓
Create SharedMCPAgent
    ↓
Inject MCPServiceManager
    ↓
Load Tools from Cache
    ↓
Agent Ready
```

### 3. 工具调用流程

```
User Message
    ↓
Agent.chat()
    ↓
LLM API Call (with tools)
    ↓
LLM Returns tool_calls
    ↓
Agent.executeToolCall()
    ↓
MCPServiceManager.callTool()
    ↓
MCP Server Execution
    ↓
Return Result
    ↓
LLM Generate Final Response
```

## 关键设计决策

### 1. 为什么使用单例模式？

**问题**：如果每个 Agent 都创建独立的 MCP 连接，会导致：
- 资源浪费（多个进程）
- 连接管理复杂
- 工具列表重复查询

**解决方案**：使用单例模式，所有 Agent 共享一个 MCP 服务管理器。

### 2. 为什么使用工厂模式？

**问题**：直接创建 Agent 需要手动管理 MCP 服务管理器。

**解决方案**：使用工厂模式，封装 Agent 创建逻辑，自动注入依赖。

### 3. 为什么缓存工具列表？

**问题**：每次调用 `listTools()` 都需要与 MCP 服务器通信。

**解决方案**：缓存工具列表，只在需要时刷新（如添加新服务器）。

### 4. 如何保证线程安全？

**问题**：多个 Agent 可能同时调用工具。

**解决方案**：
- MCP SDK 的 Client 是线程安全的
- 使用连接锁防止重复连接
- 工具调用是异步的，不会阻塞

## 使用示例

### 基本使用

```typescript
import { AgentFactory } from './core/agent-factory.js';
import { loadConfig } from './utils/config.js';

async function main() {
  // 1. 加载配置
  const config = loadConfig();

  // 2. 创建工厂
  const factory = new AgentFactory(config);

  // 3. 创建多个 Agent
  const agent1 = await factory.createAgent('agent-1');
  const agent2 = await factory.createAgent('agent-2');
  const agent3 = await factory.createAgent('agent-3');

  // 4. 并发使用
  const results = await Promise.all([
    agent1.chat('计算 123 + 456'),
    agent2.chat('现在几点了？'),
    agent3.chat('列出文件'),
  ]);
}
```

### 高级使用

```typescript
// 自定义系统提示词
const mathAgent = await factory.createAgent(
  'math-agent',
  '你是一个专业的数学助手。'
);

// 批量创建
const agents = await factory.createAgents(10, 'worker');

// 刷新工具列表
await agent.refreshTools();
```

## 优势总结

### 1. 资源效率
- ✅ 所有 Agent 共享 MCP 连接
- ✅ 避免重复创建进程
- ✅ 统一管理连接生命周期

### 2. 可扩展性
- ✅ 轻松添加新 Agent
- ✅ 轻松添加新 MCP 服务器
- ✅ 支持动态服务发现

### 3. 可维护性
- ✅ 统一的配置管理
- ✅ 集中的连接管理
- ✅ 清晰的职责分离

### 4. 故障隔离
- ✅ Agent 之间相互独立
- ✅ MCP 服务器故障不影响其他服务器
- ✅ 支持重连机制

## 文件结构

```
src/
├── core/
│   ├── mcp-service-manager.ts    # MCP 服务管理器（单例）
│   ├── agent-factory.ts           # Agent 工厂
│   └── shared-mcp-agent.ts        # 共享 MCP Agent
├── examples/
│   └── multi-agent-app.ts         # 多 Agent 应用示例
└── ...
```

## 下一步

1. 查看 `src/examples/multi-agent-app.ts` 了解完整示例
2. 查看 `docs/multi-agent-architecture-guide.md` 了解详细使用指南
3. 根据需求自定义 Agent 和 MCP 服务器
