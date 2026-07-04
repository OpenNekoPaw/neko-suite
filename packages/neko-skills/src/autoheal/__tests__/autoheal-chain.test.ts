import { describe, expect, it, vi } from 'vitest';
import { AUTOHEAL_EVENT_CHANNELS, type AutohealContext, type AutohealFailure } from '@neko/shared';
import { createAutohealChain } from '../autoheal-chain';

function failure(overrides: Partial<AutohealFailure> = {}): AutohealFailure {
  return {
    subject: 'tool.x',
    errorCode: 'TIMEOUT',
    message: 'timed out',
    attempt: 0,
    ...overrides,
  };
}

const ctx: AutohealContext = { round: 2, runId: 'run-1' };

describe('AutohealChain', () => {
  it('defaults to L1 retry then L5 abort after max retries', async () => {
    const chain = createAutohealChain();

    const r0 = await chain.run(failure({ attempt: 0 }), ctx);
    expect(r0.resolution).toBe('healed');
    expect(r0.level).toBe(1);

    const r2 = await chain.run(failure({ attempt: 2 }), ctx);
    expect(r2.resolution).toBe('aborted');
    expect(r2.level).toBe(5);
  });

  it('lets L2 heal by degrading a quality knob', async () => {
    const chain = createAutohealChain({
      handlers: {
        l2Degrade: async () => ({ resolution: 'healed', level: 2, note: 'low-q' }),
      },
    });

    const out = await chain.run(failure({ attempt: 5 }), ctx);
    expect(out.resolution).toBe('healed');
    expect(out.level).toBe(2);
  });

  it('lets L3 substitute when L1 and L2 pass', async () => {
    const chain = createAutohealChain({
      handlers: {
        l3Substitute: async () => ({
          resolution: 'healed',
          level: 3,
          note: 'switched to alt-model',
        }),
      },
    });

    const out = await chain.run(failure({ attempt: 5 }), ctx);
    expect(out.level).toBe(3);
    expect(out.resolution).toBe('healed');
  });

  it('policy flags skip individual levels', async () => {
    const visited: number[] = [];
    const chain = createAutohealChain({
      policy: { skipDegrade: true, skipSubstitute: true, skipSubagent: true },
      handlers: {
        l1Retry: async () => {
          visited.push(1);
          return { resolution: 'pass', level: 1 };
        },
        l2Degrade: async () => {
          visited.push(2);
          return { resolution: 'pass', level: 2 };
        },
        l3Substitute: async () => {
          visited.push(3);
          return { resolution: 'pass', level: 3 };
        },
        l4Subagent: async () => {
          visited.push(4);
          return { resolution: 'pass', level: 4 };
        },
        l5Escalate: async () => {
          visited.push(5);
          return { resolution: 'aborted', level: 5, reason: 'retry-exhausted' };
        },
      },
    });

    const out = await chain.run(failure(), ctx);
    expect(visited).toEqual([1, 5]);
    expect(out.resolution).toBe('aborted');
  });

  it('coerces a handler throw to pass and keeps walking the chain', async () => {
    const warn = vi.fn();
    const chain = createAutohealChain({
      diagnostics: { warn },
      handlers: {
        l1Retry: async () => {
          throw new Error('bad handler');
        },
        l5Escalate: async () => ({ resolution: 'healed', level: 5, note: 'user-ok' }),
      },
    });

    const out = await chain.run(failure(), ctx);
    expect(out.resolution).toBe('healed');
    expect(out.level).toBe(5);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('emits execution.autoheal.* events per visited level when a bus is supplied', async () => {
    const emit = vi.fn();
    const chain = createAutohealChain({
      eventBus: { emit },
      policy: { maxRetries: 0 },
    });

    await chain.run(failure({ attempt: 0 }), ctx);

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: AUTOHEAL_EVENT_CHANNELS.L1_RETRY,
        runId: 'run-1',
      }),
    );
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: AUTOHEAL_EVENT_CHANNELS.L5_ESCALATED,
        runId: 'run-1',
      }),
    );
  });

  it('does not emit when runId is missing from context', async () => {
    const emit = vi.fn();
    const chain = createAutohealChain({ eventBus: { emit }, policy: { maxRetries: 0 } });

    await chain.run(failure(), { round: 0 });

    expect(emit).not.toHaveBeenCalled();
  });
});
