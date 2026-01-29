# MCP AI Agent (TypeScript)

基于 TypeScript、MCP (Model Context Protocol) 和 DeepSeek API 的智能 AI Agent，通过 MCP 调用多种工具完成任务，并支持 Anthropic 规范的 Agent Skills（技能目录 + LLM 发现 + MCP 脚本执行）。

## ✨ 功能特性

- **TypeScript 类型安全**：完整类型定义与检查
- **MCP 协议**：基于官方 @modelcontextprotocol/sdk，多服务器（时间、计算器、文件系统、技能脚本执行）
- **智能工具调用**：Agent 自动选择并调用 MCP 工具
- **Agent Skills**：内置技能目录（`src/buildinSkills`）、LLM 发现相关技能、按需注入 SKILL 说明、通过 MCP 服务执行技能内脚本
- **交互式 / 单次查询**：CLI 支持 `-i` 交互模式或单条查询
- **配置**：YAML + 环境变量（如 `${DEEPSEEK_API_KEY}`）
- **多 Agent 架构**：可选共享 MCP 服务管理（见 `examples/multi-agent-app.ts`）

## 🛠️ 技术栈

- **TypeScript 5.4+** - 类型安全的 JavaScript
- **Node.js 18+** - 现代 JavaScript 运行时
- **@modelcontextprotocol/sdk** - MCP 官方 SDK
- **OpenAI SDK** - DeepSeek API 客户端（兼容 OpenAI）
- **Zod** - 运行时类型验证
- **Commander** - CLI 框架
- **YAML** - 配置文件解析
- **Vitest** - 测试框架
- **ESLint + Prettier** - 代码质量工具

## 📦 安装

1. 安装依赖：

```bash
npm install
# 或
pnpm install
# 或
yarn install
```

2. 配置环境变量：

创建 `.env` 文件：

```bash
DEEPSEEK_API_KEY=your-api-key-here
```

或者在 `config.yaml` 中使用环境变量 `${DEEPSEEK_API_KEY}`。

3. 构建项目：

```bash
npm run build
```

## 🚀 使用方法

### 1. 单次查询模式

```bash
npm start -- "现在几点了？"
```

```bash
npm start -- "帮我计算 123 + 456 的结果"
```

```bash
npm start -- "列出 data 目录下的文件"
```

```bash
npm start -- "运行 example 技能的 hello 脚本，参数是 World"
```

### 2. 交互式模式

```bash
npm start -- --interactive
```

或

```bash
npm start -- -i
```

### 3. 开发模式（自动重新编译）

```bash
npm run dev -- "你的查询"
```

### 4. 使用全局命令（安装后）

```bash
npm link
ai-agent "现在几点了？"
ai-agent -i
```

## 📁 项目结构

```
real-ai-agent-ts/
├── src/
│   ├── agent.ts              # 主 Agent（MCP 工具 + Skills）
│   ├── cli.ts                # CLI 入口（单次 / 交互）
│   ├── core/
│   │   ├── agent-factory.ts       # Agent 工厂
│   │   ├── mcp-service-manager.ts # 共享 MCP 服务管理
│   │   └── shared-mcp-agent.ts    # 共享 MCP 的多 Agent
│   ├── examples/
│   │   └── multi-agent-app.ts     # 多 Agent 示例
│   ├── types/
│   │   ├── config.ts         # 配置类型
│   │   └── skill.ts          # 技能类型
│   ├── utils/
│   │   ├── config.ts         # 配置加载
│   │   └── logger.ts         # 日志
│   ├── buildinSkills/        # 内置技能目录（示例等）
│   │   └── example/
│   │       ├── SKILL.md
│   │       └── scripts/hello.js
│   ├── skills/
│   │   ├── loader.ts         # 技能加载、SKILL.md 解析、关键词匹配
│   │   ├── discovery.ts      # LLM 技能发现
│   │   └── executor.ts       # 技能脚本执行（供 MCP 服务调用）
│   └── buildinMcp/           # 内置 MCP 客户端与服务器
│       ├── client.ts        # MCP 客户端
│       └── servers/
│           ├── time-server.ts
│           ├── calculator-server.ts
│           ├── filesystem-server.ts
│           └── skill-runner-server.ts
├── config.yaml
├── package.json
├── tsconfig.json
├── docs/                     # 文档（含 agent-skills.md）
└── README.md
```

## 🔧 MCP 服务器

| 服务器 | 工具示例 | 说明 |
|--------|----------|------|
| time | `time__get_time` | 当前时间 |
| calculator | `calculator__add`, `calculator__calculate` | 数学计算 |
| filesystem | `filesystem__read_file`, `filesystem__list_directory` | 文件操作（限制在 `--root` 目录） |
| skills | `skills__execute_script` | 在技能目录下执行脚本（需在 config 中命名为 `skills`） |

### 时间服务器 (time)

提供时间相关功能：
- `get_time()`: 获取当前时间

### 计算器服务器 (calculator)

提供数学计算功能：
- `add(a, b)`: 加法
- `subtract(a, b)`: 减法
- `multiply(a, b)`: 乘法
- `divide(a, b)`: 除法
- `power(base, exponent)`: 幂运算
- `calculate(expression)`: 计算表达式

### 文件系统服务器 (filesystem)

提供文件操作功能：
- `read_file(file_path)`: 读取文件
- `write_file(file_path, content, mode)`: 写入文件
- `list_directory(dir_path)`: 列出目录
- `create_directory(dir_path)`: 创建目录
- `delete_file(file_path)`: 删除文件/目录

**注意**: 文件系统服务器默认限制在 `./data` 目录下操作，确保安全性。

### 技能脚本执行服务器 (skills)

- 实现：`skill-runner-server.ts`；在 `config.yaml` 中**建议将服务器名配置为 `skills`**，这样工具名为 `skills__execute_script`，与技能说明一致。
- 工具：`execute_script(skill_id, script_path, args?)`，在指定技能目录下执行 `.py`、`.sh`、`.js`、`.mjs` 脚本。
- 启动参数：`--skills-dir` 指定技能根目录（默认与顶层 `skills.directory` 一致，如 `./src/buildinSkills`）。详见 [Agent Skills](#-agent-skills)。

## 📚 Agent Skills

内置技能放在 `src/buildinSkills` 目录下，格式符合 [Anthropic Agent Skills](https://docs.anthropic.com/en/docs/agents-and-tools/agent-skills/overview) 规范。可通过配置 `skills.directory` 指向其他目录。

- **Level 1**：启动时加载每个技能的 `name`、`description`（元数据）并写入系统提示，供模型发现技能。
- **Level 2**：**LLM 发现**相关技能（将用户消息与技能元数据交给 LLM 返回 skill_id 列表），再为匹配技能注入 `SKILL.md` 正文；发现失败时回退到关键词匹配。
- **脚本执行**：通过 **MCP 服务 skills** 执行脚本（工具 `skills__execute_script`），在技能目录下运行 `.py`、`.sh`、`.js`/`.mjs` 脚本（工作目录为技能根目录）。技能说明中建议写成「使用 MCP 服务执行」。

### 技能结构

每个技能是一个子目录，必须包含 `SKILL.md`（默认目录为 `src/buildinSkills`）：

```
src/buildinSkills/
├── example/
│   ├── SKILL.md          # 必选：YAML frontmatter + 说明正文
│   └── scripts/
│       └── hello.js      # 可选：可执行脚本
└── your-skill/
    ├── SKILL.md
    └── ...
```

`SKILL.md` 示例：

```markdown
---
name: your-skill-name
description: 简短描述：做什么、何时使用（用户提到 xxx 时使用）。
---

# 技能名称
## 使用方式
...
```

配置（可选，默认 `./src/buildinSkills`）：

```yaml
skills:
  directory: ./src/buildinSkills
```

MCP 技能执行服务的 `--skills-dir` 需与技能目录一致，例如：

```yaml
mcp_servers:
  skills:
    command: node
    args: ["dist/buildinMcp/servers/skill-runner-server.js", "--skills-dir", "./src/buildinSkills"]
    transport: stdio
```

更多说明见 [docs/agent-skills.md](docs/agent-skills.md)。

## ⚙️ 配置说明

`config.yaml` 文件包含以下配置：

- `deepseek`: DeepSeek API 配置
  - `api_key`: API 密钥（支持环境变量 `${DEEPSEEK_API_KEY}`）
  - `base_url`: API 基础 URL（默认为 https://api.deepseek.com）
  - `model`: 使用的模型（如 deepseek-chat）
  - `temperature`: 温度参数

- `mcp_servers`: MCP 服务器配置
  - 每个服务器需要配置 `command`、`args` 和 `transport`

- `skills`: 技能配置（可选）
  - `directory`: 技能目录路径，默认 `./src/buildinSkills`

- `logging`: 日志配置
  - `level`: 日志级别（DEBUG, INFO, WARN, ERROR）

## 🧪 开发

### 添加新的 MCP 服务器

1. 在 `src/buildinMcp/servers/` 目录下创建新的服务器文件
2. 使用 MCP SDK 定义工具：

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  {
    name: 'my-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'my_tool',
        description: '工具描述',
        inputSchema: {
          type: 'object',
          properties: {
            param: { type: 'string' },
          },
          required: ['param'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // 处理工具调用
});
```

3. 在 `config.yaml` 中添加服务器配置

### 运行测试

```bash
npm test
```

### 代码检查

```bash
npm run lint
npm run format
npm run type-check
```

## 📝 注意事项

1. 使用前先执行 `npm run build`，确保 MCP 服务器与 Agent 已编译
2. 文件系统服务器通过 `--root` 限制操作目录，技能脚本仅在技能目录内执行
3. API 密钥使用环境变量或 `config.yaml` 中的占位符，勿提交到仓库
4. 运行环境需 Node.js 18+

## 📖 更多

- [Agent Skills 使用说明](docs/agent-skills.md)
- [多 Agent 架构](docs/multi-agent-architecture.md) 与示例：`src/examples/multi-agent-app.ts`
- [QUICKSTART.md](QUICKSTART.md)

## 🔄 与 Python 版本的对比

| 特性 | Python 版本 | TypeScript 版本 |
|------|------------|----------------|
| 类型安全 | 类型提示 | 完整类型系统 |
| 运行时 | Python 3.12+ | Node.js 18+ |
| 模块系统 | 传统导入 | ESM 模块 |
| 构建工具 | 无需构建 | TypeScript 编译 |
| 包管理 | pip | npm/pnpm/yarn |
| 性能 | 良好 | 优秀 |
| 生态系统 | Python 生态 | Node.js 生态 |

## 📄 许可证

MIT
