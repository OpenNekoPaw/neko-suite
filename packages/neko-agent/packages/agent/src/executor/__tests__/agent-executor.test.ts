/**
 * AgentExecutor Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentExecutor, type AgentExecutorOptions } from '../agent-executor';
import { ValidationHooks } from '../../validation';
import type {
  IService,
  IToolRegistry,
  AgentStep,
  AgentTraceContext,
  ServiceResponse,
  ChatMessage,
  StreamChunk,
  ExecutorHooks,
} from '@neko/shared';
import { createAgentTraceContext } from '@neko/shared';

// =============================================================================
// Helpers
// =============================================================================

async function collectSteps(iterable: AsyncIterable<AgentStep>): Promise<AgentStep[]> {
  const steps: AgentStep[] = [];
  for await (const step of iterable) {
    steps.push(step);
  }
  return steps;
}

/** Create an async iterable from StreamChunks matching a ServiceResponse */
async function* responseToStream(resp: ServiceResponse): AsyncIterable<StreamChunk> {
  const content = typeof resp.message.content === 'string' ? resp.message.content : '';
  if (content) {
    yield { type: 'content', content };
  }
  if (resp.message.toolCalls) {
    for (const tc of resp.message.toolCalls) {
      yield {
        type: 'tool_call',
        toolCall: {
          id: tc.id,
          type: tc.type,
          function: tc.function,
        },
      };
    }
  }
  yield {
    type: 'done',
    finishReason: resp.finishReason,
    usage: resp.usage,
  };
}

// =============================================================================
// Mocks
// =============================================================================

function createMockService(): IService {
  return {
    chat: vi.fn(),
    chatStream: vi.fn(),
    embed: vi.fn(),
  };
}

function createMockToolRegistry(): IToolRegistry {
  return {
    register: vi.fn(),
    unregister: vi.fn(),
    get: vi.fn(),
    has: vi.fn(),
    list: vi.fn().mockReturnValue([]),
    listByCategory: vi.fn().mockReturnValue([]),
    execute: vi.fn().mockResolvedValue({ success: true, data: 'ok' }),
    toToolDefinitions: vi.fn().mockReturnValue([]),
  };
}

/** Build a ServiceResponse for a plain text reply (no tool calls) */
function textResponse(content: string): ServiceResponse {
  return {
    id: 'resp_1',
    model: 'test-model',
    message: { role: 'assistant', content } as ChatMessage,
    finishReason: 'stop',
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
  };
}

/** Build a ServiceResponse that includes tool calls */
function toolCallResponse(
  toolName: string,
  args: Record<string, unknown>,
  callId = 'call_1',
): ServiceResponse {
  return {
    id: 'resp_tc',
    model: 'test-model',
    message: {
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: callId,
          type: 'function' as const,
          function: { name: toolName, arguments: JSON.stringify(args) },
        },
      ],
    } as ChatMessage,
    finishReason: 'tool_calls',
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
  };
}

function createOptions(overrides?: Partial<AgentExecutorOptions>): AgentExecutorOptions {
  return {
    service: createMockService(),
    toolRegistry: createMockToolRegistry(),
    config: {
      name: 'test-agent',
      systemPrompt: 'You are a test agent.',
      tools: [],
      maxIterations: 5,
    },
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('AgentExecutor', () => {
  let service: IService;
  let toolRegistry: IToolRegistry;
  let options: AgentExecutorOptions;

  beforeEach(() => {
    service = createMockService();
    toolRegistry = createMockToolRegistry();
    options = createOptions({ service, toolRegistry });
  });

  // -------------------------------------------------------------------------
  // 1. execute() — no tool calls
  // -------------------------------------------------------------------------

  describe('execute() no tool calls', () => {
    it('should return result directly with response content', async () => {
      (service.chat as ReturnType<typeof vi.fn>).mockResolvedValue(textResponse('Hello!'));

      const executor = new AgentExecutor(options);
      const result = await executor.execute('Hi');

      expect(result.success).toBe(true);
      expect(result.response).toBe('Hello!');
      expect(result.iterations).toBe(1);
    });
  });

  it('keeps turn trace stable while passing explicit phase traces to LLM, tool, and hooks', async () => {
    const baseTrace = createAgentTraceContext({
      conversationId: 'conv-executor-trace',
      turnId: 'turn-executor-trace',
    });
    const serviceTraces: Array<AgentTraceContext | undefined> = [];
    const toolTraces: Array<AgentTraceContext | undefined> = [];
    const hookContextTraces: Array<AgentTraceContext | undefined> = [];

    let chatCall = 0;
    (service.chat as ReturnType<typeof vi.fn>).mockImplementation(
      async (
        _messages: ChatMessage[],
        _options: Record<string, unknown>,
        context?: { trace?: AgentTraceContext },
      ) => {
        serviceTraces.push(context?.trace);
        chatCall += 1;
        return chatCall === 1
          ? toolCallResponse('TestTool', { path: 'file.txt' }, 'call-trace')
          : textResponse('done');
      },
    );
    (toolRegistry.execute as ReturnType<typeof vi.fn>).mockImplementation(
      async (
        _name: string,
        _args: Record<string, unknown>,
        options?: { trace?: AgentTraceContext },
      ) => {
        toolTraces.push(options?.trace);
        return { success: true, data: 'ok' };
      },
    );

    const hooks: ExecutorHooks[] = [
      {
        name: 'trace-probe',
        onIterationComplete: async (_iteration, context) => {
          hookContextTraces.push(context.trace);
        },
      },
    ];
    const executor = new AgentExecutor(createOptions({ service, toolRegistry, hooks }));

    await executor.execute('Use a tool', { trace: baseTrace });

    expect(serviceTraces[0]).toEqual(
      expect.objectContaining({
        conversationId: 'conv-executor-trace',
        turnId: 'turn-executor-trace',
        iteration: 1,
        phase: 'think',
      }),
    );
    expect(toolTraces[0]).toEqual(
      expect.objectContaining({
        conversationId: 'conv-executor-trace',
        turnId: 'turn-executor-trace',
        iteration: 1,
        phase: 'tool',
        parentRequestId: 'call-trace',
      }),
    );
    expect(hookContextTraces[0]).toEqual(baseTrace);
  });

  // -------------------------------------------------------------------------
  // 2. execute() — with tool calls (ReAct loop)
  // -------------------------------------------------------------------------

  describe('execute() with tool calls', () => {
    it('should run think-act-observe loop then return final response', async () => {
      const chatMock = service.chat as ReturnType<typeof vi.fn>;
      // First call: tool call
      chatMock.mockResolvedValueOnce(toolCallResponse('read_file', { path: '/a.ts' }));
      // Second call: final text
      chatMock.mockResolvedValueOnce(textResponse('Done reading file.'));

      (toolRegistry.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: 'file content',
      });

      const executor = new AgentExecutor(options);
      const result = await executor.execute('Read a.ts');

      expect(result.success).toBe(true);
      expect(result.response).toBe('Done reading file.');
      expect(result.iterations).toBe(2);
      expect(toolRegistry.execute).toHaveBeenCalledWith(
        'read_file',
        { path: '/a.ts' },
        expect.anything(),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 3. execute() — maxIterations limit
  // -------------------------------------------------------------------------

  describe('execute() maxIterations', () => {
    it('should stop and return error when max iterations reached', async () => {
      // Always return tool calls so the loop never ends naturally
      (service.chat as ReturnType<typeof vi.fn>).mockResolvedValue(
        toolCallResponse('some_tool', { x: 1 }),
      );
      (toolRegistry.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: 'ok',
      });

      const executor = new AgentExecutor(
        createOptions({
          service,
          toolRegistry,
          config: {
            name: 'test',
            systemPrompt: 'test',
            tools: [],
            maxIterations: 2,
          },
        }),
      );

      const result = await executor.execute('loop forever');

      expect(result.success).toBe(false);
      expect(result.iterations).toBe(2);
      expect(result.error).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 4. executeStream() — yields think/act/observe steps
  // -------------------------------------------------------------------------

  describe('executeStream() with tool calls', () => {
    it('should yield think, act, observe steps then final think', async () => {
      const chatMock = service.chat as ReturnType<typeof vi.fn>;
      const chatStreamMock = service.chatStream as ReturnType<typeof vi.fn>;
      const tcResp = toolCallResponse('grep', { pattern: 'foo' });
      const finalResp = textResponse('Found matches.');

      chatMock.mockResolvedValueOnce(tcResp);
      chatMock.mockResolvedValueOnce(finalResp);
      chatStreamMock.mockReturnValueOnce(responseToStream(tcResp));
      chatStreamMock.mockReturnValueOnce(responseToStream(finalResp));

      (toolRegistry.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: 'match line 1',
      });

      const executor = new AgentExecutor(options);
      const steps = await collectSteps(executor.executeStream('Search foo'));

      const types = steps.map((s) => s.type);
      // First iteration: think (with tool calls) -> act -> observe
      // Second iteration: content_delta (streaming) -> think (final response)
      expect(types).toEqual(['think', 'act', 'observe', 'content_delta', 'think']);
    });

    it('runs CreativeTable validation after ActivateSkill before accepting final storyboard output', async () => {
      const chatStreamMock = service.chatStream as ReturnType<typeof vi.fn>;
      const activationResp = toolCallResponse(
        'ActivateSkill',
        {
          skillName: 'comic-to-storyboard',
          reason: 'The user requested a storyboard table after the task was understood.',
        },
        'activate-skill-call',
      );
      const invalidStoryboardResp = textResponse(
        [
          '| 镜号 | 来源页 | 画面内容 |',
          '| --- | --- | --- |',
          '| S01 | P1 | 主角站在巨构前 |',
        ].join('\n'),
      );

      chatStreamMock.mockReturnValueOnce(responseToStream(activationResp));
      chatStreamMock.mockReturnValueOnce(responseToStream(invalidStoryboardResp));
      (toolRegistry.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: {
          activated: true,
          skillName: 'comic-to-storyboard',
          reason: 'The user requested a storyboard table after the task was understood.',
        },
      });

      let activated = false;
      const executor = new AgentExecutor(
        createOptions({
          service,
          toolRegistry,
          getActiveArtifactValidationRequirements: () =>
            activated ? ['CreativeTable'] : undefined,
          hooks: [
            new ValidationHooks({
              outputConstraints: {
                mermaidPreValidate: false,
                onValidationFail: 'error',
              },
            }),
            {
              name: 'activate-skill-probe',
              afterAct: async () => {
                activated = true;
              },
            },
          ],
        }),
      );

      await expect(collectSteps(executor.executeStream('生成分镜表'))).rejects.toMatchObject({
        code: 'storyboard-table-required-fields-missing',
      });
    });

    it('retries streamed storyboard tables after Agent-owned CreativeTable validation failure', async () => {
      const activationResp = toolCallResponse(
        'ActivateSkill',
        {
          skillName: 'comic-to-storyboard',
          reason: 'The user requested a storyboard table after the task was understood.',
        },
        'activate-skill-call',
      );
      const invalidStoryboardResp = textResponse(
        [
          '| 镜号 | 来源页 | 画面内容 |',
          '| --- | --- | --- |',
          '| S01 | P1 | 主角站在巨构前 |',
        ].join('\n'),
      );
      const fixedStoryboardResp = textResponse(
        [
          '| scene | shot | source | imagePrompt | videoPrompt | duration | dialogue |',
          '| --- | --- | --- | --- | --- | --- | --- |',
          '| 正文 | 1 | P1 | 图像编辑：以 P1 为输入，裁切巨构前主角分格，清理文字并保持黑白漫画线稿一致 | 场景视频生成：以 P1 为构图和人物参考，主角站在压迫性的巨构前，镜头 3 秒缓慢推近，保持原分格空间比例，无对白 | 3s |  |',
        ].join('\n'),
      );
      const chatStreamMock = service.chatStream as ReturnType<typeof vi.fn>;
      chatStreamMock.mockReturnValueOnce(responseToStream(activationResp));
      chatStreamMock.mockReturnValueOnce(responseToStream(invalidStoryboardResp));
      chatStreamMock.mockReturnValueOnce(responseToStream(fixedStoryboardResp));
      (toolRegistry.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: {
          activated: true,
          skillName: 'comic-to-storyboard',
          reason: 'The user requested a storyboard table after the task was understood.',
        },
      });

      let activated = false;
      const executor = new AgentExecutor(
        createOptions({
          service,
          toolRegistry,
          getActiveArtifactValidationRequirements: () =>
            activated ? ['CreativeTable'] : undefined,
          hooks: [
            new ValidationHooks({
              outputConstraints: {
                mermaidPreValidate: false,
                onValidationFail: 'retry',
              },
            }),
            {
              name: 'activate-skill-probe',
              afterAct: async () => {
                activated = true;
              },
            },
          ],
        }),
      );

      const steps = await collectSteps(
        executor.executeStream('生成分镜表', { metadata: { locale: 'zh' } }),
      );
      const deltas = steps.filter((step) => step.type === 'content_delta');

      expect(deltas).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ content: invalidStoryboardResp.message.content }),
          expect.objectContaining({
            content: '',
            deltaKind: 'assistant_text_replacement',
            replacement: { reason: 'output-validation-retry', attempt: 1 },
          }),
          expect.objectContaining({ content: fixedStoryboardResp.message.content }),
        ]),
      );
      expect(steps.filter((step) => step.type === 'think').map((step) => step.content)).toEqual([
        '',
        fixedStoryboardResp.message.content,
      ]);
      expect(steps.at(-1)).toMatchObject({
        type: 'think',
        content: fixedStoryboardResp.message.content,
      });
      expect(chatStreamMock).toHaveBeenCalledTimes(3);
      const repairMessages = chatStreamMock.mock.calls[2]?.[0] as ChatMessage[] | undefined;
      expect(repairMessages?.at(-1)).toMatchObject({
        role: 'user',
        content: expect.stringContaining('请重写为唯一一张 storyboard creative table'),
      });
    });
  });

  // -------------------------------------------------------------------------
  // 5. executeStream() — no tools, yields think then done
  // -------------------------------------------------------------------------

  describe('executeStream() no tools', () => {
    it('should yield single think step and return', async () => {
      const resp = textResponse('Just text.');
      (service.chat as ReturnType<typeof vi.fn>).mockResolvedValue(resp);
      (service.chatStream as ReturnType<typeof vi.fn>).mockReturnValue(responseToStream(resp));

      const executor = new AgentExecutor(options);
      const steps = await collectSteps(executor.executeStream('Hello'));

      // Stream yields content_delta first, then think
      expect(steps.length).toBe(2);
      expect(steps[0]!.type).toBe('content_delta');
      expect(steps[0]!.content).toBe('Just text.');
      expect(steps[1]!.type).toBe('think');
    });
  });

  // -------------------------------------------------------------------------
  // 6. abort() — stops execution
  // -------------------------------------------------------------------------

  describe('abort()', () => {
    it('should stop executeStream with abort message', async () => {
      // Make chatStream hang until aborted by returning an async iterable that never resolves
      let rejectStream: ((err: Error) => void) | undefined;

      (service.chatStream as ReturnType<typeof vi.fn>).mockReturnValue({
        [Symbol.asyncIterator]() {
          return {
            next() {
              return new Promise((_resolve, reject) => {
                rejectStream = reject;
              });
            },
          };
        },
      });

      const executor = new AgentExecutor(options);
      const stepsPromise = collectSteps(executor.executeStream('Hang'));

      // Give the generator time to start
      await new Promise((r) => setTimeout(r, 10));

      executor.abort();
      // Reject the pending stream with AbortError
      if (rejectStream) {
        const err = new Error('aborted');
        err.name = 'AbortError';
        rejectStream(err);
      }

      const steps = await stepsPromise;
      const lastStep = steps[steps.length - 1];
      expect(lastStep?.type).toBe('respond');
      expect(lastStep?.content).toContain('aborted');
    });
  });

  // -------------------------------------------------------------------------
  // 7. skipUserMessage flag
  // -------------------------------------------------------------------------

  describe('skipUserMessage', () => {
    it('should not add user message when skipUserMessage is true', async () => {
      const chatMock = service.chat as ReturnType<typeof vi.fn>;
      chatMock.mockImplementation((messages: ChatMessage[]) => {
        // Verify no duplicate user message was added
        const userMsgs = messages.filter((m) => m.role === 'user');
        // Should have exactly 1 (the one already in the snapshot)
        expect(userMsgs.length).toBe(1);
        return Promise.resolve(textResponse('ok'));
      });

      const executor = new AgentExecutor(options);
      const messagesSnapshot: ChatMessage[] = [
        { role: 'system', content: 'You are a test agent.' },
        { role: 'user', content: 'Hello' },
      ];

      await executor.execute('Hello', {
        messages: messagesSnapshot,
        skipUserMessage: true,
      });

      expect(chatMock).toHaveBeenCalled();
    });

    it('should add user message when skipUserMessage is false/absent', async () => {
      const chatMock = service.chat as ReturnType<typeof vi.fn>;
      chatMock.mockImplementation((messages: ChatMessage[]) => {
        const userMsgs = messages.filter((m) => m.role === 'user');
        expect(userMsgs.length).toBe(1);
        expect(userMsgs[0]!.content).toBe('Hello');
        return Promise.resolve(textResponse('ok'));
      });

      const executor = new AgentExecutor(options);
      await executor.execute('Hello');

      expect(chatMock).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 8. Hooks lifecycle
  // -------------------------------------------------------------------------

  describe('hooks lifecycle', () => {
    it('should call beforeThink and afterThink hooks', async () => {
      (service.chat as ReturnType<typeof vi.fn>).mockResolvedValue(textResponse('Hi'));

      const hooks: ExecutorHooks = {
        name: 'test-hooks',
        beforeThink: vi.fn().mockResolvedValue(undefined),
        afterThink: vi.fn().mockResolvedValue(undefined),
        onExecuteStart: vi.fn().mockResolvedValue(undefined),
        onExecuteEnd: vi.fn().mockResolvedValue(undefined),
      };

      const executor = new AgentExecutor(
        createOptions({
          service,
          toolRegistry,
          hooks: [hooks],
        }),
      );

      await executor.execute('Test hooks');

      expect(hooks.beforeThink).toHaveBeenCalled();
      expect(hooks.afterThink).toHaveBeenCalled();
      expect(hooks.onExecuteStart).toHaveBeenCalled();
      expect(hooks.onExecuteEnd).toHaveBeenCalled();
    });

    it('should call onIterationComplete after tool execution', async () => {
      const chatMock = service.chat as ReturnType<typeof vi.fn>;
      chatMock.mockResolvedValueOnce(toolCallResponse('tool_a', {}));
      chatMock.mockResolvedValueOnce(textResponse('Done'));

      (toolRegistry.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: 'result',
      });

      const hooks: ExecutorHooks = {
        name: 'iteration-hooks',
        onIterationComplete: vi.fn().mockResolvedValue(undefined),
      };

      const executor = new AgentExecutor(
        createOptions({
          service,
          toolRegistry,
          hooks: [hooks],
        }),
      );

      await executor.execute('Run tool');

      expect(hooks.onIterationComplete).toHaveBeenCalledWith(1, expect.anything());
    });
  });
});
