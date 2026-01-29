/**
 * OpenAI Function Call 格式代码示例
 * 
 * 这个文件展示了如何手动构造和使用 OpenAI Function Call 格式
 */

import OpenAI from 'openai';

// ============================================
// 1. 工具定义格式
// ============================================

// 定义工具列表（Tools Definition）
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'calculator__add',
      description: '[来自 calculator 服务器] 执行加法运算',
      parameters: {
        type: 'object',
        properties: {
          a: {
            type: 'number',
            description: '第一个数字',
          },
          b: {
            type: 'number',
            description: '第二个数字',
          },
        },
        required: ['a', 'b'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'time__get_current_time',
      description: '[来自 time 服务器] 获取当前时间',
      parameters: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: '时区，例如 Asia/Shanghai',
          },
        },
        required: [],
      },
    },
  },
];

// ============================================
// 2. 消息类型定义
// ============================================

// 消息类型（包含 tool_calls）
type MessageWithToolCalls = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string; // JSON 字符串
    };
  }>;
  tool_call_id?: string; // 仅用于 role: 'tool'
  name?: string; // 仅用于 role: 'tool'
};

// ============================================
// 3. 第一次 API 调用（用户请求）
// ============================================

async function firstApiCall(client: OpenAI) {
  const messages: MessageWithToolCalls[] = [
    {
      role: 'system',
      content: '你是一个智能助手，可以通过调用各种工具来帮助用户完成任务。',
    },
    {
      role: 'user',
      content: '帮我计算 15 + 27，然后告诉我现在的时间',
    },
  ];

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    tools: tools, // 提供工具定义
    temperature: 0.7,
    max_tokens: 4096,
  });

  const assistantMessage = response.choices[0]?.message;

  // LLM 返回的格式示例：
  // {
  //   role: "assistant",
  //   content: null,
  //   tool_calls: [
  //     {
  //       id: "call_calc_001",
  //       type: "function",
  //       function: {
  //         name: "calculator__add",
  //         arguments: '{"a": 15, "b": 27}'  // 注意：是 JSON 字符串
  //       }
  //     },
  //     {
  //       id: "call_time_001",
  //       type: "function",
  //       function: {
  //         name: "time__get_current_time",
  //         arguments: '{"timezone": "Asia/Shanghai"}'
  //       }
  //     }
  //   ]
  // }

  return assistantMessage;
}

// ============================================
// 4. 执行工具调用
// ============================================

async function executeToolCall(
  toolName: string,
  arguments_: Record<string, unknown>
): Promise<unknown> {
  // 解析工具名称（格式：server__tool_name）
  const [serverName, actualToolName] = toolName.split('__', 2);

  // 根据服务器和工具名称执行相应的逻辑
  if (serverName === 'calculator' && actualToolName === 'add') {
    const a = arguments_.a as number;
    const b = arguments_.b as number;
    return {
      result: a + b,
      operation: 'add',
      a,
      b,
    };
  }

  if (serverName === 'time' && actualToolName === 'get_current_time') {
    const timezone = (arguments_.timezone as string) || 'UTC';
    return {
      current_time: new Date().toISOString(),
      timezone,
      formatted: new Date().toLocaleString('zh-CN', {
        timeZone: timezone,
      }),
    };
  }

  throw new Error(`未知工具: ${toolName}`);
}

// ============================================
// 5. 处理工具调用并添加结果
// ============================================

function processToolCalls(
  messages: MessageWithToolCalls[],
  assistantMessage: OpenAI.Chat.Completions.ChatCompletionMessage
): MessageWithToolCalls[] {
  // 1. 添加 assistant 消息（包含 tool_calls）
  const assistantMsg: MessageWithToolCalls = {
    role: 'assistant',
    content: assistantMessage.content,
  };

  if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    assistantMsg.tool_calls = assistantMessage.tool_calls.map((tc) => ({
      id: tc.id,
      type: tc.type,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments, // 已经是 JSON 字符串
      },
    }));
  }

  messages.push(assistantMsg);

  // 2. 执行工具调用并添加结果
  if (assistantMessage.tool_calls) {
    for (const toolCall of assistantMessage.tool_calls) {
      // 解析参数（从 JSON 字符串转换为对象）
      const functionArgs = JSON.parse(toolCall.function.arguments);

      // 执行工具（这里是同步的，实际应该是异步的）
      const result = executeToolCall(toolCall.function.name, functionArgs);

      // 添加工具结果消息
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id, // 关键：必须匹配 tool_calls 中的 id
        name: toolCall.function.name,
        content: JSON.stringify(result), // 结果必须是 JSON 字符串
      });
    }
  }

  return messages;
}

// ============================================
// 6. 第二次 API 调用（包含工具结果）
// ============================================

async function secondApiCall(
  client: OpenAI,
  messages: MessageWithToolCalls[]
) {
  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    tools: tools, // 仍然需要提供工具（LLM 可能还需要调用其他工具）
    temperature: 0.7,
    max_tokens: 4096,
  });

  const assistantMessage = response.choices[0]?.message;

  // 如果还有 tool_calls，继续循环
  // 如果没有 tool_calls，返回最终答案
  // {
  //   role: "assistant",
  //   content: "15 + 27 = 42\n\n现在的时间是：2026年1月28日 14:30:00",
  //   tool_calls: null
  // }

  return assistantMessage;
}

// ============================================
// 7. 完整的对话流程示例
// ============================================

async function completeChatFlow(client: OpenAI, userMessage: string) {
  const messages: MessageWithToolCalls[] = [
    {
      role: 'system',
      content: '你是一个智能助手，可以通过调用各种工具来帮助用户完成任务。',
    },
    {
      role: 'user',
      content: userMessage,
    },
  ];

  const maxIterations = 10;
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;

    // 调用 API
    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      tools: tools.length > 0 ? tools : undefined,
      temperature: 0.7,
      max_tokens: 4096,
    });

    const assistantMessage = response.choices[0]?.message;
    if (!assistantMessage) {
      break;
    }

    // 添加 assistant 消息
    const assistantMsg: MessageWithToolCalls = {
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
    if (toolCalls.length === 0) {
      // 没有工具调用，返回最终回复
      return assistantMessage.content || '抱歉，我无法处理这个请求。';
    }

    // 执行工具调用
    for (const toolCall of toolCalls) {
      const functionName = toolCall.function.name;
      const functionArgs = JSON.parse(toolCall.function.arguments);

      // 执行工具（实际应该是异步的）
      const result = await executeToolCall(functionName, functionArgs);

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

// ============================================
// 8. 关键格式要点
// ============================================

/**
 * 工具定义格式要点：
 * 
 * 1. type 必须是 "function"
 * 2. function.name 是函数名称（在你的代码中使用 server__tool_name 格式）
 * 3. function.description 帮助 LLM 理解何时调用
 * 4. function.parameters 使用 JSON Schema 格式
 * 5. parameters.required 指定必需参数
 */

/**
 * tool_calls 格式要点：
 * 
 * 1. id 是唯一标识符，用于匹配工具结果
 * 2. type 必须是 "function"
 * 3. function.arguments 是 JSON 字符串，不是对象
 * 4. 一个 assistant 消息可以包含多个 tool_calls（并行调用）
 */

/**
 * 工具结果格式要点：
 * 
 * 1. role 必须是 "tool"
 * 2. tool_call_id 必须与 tool_calls 中的 id 匹配
 * 3. name 是函数名称
 * 4. content 是 JSON 字符串格式的结果
 */

/**
 * LLM 支持要求：
 * 
 * 1. 必须使用支持 Function Calling 的模型
 * 2. OpenAI: GPT-3.5-turbo (1106+), GPT-4, GPT-4-turbo, GPT-4o
 * 3. DeepSeek: 支持 OpenAI 兼容的 Function Calling
 * 4. Claude: 支持但格式略有不同（使用 tools 而不是 function）
 * 5. 如果不支持，API 会返回错误
 */

export {
  tools,
  firstApiCall,
  executeToolCall,
  processToolCalls,
  secondApiCall,
  completeChatFlow,
};
