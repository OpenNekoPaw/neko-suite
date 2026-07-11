import { describe, expect, it } from 'vitest';
import type { AgentHostRuntimeAdapter } from '@neko-agent/types';
import type { ActiveTurnTimelineState } from '@/presenters/active-turn-timeline-presenter';
import {
  persistAgentTurnTimelineRecovery,
  readAgentTurnTimelineRecoveryRequests,
  removeAgentTurnTimelineRecovery,
} from '../timeline-recovery-state';

describe('timeline recovery state', () => {
  it('preserves unrelated host state and restores initialization requests', () => {
    const adapter = createStateAdapter({ unrelated: { retained: true } });

    persistAgentTurnTimelineRecovery(adapter, timelineState({ deliveryRevision: 7 }));

    expect(adapter.state()).toMatchObject({ unrelated: { retained: true } });
    expect(readAgentTurnTimelineRecoveryRequests(adapter)).toEqual([
      {
        type: 'requestAgentTurnTimelineSnapshot',
        schemaVersion: 2,
        connectionEpoch: 'epoch-1',
        conversationId: 'conv-1',
        turnId: 'turn-1',
        messageId: 'message-1',
        reason: 'webview-initialization',
        lastAppliedDeliveryRevision: 7,
      },
    ]);
  });

  it('keeps only the latest descriptor per active turn and removes terminal state', () => {
    const adapter = createStateAdapter();

    persistAgentTurnTimelineRecovery(adapter, timelineState({ deliveryRevision: 1 }));
    persistAgentTurnTimelineRecovery(adapter, timelineState({ deliveryRevision: 2 }));

    expect(readAgentTurnTimelineRecoveryRequests(adapter)).toHaveLength(1);
    expect(readAgentTurnTimelineRecoveryRequests(adapter)[0]?.lastAppliedDeliveryRevision).toBe(2);

    persistAgentTurnTimelineRecovery(
      adapter,
      timelineState({ deliveryRevision: 3, completed: true }),
    );
    expect(readAgentTurnTimelineRecoveryRequests(adapter)).toEqual([]);
  });

  it('ignores invalid persisted descriptors and supports explicit removal', () => {
    const adapter = createStateAdapter({
      agentTurnTimelineRecoveries: [{ connectionEpoch: '', deliveryRevision: -1 }],
    });
    const state = timelineState({ deliveryRevision: 1 });

    expect(readAgentTurnTimelineRecoveryRequests(adapter)).toEqual([]);
    persistAgentTurnTimelineRecovery(adapter, state);
    removeAgentTurnTimelineRecovery(adapter, state);
    expect(readAgentTurnTimelineRecoveryRequests(adapter)).toEqual([]);
  });
});

function timelineState(
  overrides: Partial<Pick<ActiveTurnTimelineState, 'deliveryRevision' | 'completed'>> = {},
): ActiveTurnTimelineState {
  return {
    connectionEpoch: 'epoch-1',
    conversationId: 'conv-1',
    turnId: 'turn-1',
    messageId: 'message-1',
    deliveryRevision: overrides.deliveryRevision ?? 1,
    validationState: {
      connectionEpoch: 'epoch-1',
      conversationId: 'conv-1',
      turnId: 'turn-1',
      messageId: 'message-1',
      deliveryRevision: overrides.deliveryRevision ?? 1,
      completed: overrides.completed ?? false,
      items: new Map(),
    },
    items: [],
    completed: overrides.completed ?? false,
    synchronization: 'synchronized',
  };
}

function createStateAdapter(initial: unknown = undefined): Pick<
  AgentHostRuntimeAdapter,
  'getState' | 'setState'
> & {
  state(): unknown;
} {
  let state = initial;
  return {
    getState<T>(): T | undefined {
      return state as T | undefined;
    },
    setState<T>(next: T): void {
      state = next;
    },
    state(): unknown {
      return state;
    },
  };
}
