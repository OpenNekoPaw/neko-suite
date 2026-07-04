import { describe, expect, it } from 'vitest';
import {
  CapturedLogTransport,
  ConsoleLogger,
  LogLevel,
  createTool,
  deriveAgentTraceContext,
  withAgentTrace,
  type ChatMessage,
  type ILogger,
  type IService,
  type LogEntry,
  type ServiceCallContext,
  type ServiceOptions,
  type StreamChunk,
} from '@neko/shared';
import { createValidationCoordinatorFactory } from '@neko/skills';

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of iterable) {
    values.push(value);
  }
  return values;
}

function dataOf(entry: LogEntry | undefined): Record<string, unknown> {
  expect(entry).toBeDefined();
  expect(entry?.data).toEqual(expect.any(Object));
  return entry!.data as Record<string, unknown>;
}

describe('agent execution traceability', () => {
  it('reconstructs one session turn across session, executor, LLM, and tool logs', async () => {
    const transport = new CapturedLogTransport();
    const { setRootLogger, getLogger } = await import('../utils/logger');
    setRootLogger(new ConsoleLogger('Agent', LogLevel.Debug, [transport]));

    const { AgentSession } = await import('../session/agent-session');
    const { ToolRegistry } = await import('../tools/tool-registry');
    const llmLogger = getLogger('MockLLM');
    let streamCall = 0;

    const service: IService = {
      chat: async () => {
        throw new Error('chat() is not used by streaming session execution');
      },
      chatStream: (
        _messages: ChatMessage[],
        _options?: ServiceOptions,
        context?: ServiceCallContext,
      ) => {
        streamCall += 1;
        const requestId = `llm-${streamCall}`;
        const trace = deriveAgentTraceContext(context?.trace, {
          phase: 'llm',
          llmRequestId: requestId,
        });

        llmLogger.debug(
          'neko.agent.llm.request',
          withAgentTrace(trace, {
            requestId,
            stream: true,
          }),
        );

        return createMockStream(streamCall, trace, requestId, llmLogger);
      },
      embed: async () => ({ embeddings: [] }),
    };

    const toolRegistry = new ToolRegistry();
    toolRegistry.register(
      createTool({
        name: 'ReadFile',
        description: 'Read a file',
        category: 'file',
        isConcurrencySafe: true,
        isReadOnly: true,
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
          },
          required: ['path'],
        },
        execute: async () => ({ success: true, data: { content: 'hello' } }),
      }),
    );

    const session = new AgentSession({
      service,
      toolRegistry,
      systemPrompt: 'You are a traced agent.',
      maxIterations: 3,
      conversationId: 'conv-trace-1',
      stageTracking: { guardian: false },
      validationCoordinatorFactory: createValidationCoordinatorFactory(),
    });

    const events = await collect(session.execute('Read package.json'));
    session.dispose();

    expect(events.some((event) => event.type === 'done')).toBe(true);

    const entries = transport.list();
    const findLog = (message: string): LogEntry | undefined =>
      entries.find((entry: LogEntry) => entry.message === message);
    const sessionStart = findLog('neko.agent.session.execute.start');
    const executorStart = findLog('neko.agent.execute.start');
    const llmRequest = findLog('neko.agent.llm.request');
    const toolRequest = findLog('neko.agent.tool.execute.request');
    const iterationEnd = findLog('neko.agent.iteration.end');
    const compactionCheck = findLog('neko.agent.context_compaction.check');
    const feedbackCycle = findLog('neko.agent.validation.cycle.skipped');

    for (const entry of [
      sessionStart,
      executorStart,
      llmRequest,
      toolRequest,
      iterationEnd,
      compactionCheck,
      feedbackCycle,
    ]) {
      expect(dataOf(entry).trace).toEqual(
        expect.objectContaining({
          conversationId: 'conv-trace-1',
        }),
      );
    }

    expect(dataOf(executorStart).trace).toEqual(
      expect.objectContaining({
        phase: 'session',
        turnId: expect.stringContaining('turn-conv-trace-1-'),
      }),
    );
    expect(dataOf(llmRequest).trace).toEqual(
      expect.objectContaining({
        phase: 'llm',
        llmRequestId: 'llm-1',
      }),
    );
    expect(dataOf(toolRequest).trace).toEqual(
      expect.objectContaining({
        phase: 'tool',
        toolRequestId: expect.stringMatching(/^tool-/),
      }),
    );
    expect(dataOf(iterationEnd).trace).toEqual(
      expect.objectContaining({
        iteration: expect.any(Number),
      }),
    );
    expect(dataOf(compactionCheck).trace).toEqual(
      expect.objectContaining({
        phase: 'compaction',
      }),
    );
    expect(dataOf(feedbackCycle).trace).toEqual(
      expect.objectContaining({
        phase: 'validation',
      }),
    );
  }, 15_000);
});

async function* createMockStream(
  streamCall: number,
  trace: NonNullable<ServiceCallContext['trace']>,
  requestId: string,
  logger: ILogger,
): AsyncIterable<StreamChunk> {
  if (streamCall === 1) {
    yield {
      type: 'tool_call',
      toolCall: {
        id: 'call-read',
        type: 'function',
        function: { name: 'ReadFile', arguments: '{"path":"package.json"}' },
      },
    };
    yield {
      type: 'done',
      finishReason: 'tool_calls',
      usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
    };
  } else {
    yield { type: 'content', content: 'Done' };
    yield {
      type: 'done',
      finishReason: 'stop',
      usage: { promptTokens: 12, completionTokens: 3, totalTokens: 15 },
    };
  }

  logger.debug(
    'neko.agent.llm.response',
    withAgentTrace(trace, {
      requestId,
      stream: true,
    }),
  );
}
