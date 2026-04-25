import { describe, expect, it, vi } from 'vitest';
import type { AgentContext, AgentStep, ToolCallInfo, ToolResultWithMeta } from '@neko/shared';
import { MetricsHooks } from '../metrics-hooks';

function makeContext(): AgentContext {
  return { messages: [] } as unknown as AgentContext;
}

describe('MetricsHooks', () => {
  it('collects tokens, tool summaries, iteration count, and latency', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);

    try {
      const hooks = new MetricsHooks();
      await hooks.onExecuteStart('prompt', makeContext());

      vi.setSystemTime(1_010);
      await hooks.beforeThink(makeContext());
      await hooks.afterThink(
        {
          type: 'think',
          content: 'thinking',
          timestamp: 1_015,
          usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 },
        } satisfies AgentStep,
        makeContext(),
      );

      await hooks.beforeAct([
        { id: 'call-1', name: 'read_file', arguments: {}, index: 0 },
        { id: 'call-2', name: 'write_file', arguments: {}, index: 1 },
      ] satisfies ToolCallInfo[]);

      vi.setSystemTime(1_040);
      await hooks.afterAct([
        { callId: 'call-1', name: 'read_file', success: true },
        { callId: 'call-2', name: 'write_file', success: false, error: 'denied', retryCount: 1 },
      ] satisfies ToolResultWithMeta[]);

      vi.setSystemTime(1_060);
      await hooks.onIterationComplete(1, makeContext());
      vi.setSystemTime(1_090);
      await hooks.onExecuteEnd({
        success: true,
        response: '',
        steps: [],
        iterations: 1,
        timing: { startTime: 0, endTime: 0, duration: 0 },
      });

      const metrics = hooks.getMetrics();
      expect(metrics.totalTokens).toEqual({
        promptTokens: 10,
        completionTokens: 4,
        totalTokens: 14,
      });
      expect(metrics.iterations).toBe(1);
      expect(metrics.totalLatencyMs).toBe(90);
      expect(metrics.turns).toHaveLength(1);
      expect(metrics.turns[0]?.latencyMs).toBe(50);
      expect(metrics.turns[0]?.toolCalls).toEqual([
        { name: 'read_file', success: true, latencyMs: 30, retryCount: 0, error: undefined },
        { name: 'write_file', success: false, latencyMs: 30, retryCount: 1, error: 'denied' },
      ]);
      expect(metrics.toolSummary).toEqual({
        totalCalls: 2,
        successCount: 1,
        failureCount: 1,
        byTool: {
          read_file: { calls: 1, successes: 1, failures: 0 },
          write_file: { calls: 1, successes: 0, failures: 1 },
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('reset clears all accumulated state', async () => {
    const hooks = new MetricsHooks();
    await hooks.onExecuteStart('prompt', makeContext());
    await hooks.afterThink(
      {
        type: 'think',
        content: '',
        timestamp: 0,
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      } satisfies AgentStep,
      makeContext(),
    );
    await hooks.afterAct([{ callId: 'missing-start', name: 'tool', success: true }]);
    await hooks.onIterationComplete(1, makeContext());

    hooks.reset();

    expect(hooks.getMetrics()).toEqual({
      totalTokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      turns: [],
      iterations: 0,
      totalLatencyMs: 0,
      toolSummary: { totalCalls: 0, successCount: 0, failureCount: 0, byTool: {} },
      custom: {},
    });
  });
});
