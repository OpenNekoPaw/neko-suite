/**
 * AgentRunner 单元测试
 *
 * 注意：AgentRunner 现在依赖 Platform 和 Service 实例，
 * 测试需要模拟这些依赖或使用集成测试方式。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentRunner, IAgentConfig, AgentEvent } from './agentRunner';
import { IAgentContext } from './agentContext';
import type {
  Platform,
  Service,
  ServiceStreamResponse,
  ChatResponse,
  ChatChunk,
  ToolCall,
} from '@neko/platform';
import { ToolRegistry } from '@neko/agent';

// =============================================================================
// Mock Service
// =============================================================================

function createMockService(
  options: {
    simulateToolCalls?: boolean;
    responseText?: string;
  } = {},
): Service {
  const { simulateToolCalls = false, responseText = 'Mock response' } = options;

  const mockToolCalls: ToolCall[] = simulateToolCalls
    ? [{ id: 'call-1', type: 'function', function: { name: 'test_tool', arguments: '{}' } }]
    : [];

  return {
    chat: vi.fn().mockResolvedValue({
      id: 'chat-1',
      model: 'test-model',
      message: {
        role: 'assistant',
        content: responseText,
        toolCalls: mockToolCalls.length > 0 ? mockToolCalls : undefined,
      },
      finishReason: simulateToolCalls ? 'tool_calls' : 'stop',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    } as ChatResponse),

    chatStream: vi.fn().mockReturnValue({
      stream: (async function* (): AsyncIterable<ChatChunk> {
        // Yield text content
        yield { id: 'stream-1', model: 'test-model', delta: { content: responseText } };
        // Yield tool calls if requested
        if (simulateToolCalls) {
          yield { id: 'stream-1', model: 'test-model', delta: { toolCalls: mockToolCalls } };
        }
        // Yield finish
        yield {
          id: 'stream-1',
          model: 'test-model',
          delta: {},
          finishReason: simulateToolCalls ? 'tool_calls' : 'stop',
        };
      })(),
      response: Promise.resolve({
        id: 'chat-1',
        model: 'test-model',
        message: { role: 'assistant', content: responseText },
        finishReason: simulateToolCalls ? 'tool_calls' : 'stop',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        routing: { modelId: 'test-model', providerId: 'test-provider', attempts: 1 },
        timing: { startTime: Date.now(), endTime: Date.now(), duration: 0 },
      } as ServiceResponse),
    } as ServiceStreamResponse),
  } as unknown as Service;
}

// =============================================================================
// Mock Platform
// =============================================================================

function createMockPlatform(
  service: Service,
  options: {
    simulateToolCalls?: boolean;
    responseText?: string;
  } = {},
): Platform {
  const { simulateToolCalls = false, responseText = 'Mock response' } = options;

  const mockToolCalls = simulateToolCalls
    ? [{ id: 'call-1', name: 'test_tool', arguments: {} }]
    : undefined;

  // Create a mock AgentExecutor that returns steps via executeStream
  const mockExecutor = {
    executeStream: vi.fn().mockImplementation(async function* (
      input: string,
      context: { messages: Array<{ role: string; content: string }> },
    ) {
      // Simulate adding user message like real AgentExecutor does
      context.messages.push({ role: 'user', content: input });

      // Yield think step
      yield {
        type: 'think',
        content: responseText,
        toolCalls: mockToolCalls,
        timestamp: Date.now(),
      };

      // If tool calls, yield act and observe steps
      if (simulateToolCalls) {
        yield {
          type: 'act',
          content: 'Executed 1 tool(s)',
          toolCalls: mockToolCalls,
          toolResults: [
            {
              callId: 'call-1',
              name: 'test_tool',
              success: true,
              data: { result: 'success' },
            },
          ],
          timestamp: Date.now(),
        };
        yield {
          type: 'observe',
          content: 'Tool 1 (test_tool): Success',
          timestamp: Date.now(),
        };
        // Yield final response
        yield {
          type: 'respond',
          content: 'Task completed',
          timestamp: Date.now(),
        };
      } else {
        // No tool calls, yield respond directly
        yield {
          type: 'respond',
          content: responseText,
          timestamp: Date.now(),
        };
      }

      // Simulate adding assistant message like real AgentExecutor does
      context.messages.push({ role: 'assistant', content: responseText });
    }),
    abort: vi.fn(),
  };

  return {
    createService: vi.fn().mockReturnValue(service),
    tools: new ToolRegistry(),
    config: {} as any,
    providers: {} as any,
    groups: {} as any,
    createAgent: vi.fn().mockReturnValue(mockExecutor),
    dispose: vi.fn(),
  } as unknown as Platform;
}

// =============================================================================
// Helper Functions
// =============================================================================

async function collectEvents(generator: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of generator) {
    events.push(event);
  }
  return events;
}

// =============================================================================
// 测试套件
// =============================================================================

describe('AgentRunner', () => {
  let runner: AgentRunner;
  let mockService: Service;
  let mockPlatform: Platform;

  beforeEach(() => {
    runner = new AgentRunner();
    mockService = createMockService();
    mockPlatform = createMockPlatform(mockService);
  });

  describe('配置', () => {
    it('应该能够配置 Agent', () => {
      const config: IAgentConfig = {
        platform: mockPlatform,
        systemPrompt: 'Test prompt',
        maxIterations: 5,
        temperature: 0.7,
      };

      runner.configure(config);

      const storedConfig = runner.getConfig();
      expect(storedConfig).toBe(config);
      expect(storedConfig?.systemPrompt).toBe('Test prompt');
      expect(storedConfig?.maxIterations).toBe(5);
    });

    it('未配置时 getConfig 应该返回 undefined', () => {
      expect(runner.getConfig()).toBeUndefined();
    });
  });

  describe('执行状态', () => {
    it('应该能够检查是否正在运行', () => {
      expect(runner.isRunning()).toBe(false);
    });

    it('应该在执行时触发 onDidStart 事件', async () => {
      const config: IAgentConfig = {
        platform: mockPlatform,
        maxIterations: 1,
      };
      runner.configure(config);

      const listener = vi.fn();
      runner.onDidStart(listener);

      const context: IAgentContext = {};
      const generator = runner.execute('test', context);

      // 开始执行
      await generator.next();

      expect(listener).toHaveBeenCalled();
    });

    it('应该在完成后触发 onDidStop 事件', async () => {
      const config: IAgentConfig = {
        platform: mockPlatform,
        maxIterations: 1,
      };
      runner.configure(config);

      const listener = vi.fn();
      runner.onDidStop(listener);

      const context: IAgentContext = {};
      await collectEvents(runner.execute('test', context));

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('错误处理', () => {
    it('未配置时执行应该返回错误', async () => {
      const context: IAgentContext = {};
      const events = await collectEvents(runner.execute('test', context));

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('error');
      expect(events[0].error?.message).toBe('Agent not configured');
    });

    it('重复执行应该返回错误', async () => {
      const config: IAgentConfig = {
        platform: mockPlatform,
        maxIterations: 10,
      };
      runner.configure(config);

      const context: IAgentContext = {};

      // 启动第一个执行
      const generator1 = runner.execute('test1', context);
      await generator1.next(); // 启动

      // 尝试启动第二个执行
      const events = await collectEvents(runner.execute('test2', context));

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('error');
      expect(events[0].error?.message).toBe('Agent is already running');

      // 清理第一个执行
      for await (const _ of generator1) {
        // consume all events
      }
    });
  });

  describe('对话历史', () => {
    it('应该记录用户消息', async () => {
      const config: IAgentConfig = {
        platform: mockPlatform,
        maxIterations: 1,
      };
      runner.configure(config);

      const context: IAgentContext = {};
      await collectEvents(runner.execute('Hello', context));

      const history = runner.getHistory();
      expect(history.length).toBeGreaterThan(1); // system + user + assistant

      // 第一条是系统消息
      expect(history[0].role).toBe('system');

      // 查找用户消息
      const userMsg = history.find((m) => m.role === 'user');
      expect(userMsg).toBeDefined();
      expect(userMsg?.content).toBe('Hello');
    });

    it('应该能够清除历史', () => {
      runner.addMessage({ role: 'user', content: 'test' });
      expect(runner.getHistory()).toHaveLength(1);

      runner.clearHistory();
      expect(runner.getHistory()).toHaveLength(0);
    });

    it('应该能够手动添加消息', () => {
      runner.addMessage({ role: 'user', content: 'msg1' });
      runner.addMessage({ role: 'assistant', content: 'msg2' });

      const history = runner.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0].content).toBe('msg1');
      expect(history[1].content).toBe('msg2');
    });

    it('getHistory 应该返回副本', () => {
      runner.addMessage({ role: 'user', content: 'test' });

      const history1 = runner.getHistory();
      const history2 = runner.getHistory();

      expect(history1).not.toBe(history2); // 不同的实例
      expect(history1).toEqual(history2); // 但内容相同
    });
  });

  describe('工具调用', () => {
    it('应该能够调用工具', async () => {
      // 创建模拟返回工具调用的 platform
      mockService = createMockService({ simulateToolCalls: true });
      mockPlatform = createMockPlatform(mockService, { simulateToolCalls: true });

      const config: IAgentConfig = {
        platform: mockPlatform,
        maxIterations: 3,
        autoExecuteTools: true,
      };
      runner.configure(config);

      const context: IAgentContext = {};
      const events = await collectEvents(runner.execute('add something', context));

      // 验证事件序列 - AgentRunner 委托给 Platform 的 AgentExecutor
      const toolCallEvents = events.filter((e) => e.type === 'tool_call');
      const toolResultEvents = events.filter((e) => e.type === 'tool_result');

      expect(toolCallEvents.length).toBeGreaterThan(0);
      expect(toolResultEvents.length).toBeGreaterThan(0);
      expect(toolResultEvents[0].toolResult?.success).toBe(true);
    });

    it('工具执行失败应该捕获错误', async () => {
      mockService = createMockService({ simulateToolCalls: true });

      // Create platform with failed tool result
      const mockExecutorWithFailure = {
        executeStream: vi.fn().mockImplementation(async function* () {
          yield {
            type: 'think',
            content: '',
            toolCalls: [{ id: 'call-1', name: 'test_tool', arguments: {} }],
            timestamp: Date.now(),
          };
          yield {
            type: 'act',
            content: 'Executed 1 tool(s)',
            toolResults: [
              {
                callId: 'call-1',
                name: 'test_tool',
                success: false,
                error: 'Tool execution failed',
              },
            ],
            timestamp: Date.now(),
          };
          yield {
            type: 'respond',
            content: 'Tool failed',
            timestamp: Date.now(),
          };
        }),
        abort: vi.fn(),
      };

      mockPlatform = {
        createService: vi.fn().mockReturnValue(mockService),
        tools: new ToolRegistry(),
        config: {} as any,
        providers: {} as any,
        groups: {} as any,
        createAgent: vi.fn().mockReturnValue(mockExecutorWithFailure),
        dispose: vi.fn(),
      } as unknown as Platform;

      const config: IAgentConfig = {
        platform: mockPlatform,
        maxIterations: 3,
        autoExecuteTools: true,
      };
      runner.configure(config);

      const context: IAgentContext = {};
      const events = await collectEvents(runner.execute('call tool', context));

      const toolResultEvents = events.filter((e) => e.type === 'tool_result');
      expect(toolResultEvents.length).toBeGreaterThan(0);

      const failedResult = toolResultEvents.find((e) => !e.toolResult?.success);
      expect(failedResult).toBeDefined();
      expect(failedResult?.toolResult?.error).toContain('Tool execution failed');
    });

    it('应该正确传递 tool_call_id', async () => {
      mockService = createMockService({ simulateToolCalls: true });
      mockPlatform = createMockPlatform(mockService, { simulateToolCalls: true });

      const config: IAgentConfig = {
        platform: mockPlatform,
        maxIterations: 3,
        autoExecuteTools: true,
      };
      runner.configure(config);

      const context: IAgentContext = {};
      const events = await collectEvents(runner.execute('call tool', context));

      const toolCallEvents = events.filter((e) => e.type === 'tool_call');
      const toolResultEvents = events.filter((e) => e.type === 'tool_result');

      // 验证 tool_call_id 一致性
      expect(toolCallEvents.length).toBeGreaterThan(0);
      expect(toolResultEvents.length).toBeGreaterThan(0);
      expect(toolCallEvents[0].toolCall?.id).toBe('call-1');
      expect(toolResultEvents[0].toolResult?.toolCallId).toBe('call-1');
    });
  });

  describe('取消执行', () => {
    it('应该能够取消执行', async () => {
      const config: IAgentConfig = {
        platform: mockPlatform,
        maxIterations: 10,
      };
      runner.configure(config);

      const context: IAgentContext = {};
      const generator = runner.execute('long task', context);

      // 开始执行
      await generator.next();

      // 立即取消
      runner.cancel();

      // 收集剩余事件
      const events: AgentEvent[] = [];
      for await (const event of generator) {
        events.push(event);
      }

      // 应该停止执行
      expect(runner.isRunning()).toBe(false);
    });
  });

  describe('流式响应', () => {
    it('应该产生 text 事件', async () => {
      const config: IAgentConfig = {
        platform: mockPlatform,
        maxIterations: 1,
      };
      runner.configure(config);

      const context: IAgentContext = {};
      const events = await collectEvents(runner.execute('hello', context));

      const textEvents = events.filter((e) => e.type === 'text');
      expect(textEvents.length).toBeGreaterThan(0);
      expect(textEvents.some((e) => e.content)).toBe(true);
    });

    it('应该产生 iteration 事件', async () => {
      const config: IAgentConfig = {
        platform: mockPlatform,
        maxIterations: 3,
      };
      runner.configure(config);

      const context: IAgentContext = {};
      const events = await collectEvents(runner.execute('test', context));

      const iterationEvents = events.filter((e) => e.type === 'iteration');
      expect(iterationEvents.length).toBeGreaterThan(0);

      const firstIteration = iterationEvents[0];
      expect(firstIteration.iteration?.current).toBe(1);
      expect(firstIteration.iteration?.max).toBe(3);
    });

    it('应该在结束时产生 done 事件', async () => {
      const config: IAgentConfig = {
        platform: mockPlatform,
        maxIterations: 1,
      };
      runner.configure(config);

      const context: IAgentContext = {};
      const events = await collectEvents(runner.execute('test', context));

      const doneEvents = events.filter((e) => e.type === 'done');
      expect(doneEvents.length).toBeGreaterThan(0);
    });
  });

  describe('生命周期', () => {
    it('dispose 应该取消执行', async () => {
      const config: IAgentConfig = {
        platform: mockPlatform,
        maxIterations: 10,
      };
      runner.configure(config);

      const context: IAgentContext = {};
      const generator = runner.execute('task', context);

      await generator.next(); // 开始执行

      runner.dispose();

      expect(runner.isRunning()).toBe(false);
    });
  });
});
