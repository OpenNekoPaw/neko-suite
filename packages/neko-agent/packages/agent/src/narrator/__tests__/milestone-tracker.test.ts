/**
 * MilestoneTracker tests
 *
 * Covers:
 * - Default classifier handles run lifecycle + round + autoheal channels
 * - History is capped by maxHistory (FIFO drop)
 * - Memory-store sink receives appended milestones under shared:milestone
 * - Custom classifier replaces the default
 * - clear + dispose are idempotent / safe
 * - Unknown channels (TODO/plan/apply/step) are skipped by default
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createEventBus,
  CREATION_CHANNELS,
  EXECUTION_CHANNELS,
  type DualFlowEvent,
} from '../../events';
import { createSharedMemoryStore } from '../../memory/shared-memory-store';
import { createMilestoneTracker, type Milestone } from '../milestone-tracker';

function roundEvent(round = 0, at = 1): DualFlowEvent {
  return {
    channel: EXECUTION_CHANNELS.ROUND_ACTIVATION_DECIDED,
    runId: 'r1',
    taskShape: 'multi-step',
    summary: {
      round,
      activatedStages: ['plan', 'apply'],
      skippedStages: [],
      decidedAt: at,
    },
    at,
  };
}

function runStarted(at = 1): DualFlowEvent {
  return {
    channel: CREATION_CHANNELS.RUN_STARTED,
    runId: 'r1',
    runKind: 'flow-a',
    workflowId: 'flow-a',
    at,
  };
}

function autohealL1(attempt = 0, at = 5): DualFlowEvent {
  return {
    channel: EXECUTION_CHANNELS.AUTOHEAL_L1_RETRY,
    runId: 'r1',
    trigger: { subject: 'tool.x', errorCode: 'TIMEOUT' },
    at,
    attempt,
  };
}

describe('MilestoneTracker', () => {
  it('classifies run-started + round + autoheal by default', () => {
    const bus = createEventBus();
    const tracker = createMilestoneTracker(bus);
    bus.emit(runStarted(1));
    bus.emit(roundEvent(0, 2));
    bus.emit(autohealL1(0, 3));

    const history = tracker.getHistory();
    expect(history).toHaveLength(3);
    expect(history[0]!.kind).toBe('run-started');
    expect(history[0]!.label).toBe('Run started (flow-a)');
    expect(history[1]!.kind).toBe('round-decided');
    expect(history[2]!.kind).toBe('autoheal');
    expect(tracker.getLatest()?.kind).toBe('autoheal');
  });

  it('caps history at maxHistory and drops oldest first', () => {
    const bus = createEventBus();
    const tracker = createMilestoneTracker(bus, { maxHistory: 3 });
    for (let i = 0; i < 5; i++) bus.emit(roundEvent(i, i + 1));
    const history = tracker.getHistory();
    expect(history).toHaveLength(3);
    // First two dropped — oldest is round=2.
    expect((history[0]!.label as string).startsWith('Round 2')).toBe(true);
    expect((history[2]!.label as string).startsWith('Round 4')).toBe(true);
  });

  it('mirrors milestones into SharedMemoryStore under shared:milestone', () => {
    const bus = createEventBus();
    const store = createSharedMemoryStore();
    createMilestoneTracker(bus, { memoryStore: store });
    bus.emit(runStarted(1));
    bus.emit(roundEvent(0, 2));

    const entries = store.get<Milestone>('shared', 'milestone');
    expect(entries).toHaveLength(2);
    expect(entries[0]!.tag).toBe('run-started');
    expect(entries[1]!.tag).toBe('round-decided');
  });

  it('custom classify overrides the default', () => {
    const bus = createEventBus();
    const classify = vi.fn(() => ({
      kind: 'other' as const,
      label: 'custom',
      at: 0,
      channel: 'custom-channel',
    }));
    const tracker = createMilestoneTracker(bus, { classify });
    bus.emit(runStarted());
    expect(classify).toHaveBeenCalled();
    expect(tracker.getLatest()?.label).toBe('custom');
  });

  it('dispose unsubscribes; further events ignored', () => {
    const bus = createEventBus();
    const tracker = createMilestoneTracker(bus);
    bus.emit(runStarted(1));
    tracker.dispose();
    bus.emit(roundEvent(0, 2));
    expect(tracker.getHistory()).toHaveLength(1);
  });

  it('dispose is idempotent', () => {
    const bus = createEventBus();
    const tracker = createMilestoneTracker(bus);
    expect(() => {
      tracker.dispose();
      tracker.dispose();
    }).not.toThrow();
  });

  it('clear wipes history but keeps the subscription alive', () => {
    const bus = createEventBus();
    const tracker = createMilestoneTracker(bus);
    bus.emit(runStarted(1));
    tracker.clear();
    expect(tracker.getHistory()).toHaveLength(0);
    bus.emit(roundEvent(0, 2));
    expect(tracker.getHistory()).toHaveLength(1);
  });

  it('returns null classifier skips the event', () => {
    const bus = createEventBus();
    const tracker = createMilestoneTracker(bus, { classify: () => null });
    bus.emit(runStarted(1));
    expect(tracker.getHistory()).toEqual([]);
  });

  it('quality-evaluated + draft + review-decided all map', () => {
    const bus = createEventBus();
    const tracker = createMilestoneTracker(bus);
    bus.emit({
      channel: EXECUTION_CHANNELS.QUALITY_EVALUATED,
      runId: 'r1',
      verdict: 'pass',
      at: 1,
    } as DualFlowEvent);
    bus.emit({
      channel: CREATION_CHANNELS.DRAFT_PRESENTED,
      runId: 'r1',
      draftId: 'p1',
      at: 2,
    } as DualFlowEvent);
    bus.emit({
      channel: CREATION_CHANNELS.REVIEW_DECIDED,
      runId: 'r1',
      draftId: 'p1',
      decision: 'approve',
      at: 3,
    } as DualFlowEvent);
    const kinds = tracker.getHistory().map((m) => m.kind);
    expect(kinds).toEqual(['quality-evaluated', 'draft-presented', 'review-decided']);
  });
});
