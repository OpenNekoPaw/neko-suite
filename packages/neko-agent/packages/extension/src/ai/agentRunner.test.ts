/**
 * AgentRunner unit tests
 *
 * AgentRunner delegates to AgentSession from @neko/agent.
 * Tests mock createAgentSession and toSharedService to isolate the wrapper logic.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Platform, Service } from '@neko/platform';
import { ToolRegistry } from '@neko/agent';
import { AgentRunner, type AgentEvent, type IAgentConfig } from './agentRunner';

// =============================================================================
// Module mocks
// =============================================================================

// Mock vscode (already handled by __mocks__/vscode.ts, but ensure EventEmitter works)
vi.mock('vscode', () => {
  class EventEmitter<T> {
    private _listeners: Array<(e: T) => void> = [];
    get event() {
      return (listener: (e: T) => void) => {
        this._listeners.push(listener);
        return { dispose: () => {} };
      };
    }
    fire(data: T) {
      for (const l of this._listeners) l(data);
    }
    dispose() {
      this._listeners = [];
    }
  }
  return {
    EventEmitter,
    Uri: { file: (p: string) => ({ fsPath: p }) },
    workspace: { workspaceFolders: undefined },
  };
});

vi.mock('../base', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  createServiceId: vi.fn((name: string) => name),
}));

// Mock @neko/platform — toSharedService and getBuiltinPrompt
vi.mock('@neko/platform', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    toSharedService: vi.fn((s: unknown) => s),
    getBuiltinPrompt: vi.fn(() => undefined),
  };
});

// Track the latest mock session created
let latestMockSession: ReturnType<typeof createMockSession>;

// Mock @neko/agent — createAgentSession + createSystemPromptBuilder
vi.mock('@neko/agent', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    createAgentSession: vi.fn(() => {
      latestMockSession = createMockSession();
      return latestMockSession;
    }),
    createSystemPromptBuilder: vi.fn(() => ({
      loadAgentsFile: vi.fn().mockResolvedValue(undefined),
      getAgentsContent: vi.fn().mockReturnValue(null),
      build: vi.fn().mockReturnValue('default prompt'),
    })),
    getDefaultPersonalPath: vi.fn().mockReturnValue('~/.neko'),
  };
});

// =============================================================================
// Mock Session Factory
// =============================================================================

function createMockSession(
  options: {
    events?: AgentEvent[];
  } = {},
) {
  const history: Array<{ role: string; content: string }> = [];
  const events = options.events ?? [{ type: 'text' as const, content: 'Mock response' }];

  return {
    execute: vi.fn().mockImplementation(async function* () {
      for (const event of events) {
        yield event;
      }
    }),
    cancel: vi.fn(),
    isRunning: vi.fn().mockReturnValue(false),
    getHistory: vi.fn(() => [...history]),
    clearHistory: vi.fn(() => {
      history.length = 0;
    }),
    addMessage: vi.fn((msg: { role: string; content: string }) => {
      history.push(msg);
    }),
    loadHistory: vi.fn(),
    getTokenCount: vi.fn().mockReturnValue(100),
    compressContext: vi
      .fn()
      .mockResolvedValue({ originalTokens: 100, compressedTokens: 50, ratio: 0.5 }),
    confirmTool: vi.fn(),
    getPendingConfirmations: vi.fn().mockReturnValue([]),
    configure: vi.fn(),
    getExecutionMode: vi.fn().mockReturnValue('auto'),
    setExecutionMode: vi.fn(),
    dispose: vi.fn(),
  };
}

// =============================================================================
// Mock Platform Factory
// =============================================================================

function createMockPlatform(): Platform {
  return {
    createService: vi.fn().mockReturnValue({} as Service),
    tools: new ToolRegistry(),
    config: {} as any,
    providers: {} as any,
    groups: {} as any,
    createAgent: vi.fn(),
    dispose: vi.fn(),
  } as unknown as Platform;
}

// =============================================================================
// Helpers
// =============================================================================

async function collectEvents(iterable: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

/** Get the underlying AsyncIterator so we can call .next() */
function toIterator(iterable: AsyncIterable<AgentEvent>) {
  return iterable[Symbol.asyncIterator]();
}

// =============================================================================
// Tests
// =============================================================================

describe('AgentRunner', () => {
  let runner: AgentRunner;
  let mockPlatform: Platform;

  beforeEach(() => {
    vi.clearAllMocks();
    runner = new AgentRunner();
    mockPlatform = createMockPlatform();
  });

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  describe('配置', () => {
    it('应该能够配置 Agent', async () => {
      const config: IAgentConfig = {
        platform: mockPlatform,
        systemPrompt: 'Test prompt',
        maxIterations: 5,
        temperature: 0.7,
      };

      await runner.configure(config);

      const storedConfig = runner.getConfig();
      expect(storedConfig).toBe(config);
      expect(storedConfig?.systemPrompt).toBe('Test prompt');
      expect(storedConfig?.maxIterations).toBe(5);
    });

    it('未配置时 getConfig 应该返回 undefined', () => {
      expect(runner.getConfig()).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Execution state
  // ---------------------------------------------------------------------------

  describe('执行状态', () => {
    it('应该能够检查是否正在运行', () => {
      expect(runner.isRunning()).toBe(false);
    });

    it('应该在执行时触发 onDidStart 事件', async () => {
      await runner.configure({ platform: mockPlatform, maxIterations: 1 });

      const listener = vi.fn();
      runner.onDidStart(listener);

      const iterable = runner.execute('test', {});
      await toIterator(iterable).next();

      expect(listener).toHaveBeenCalled();
    });

    it('应该在完成后触发 onDidStop 事件', async () => {
      await runner.configure({ platform: mockPlatform, maxIterations: 1 });

      const listener = vi.fn();
      runner.onDidStop(listener);

      await collectEvents(runner.execute('test', {}));

      expect(listener).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------

  describe('错误处理', () => {
    it('未配置时执行应该返回错误', async () => {
      const events = await collectEvents(runner.execute('test', {}));

      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe('error');
      expect(events[0]!.error?.message).toBe('Agent not configured');
    });

    it('重复执行应该将消息加入队列', async () => {
      await runner.configure({ platform: mockPlatform, maxIterations: 10 });

      // Start first execution
      const iterable1 = runner.execute('test1', {});
      await toIterator(iterable1).next(); // start

      // Attempt second execution while first is running
      const events = await collectEvents(runner.execute('test2', {}));

      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe('messageQueued');
      expect(events[0]!.content).toContain('1 pending');

      // Cleanup first execution
      for await (const _ of iterable1) {
        /* consume */
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Conversation history (requires session via configure)
  // ---------------------------------------------------------------------------

  describe('对话历史', () => {
    it('未配置时 getHistory 返回空数组', () => {
      expect(runner.getHistory()).toEqual([]);
    });

    it('配置后应该能够添加和获取消息', async () => {
      await runner.configure({ platform: mockPlatform });

      runner.addMessage({ role: 'user', content: 'msg1' });
      runner.addMessage({ role: 'assistant', content: 'msg2' });

      const history = runner.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0]!.content).toBe('msg1');
      expect(history[1]!.content).toBe('msg2');
    });

    it('配置后应该能够清除历史', async () => {
      await runner.configure({ platform: mockPlatform });

      runner.addMessage({ role: 'user', content: 'test' });
      expect(runner.getHistory()).toHaveLength(1);

      runner.clearHistory();
      expect(runner.getHistory()).toHaveLength(0);
    });

    it('getHistory 应该返回副本', async () => {
      await runner.configure({ platform: mockPlatform });

      runner.addMessage({ role: 'user', content: 'test' });

      const history1 = runner.getHistory();
      const history2 = runner.getHistory();

      expect(history1).not.toBe(history2);
      expect(history1).toEqual(history2);
    });
  });

  // ---------------------------------------------------------------------------
  // Streaming
  // ---------------------------------------------------------------------------

  describe('流式响应', () => {
    it('应该产生 session 事件并附加 done 事件', async () => {
      await runner.configure({ platform: mockPlatform, maxIterations: 1 });

      const events = await collectEvents(runner.execute('hello', {}));

      // Session yields 'text', then AgentRunner appends 'done'
      const textEvents = events.filter((e) => e.type === 'text');
      expect(textEvents.length).toBeGreaterThan(0);
      expect(textEvents.some((e) => e.content === 'Mock response')).toBe(true);
    });

    it('应该在结束时产生 done 事件', async () => {
      await runner.configure({ platform: mockPlatform, maxIterations: 1 });

      const events = await collectEvents(runner.execute('test', {}));

      const doneEvents = events.filter((e) => e.type === 'done');
      expect(doneEvents).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Tool calls (via mock session events)
  // ---------------------------------------------------------------------------

  describe('工具调用', () => {
    it('应该透传 session 的工具调用事件', async () => {
      const { createAgentSession } = await import('@neko/agent');
      vi.mocked(createAgentSession).mockReturnValueOnce(
        createMockSession({
          events: [
            {
              type: 'tool_call',
              toolCall: { id: 'call-1', name: 'test_tool', arguments: {} },
            },
            {
              type: 'tool_result',
              toolResult: { toolCallId: 'call-1', success: true, data: { result: 'ok' } },
            },
            { type: 'text', content: 'Done' },
          ],
        }) as any,
      );

      await runner.configure({ platform: mockPlatform, maxIterations: 3 });

      const events = await collectEvents(runner.execute('call tool', {}));

      const toolCallEvents = events.filter((e) => e.type === 'tool_call');
      const toolResultEvents = events.filter((e) => e.type === 'tool_result');

      expect(toolCallEvents).toHaveLength(1);
      expect(toolCallEvents[0]!.toolCall?.name).toBe('test_tool');
      expect(toolResultEvents).toHaveLength(1);
      expect(toolResultEvents[0]!.toolResult?.success).toBe(true);
    });

    it('应该透传工具执行失败事件', async () => {
      const { createAgentSession } = await import('@neko/agent');
      vi.mocked(createAgentSession).mockReturnValueOnce(
        createMockSession({
          events: [
            {
              type: 'tool_call',
              toolCall: { id: 'call-1', name: 'test_tool', arguments: {} },
            },
            {
              type: 'tool_result',
              toolResult: {
                toolCallId: 'call-1',
                success: false,
                data: null,
                error: 'Tool execution failed',
              },
            },
          ],
        }) as any,
      );

      await runner.configure({ platform: mockPlatform, maxIterations: 3 });

      const events = await collectEvents(runner.execute('call tool', {}));

      const failedResult = events.find((e) => e.type === 'tool_result' && !e.toolResult?.success);
      expect(failedResult).toBeDefined();
      expect(failedResult?.toolResult?.error).toContain('Tool execution failed');
    });
  });

  // ---------------------------------------------------------------------------
  // Cancellation
  // ---------------------------------------------------------------------------

  describe('取消执行', () => {
    it('应该能够取消执行', async () => {
      await runner.configure({ platform: mockPlatform, maxIterations: 10 });

      const iterable = runner.execute('long task', {});
      await toIterator(iterable).next();

      runner.cancel();

      // Consume remaining events
      for await (const _ of iterable) {
        /* drain */
      }

      expect(runner.isRunning()).toBe(false);
      expect(latestMockSession.cancel).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Pending messages
  // ---------------------------------------------------------------------------

  describe('消息队列', () => {
    it('appendMessage 在未运行时返回 false', () => {
      expect(runner.appendMessage('test')).toBe(false);
    });

    it('appendMessage 在运行时返回 true', async () => {
      await runner.configure({ platform: mockPlatform, maxIterations: 10 });

      const iterable = runner.execute('task', {});
      await toIterator(iterable).next(); // start running

      expect(runner.appendMessage('queued')).toBe(true);
      expect(runner.getPendingMessagesCount()).toBe(1);

      runner.cancel();
      for await (const _ of iterable) {
        /* drain */
      }
    });

    it('clearPendingMessages 应该清空队列', async () => {
      await runner.configure({ platform: mockPlatform, maxIterations: 10 });

      const iterable = runner.execute('task', {});
      await toIterator(iterable).next();

      runner.appendMessage('msg1');
      runner.appendMessage('msg2');
      expect(runner.getPendingMessagesCount()).toBe(2);

      runner.clearPendingMessages();
      expect(runner.getPendingMessagesCount()).toBe(0);

      runner.cancel();
      for await (const _ of iterable) {
        /* drain */
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Context management
  // ---------------------------------------------------------------------------

  describe('上下文管理', () => {
    it('未配置时 getContextTokenCount 返回 0', () => {
      expect(runner.getContextTokenCount()).toBe(0);
    });

    it('配置后 getContextTokenCount 委托给 session', async () => {
      await runner.configure({ platform: mockPlatform });
      expect(runner.getContextTokenCount()).toBe(100);
    });

    it('compressContext 委托给 session', async () => {
      await runner.configure({ platform: mockPlatform });
      const result = await runner.compressContext();
      expect(result.originalTokens).toBe(100);
      expect(result.compressedTokens).toBe(50);
    });
  });

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  describe('生命周期', () => {
    it('dispose 应该取消执行并释放 session', async () => {
      await runner.configure({ platform: mockPlatform, maxIterations: 10 });

      const iterable = runner.execute('task', {});
      await toIterator(iterable).next();

      runner.dispose();

      expect(runner.isRunning()).toBe(false);
      expect(latestMockSession.dispose).toHaveBeenCalled();
    });
  });
});
