/**
 * Autoheal Chain tests
 */

import { describe, it, expect, vi } from 'vitest';
import { createAutohealChain } from '../autoheal-chain';
import type { AutohealFailure, AutohealContext } from '../autoheal-types';
import { createEventBus, EXECUTION_CHANNELS } from '../../events';

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
  it('defaults: L1 retries up to maxRetries=2 then passes through to L5', async () => {
    const chain = createAutohealChain();
    // attempt=0 → heal (retry #1)
    const r0 = await chain.run(failure({ attempt: 0 }), ctx);
    expect(r0.resolution).toBe('healed');
    expect(r0.level).toBe(1);

    // attempt=2 → L1 exhausts, defaults on L2-L4 pass, L5 aborts.
    const r2 = await chain.run(failure({ attempt: 2 }), ctx);
    expect(r2.resolution).toBe('aborted');
    expect(r2.level).toBe(5);
  });

  it('L2 handler can heal (e.g. degrade quality knob)', async () => {
    const chain = createAutohealChain({
      handlers: {
        l2Degrade: async () => ({ resolution: 'healed', level: 2, note: 'low-q' }),
      },
    });
    const out = await chain.run(failure({ attempt: 5 }), ctx); // past L1
    expect(out.resolution).toBe('healed');
    expect(out.level).toBe(2);
  });

  it('L3 handler can substitute when L1/L2 pass', async () => {
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

  it('a handler throw is coerced to pass (chain keeps going)', async () => {
    const chain = createAutohealChain({
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
  });

  it('emits execution.autoheal.* events per visited level when a bus is supplied', async () => {
    const bus = createEventBus();
    const onL1 = vi.fn();
    const onL5 = vi.fn();
    bus.on(EXECUTION_CHANNELS.AUTOHEAL_L1_RETRY, onL1);
    bus.on(EXECUTION_CHANNELS.AUTOHEAL_L5_ESCALATED, onL5);

    const chain = createAutohealChain({
      eventBus: bus,
      // Force L1 to pass so we traverse deeper.
      policy: { maxRetries: 0 },
    });
    await chain.run(failure({ attempt: 0 }), ctx);
    expect(onL1).toHaveBeenCalledTimes(1);
    expect(onL5).toHaveBeenCalledTimes(1);
  });

  it('does not emit when runId is missing from context', async () => {
    const bus = createEventBus();
    const any = vi.fn();
    bus.onAny(any);
    const chain = createAutohealChain({ eventBus: bus, policy: { maxRetries: 0 } });
    await chain.run(failure(), { round: 0 }); // no runId
    expect(any).not.toHaveBeenCalled();
  });
});
