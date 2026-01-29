# OpenAI Function Call 格式详解

## 概述

Function Calling 是 OpenAI API 的一个功能，允许 LLM 在对话中决定何时调用外部函数/工具，并自动生成符合函数签名的参数。

## 1. 工具定义格式（Tools Definition）

在调用 API 时，通过 `tools` 参数向 LLM 提供可用工具列表。

### 格式结构

```typescript
{
  tools: [
    {
      type: "function",
      function: {
        name: "function_name",        // 函数名称
        description: "函数描述",       // 帮助 LLM 理解何时调用
        parameters: {                  // JSON Schema 格式的参数定义
          type: "object",
          properties: {
            param1: {
              type: "string",
              description: "参数描述"
            },
            param2: {
              type: "number",
              description: "参数描述"
            }
          },
          required: ["param1"]         // 必需参数列表
        }
      }
    }
  ]
}
```

### 实际示例（来自你的代码）

```typescript
// agent.ts 第 45-62 行
private formatToolsForOpenAI(): OpenAI.Chat.Completions.ChatCompletionTool[] {
  const openaiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [];

  for (const [serverName, tools] of Object.entries(this.availableTools)) {
    for (const tool of tools) {
      openaiTools.push({
        type: 'function',
        function: {
          name: `${serverName}__${tool.name}`,  // 例如: "calculator__add"
          description: `[来自 ${serverName} 服务器] ${tool.description || '无描述'}`,
          parameters: tool.inputSchema as OpenAI.FunctionParameters,
        },
      });
    }
  }

  return openaiTools;
}
```

### 转换示例：MCP Tool → OpenAI Function

**MCP Tool 格式**（来自 calculator-server.ts）:
```typescript
{
  name: 'add',
  description: '执行加法运算',
  inputSchema: {
    type: 'object',
    properties: {
      a: { type: 'number', description: '第一个数字' },
      b: { type: 'number', description: '第二个数字' },
    },
    required: ['a', 'b'],
  },
}
```

**转换后的 OpenAI Function 格式**:
```typescript
{
  type: 'function',
  function: {
    name: 'calculator__add',
    description: '[来自 calculator 服务器] 执行加法运算',
    parameters: {
      type: 'object',
      properties: {
        a: { type: 'number', description: '第一个数字' },
        b: { type: 'number', description: '第二个数字' },
      },
      required: ['a', 'b'],
    }
  }
}
```

## 2. LLM 返回的工具调用格式（Tool Calls）

当 LLM 决定调用工具时，会在 `assistant` 消息中包含 `tool_calls` 字段。

### 格式结构

```typescript
{
  role: "assistant",
  content: "我需要计算一下...",  // 可能为 null
  tool_calls: [
    {
      id: "call_abc123",           // 唯一标识符，用于匹配结果
      type: "function",
      function: {
        name: "calculator__add",   // 函数名称
        arguments: "{\"a\": 2, \"b\": 3}"  // JSON 字符串格式的参数
      }
    }
  ]
}
```

### 实际示例（来自你的代码）

```typescript
// agent.ts 第 186-195 行
if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
  assistantMsg.tool_calls = assistantMessage.tool_calls.map((tc) => ({
    id: tc.id,                      // 例如: "call_abc123"
    type: tc.type,                  // "function"
    function: {
      name: tc.function.name,       // 例如: "calculator__add"
      arguments: tc.function.arguments,  // 例如: '{"a": 2, "b": 3}'
    },
  }));
}
```

### 完整对话消息示例

```typescript
const messages = [
  {
    role: "system",
    content: "你是一个智能助手..."
  },
  {
    role: "user",
    content: "帮我计算 2 + 3"
  },
  {
    role: "assistant",
    content: null,  // 当有 tool_calls 时，content 通常为 null
    tool_calls: [
      {
        id: "call_abc123",
        type: "function",
        function: {
          name: "calculator__add",
          arguments: '{"a": 2, "b": 3}'
        }
      }
    ]
  }
]
```

## 3. 工具执行结果格式（Tool Result）

执行工具后，需要将结果以 `role: "tool"` 的消息返回给 LLM。

### 格式结构

```typescript
{
  role: "tool",
  tool_call_id: "call_abc123",  // 对应 tool_calls 中的 id
  name: "calculator__add",      // 函数名称
  content: "{\"result\": 5}"    // JSON 字符串格式的结果
}
```

### 实际示例（来自你的代码）

```typescript
// agent.ts 第 209-224 行
for (const toolCall of toolCalls) {
  const functionName = toolCall.function.name;
  const functionArgs = JSON.parse(toolCall.function.arguments);
  
  // 执行工具调用
  const result = await this.executeToolCall(functionName, functionArgs);
  
  // 添加工具结果消息
  messages.push({
    role: 'tool',
    tool_call_id: toolCall.id,        // 匹配 tool_calls 中的 id
    name: functionName,                // "calculator__add"
    content: JSON.stringify(result),   // '{"result": 5, "operation": "add", ...}'
  });
}
```

## 4. 完整对话流程示例

### 步骤 1: 用户请求
```typescript
messages = [
  { role: "user", content: "帮我计算 2 + 3" }
]
```

### 步骤 2: 调用 API（带 tools 参数）
```typescript
const response = await client.chat.completions.create({
  model: "deepseek-chat",
  messages: messages,
  tools: [
    {
      type: "function",
      function: {
        name: "calculator__add",
        description: "执行加法运算",
        parameters: {
          type: "object",
          properties: {
            a: { type: "number" },
            b: { type: "number" }
          },
          required: ["a", "b"]
        }
      }
    }
  ]
});
```

### 步骤 3: LLM 返回 tool_calls
```typescript
assistantMessage = {
  role: "assistant",
  content: null,
  tool_calls: [
    {
      id: "call_abc123",
      type: "function",
      function: {
        name: "calculator__add",
        arguments: '{"a": 2, "b": 3}'
      }
    }
  ]
}
```

### 步骤 4: 执行工具并添加结果
```typescript
// 执行工具
const result = await executeTool("calculator__add", { a: 2, b: 3 });
// result = { result: 5, operation: "add", a: 2, b: 3 }

// 添加工具结果
messages.push({
  role: "tool",
  tool_call_id: "call_abc123",
  name: "calculator__add",
  content: JSON.stringify(result)
});
```

### 步骤 5: 再次调用 API（包含工具结果）
```typescript
const response = await client.chat.completions.create({
  model: "deepseek-chat",
  messages: [
    { role: "user", content: "帮我计算 2 + 3" },
    { 
      role: "assistant", 
      content: null,
      tool_calls: [{ id: "call_abc123", ... }]
    },
    { 
      role: "tool", 
      tool_call_id: "call_abc123",
      name: "calculator__add",
      content: '{"result": 5, ...}'
    }
  ],
  tools: [...]  // 仍然需要提供 tools
});
```

### 步骤 6: LLM 返回最终答案
```typescript
assistantMessage = {
  role: "assistant",
  content: "2 + 3 = 5",
  tool_calls: undefined  // 没有工具调用，返回最终答案
}
```

## 5. LLM 支持要求

### ✅ 需要 LLM 支持 Function Calling

**是的，这个能力需要 LLM 本身支持 Function Calling。**

### 支持情况

1. **OpenAI 模型**
   - ✅ GPT-3.5-turbo (1106+)
   - ✅ GPT-4
   - ✅ GPT-4-turbo
   - ✅ GPT-4o

2. **兼容 OpenAI API 的模型**
   - ✅ DeepSeek (你代码中使用的)
   - ✅ Claude (Anthropic，但格式略有不同)
   - ✅ 其他兼容 OpenAI API 的模型

3. **不支持 Function Calling 的模型**
   - ❌ 早期版本的 GPT-3
   - ❌ 一些开源模型（除非专门训练支持）

### 如何判断模型是否支持

1. **查看模型文档**：官方文档会说明是否支持 `tools` 参数
2. **测试调用**：尝试传入 `tools` 参数，如果不支持会返回错误
3. **检查 API 版本**：通常较新的 API 版本才支持

### 在你的代码中

```typescript
// agent.ts 第 152-161 行
const response = await this.client.chat.completions.create({
  model: this.config.deepseek.model,  // 例如: "deepseek-chat"
  messages: [...],
  tools: tools.length > 0 ? tools : undefined,  // 如果模型不支持，这里会报错
  // ...
});
```

DeepSeek 支持 OpenAI 兼容的 Function Calling，所以你的代码可以正常工作。

## 6. 关键要点总结

1. **工具定义**：使用 JSON Schema 格式定义函数签名
2. **工具调用**：LLM 返回 `tool_calls` 数组，包含函数名和参数（JSON 字符串）
3. **工具结果**：使用 `role: "tool"` 消息返回结果，必须包含 `tool_call_id` 匹配
4. **多轮对话**：工具调用和结果都作为消息历史的一部分
5. **LLM 支持**：必须使用支持 Function Calling 的模型

## 7. 与 MCP 的关系

- **MCP** 提供工具的标准定义和发现机制
- **Function Call** 是 LLM 使用这些工具的方式
- **Agent** 作为桥梁，将 MCP 工具转换为 LLM 可理解的格式

```
MCP Tool (标准格式)
    ↓
Agent 转换 (formatToolsForOpenAI)
    ↓
OpenAI Function (LLM 可理解)
    ↓
LLM 决定调用 (tool_calls)
    ↓
Agent 执行 (executeToolCall)
    ↓
返回结果 (role: "tool")
    ↓
LLM 生成最终回复
```
