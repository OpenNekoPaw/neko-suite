/**
 * EventBus tests
 *
 * Covers:
 * - Typed subscription per channel
 * - onAny fires for every channel
 * - Listener isolation (one throws, others still fire)
 * - Unsubscribe removes the listener
 * - clear wipes all subscriptions
 * - listenerCount reflects current subscribers
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createEventBus,
  CREATION_CHANNELS,
  EXECUTION_CHANNELS,
  type DualFlowEvent,
} from '../event-bus';

function creationStarted(runId = 'r1', at = 1): DualFlowEvent {
  return {
    channel: CREATION_CHANNELS.RUN_STARTED,
    runId,
    workflowId: 'wf',
    at,
  };
}

function roundDecided(runId = 'r1', round = 0, at = 1): DualFlowEvent {
  return {
    channel: EXECUTION_CHANNELS.ROUND_ACTIVATION_DECIDED,
    runId,
    taskShape: 'multi-step',
    summary: {
      round,
      activatedStages: ['apply'],
      skippedStages: [],
      decidedAt: at,
    },
    at,
  };
}

describe('EventBus', () => {
  it('fires listeners on the matching channel only', () => {
    const bus = createEventBus();
    const onCreation = vi.fn();
    const onExecution = vi.fn();
    bus.on(CREATION_CHANNELS.RUN_STARTED, onCreation);
    bus.on(EXECUTION_CHANNELS.ROUND_ACTIVATION_DECIDED, onExecution);

    bus.emit(creationStarted());
    bus.emit(roundDecided());

    expect(onCreation).toHaveBeenCalledTimes(1);
    expect(onExecution).toHaveBeenCalledTimes(1);
  });

  it('typed payload is narrowed via channel generic', () => {
    const bus = createEventBus();
    bus.on(CREATION_CHANNELS.RUN_STARTED, (event) => {
      // Type narrowing: `event.workflowId` only exists on CreationRunStartedEvent.
      expect(event.workflowId).toBe('wf');
    });
    bus.emit(creationStarted());
  });

  it('onAny fires for every event regardless of channel', () => {
    const bus = createEventBus();
    const any = vi.fn();
    bus.onAny(any);
    bus.emit(creationStarted());
    bus.emit(roundDecided());
    expect(any).toHaveBeenCalledTimes(2);
  });

  it('listener exceptions do not block siblings or subsequent emits', () => {
    const bus = createEventBus();
    const good = vi.fn();
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    bus.on(CREATION_CHANNELS.RUN_STARTED, bad);
    bus.on(CREATION_CHANNELS.RUN_STARTED, good);

    expect(() => bus.emit(creationStarted())).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    // Emit again — the bad listener is still registered but can't stop us.
    expect(() => bus.emit(creationStarted())).not.toThrow();
    expect(good).toHaveBeenCalledTimes(2);
  });

  it('unsubscribe removes only that listener', () => {
    const bus = createEventBus();
    const a = vi.fn();
    const b = vi.fn();
    const offA = bus.on(CREATION_CHANNELS.RUN_STARTED, a);
    bus.on(CREATION_CHANNELS.RUN_STARTED, b);

    offA();
    bus.emit(creationStarted());
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('clear removes every subscriber', () => {
    const bus = createEventBus();
    const a = vi.fn();
    const any = vi.fn();
    bus.on(CREATION_CHANNELS.RUN_STARTED, a);
    bus.onAny(any);

    bus.clear();
    bus.emit(creationStarted());
    expect(a).not.toHaveBeenCalled();
    expect(any).not.toHaveBeenCalled();
  });

  it('listenerCount reports per-channel subscribers', () => {
    const bus = createEventBus();
    expect(bus.listenerCount(CREATION_CHANNELS.RUN_STARTED)).toBe(0);

    const off1 = bus.on(CREATION_CHANNELS.RUN_STARTED, () => {});
    bus.on(CREATION_CHANNELS.RUN_STARTED, () => {});
    expect(bus.listenerCount(CREATION_CHANNELS.RUN_STARTED)).toBe(2);

    off1();
    expect(bus.listenerCount(CREATION_CHANNELS.RUN_STARTED)).toBe(1);
  });
});
