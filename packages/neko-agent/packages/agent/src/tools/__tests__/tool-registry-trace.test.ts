import { describe, expect, it, vi } from 'vitest';
import {
  CapturedLogTransport,
  ConsoleLogger,
  LogLevel,
  createAgentTraceContext,
  createTool,
  type ToolExecuteOptions,
} from '@neko/shared';

describe('ToolRegistry trace isolation', () => {
  it('logs trace without adding trace to model-authored tool arguments', async () => {
    const transport = new CapturedLogTransport();
    const { setRootLogger } = await import('../../utils/logger');
    setRootLogger(new ConsoleLogger('Agent', LogLevel.Debug, [transport]));
    const { ToolRegistry } = await import('../tool-registry');
    const execute = vi.fn(async () => ({ success: true, data: 'ok' }));
    const registry = new ToolRegistry();
    registry.register(
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
        execute,
      }),
    );

    const args = { path: 'package.json' };
    await registry.execute('ReadFile', args, {
      trace: createAgentTraceContext({
        conversationId: 'conv-1',
        runId: 'run-1',
        turnId: 'turn-1',
        phase: 'tool',
      }),
    });

    expect(execute).toHaveBeenCalledTimes(1);
    const [receivedArgs, receivedOptions] = execute.mock.calls[0] as [
      Record<string, unknown>,
      ToolExecuteOptions,
    ];
    expect(receivedArgs).toEqual(args);
    expect(receivedArgs).not.toHaveProperty('trace');
    expect(receivedOptions.trace).toEqual(
      expect.objectContaining({
        conversationId: 'conv-1',
        phase: 'tool',
      }),
    );

    const requestLog = transport
      .list()
      .find((entry) => entry.message === 'neko.agent.tool.execute.request');
    expect(requestLog?.data).toEqual(
      expect.objectContaining({
        requestId: expect.stringMatching(/^tool-/),
        trace: expect.objectContaining({
          conversationId: 'conv-1',
          toolRequestId: expect.stringMatching(/^tool-/),
        }),
      }),
    );
  });
});
