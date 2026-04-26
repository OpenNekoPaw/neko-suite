/**
 * MilestoneTracker — stateful aggregator over dual-flow events.
 *
 * See: docs/architecture/agent-unified-workflow.md §11.6
 *      plan v2 P5 (ProgressNarrator + MilestoneTracker)
 *
 * Responsibility: subscribe to a EventBus and distill the stream into
 * a bounded history of "milestones" — the salient steps a user or
 * status dashboard would care about (run started, round decided,
 * autoheal escalation, run ended).
 *
 * Design rules:
 *   - **Bounded history** — configurable cap (default 64). Older
 *     entries drop FIFO so long-running sessions don't balloon.
 *   - **Optional memory sink** — if a SharedMemoryStore is injected,
 *     each milestone is also appended under `shared:milestone` so
 *     cross-ring readers (Iteration Skill, ProgressNarrator) can pull
 *     from the shared scratchpad.
 *   - **Pluggable classifier** — callers can override `classify()` to
 *     map specific event channels to milestone kinds / labels without
 *     patching the tracker.
 *   - **Idempotent unsubscribe** — `dispose()` is safe to call twice.
 *
 * Intentional non-goals:
 *   - No de-duplication of identical consecutive milestones (too
 *     policy-dependent for a shared primitive — callers can apply).
 *   - No time-windowed rate limiting.
 *   - No persistence beyond the optional memory-store sink.
 */

import type { DualFlowEvent, IEventBus } from '../events/event-bus';
import { CREATION_CHANNELS, EXECUTION_CHANNELS } from '../events/event-bus';
import type { ISharedMemoryStore } from '../memory/shared-memory-store';

// =============================================================================
// Types
// =============================================================================

/**
 * Narrow classification of a milestone. `kind` is the class (run
 * lifecycle / round / autoheal / quality), `label` is a short human
 * string, `at` is ms epoch. Callers render as they see fit.
 */
export type MilestoneKind =
  | 'run-started'
  | 'run-ended'
  | 'round-decided'
  | 'autoheal'
  | 'quality-evaluated'
  | 'draft-presented'
  | 'review-decided'
  | 'status-updated'
  | 'artifact-written'
  | 'artifact-invalid'
  | 'other';

export interface Milestone {
  kind: MilestoneKind;
  label: string;
  at: number;
  /** Optional runId for correlation when available on the event. */
  runId?: string;
  /** Original channel — useful for debug panels that want raw trace. */
  channel: string;
}

export interface MilestoneTrackerConfig {
  /** Max milestones retained in history. Default 64. */
  maxHistory?: number;
  /** Optional shared memory store to mirror milestones into. */
  memoryStore?: ISharedMemoryStore;
  /**
   * Optional classifier override. Return `null` to skip an event.
   * Default classifier covers the common channels; callers with
   * custom bus channels inject their own.
   */
  classify?: (event: DualFlowEvent) => Milestone | null;
}

export interface IMilestoneTracker {
  /** Bounded milestone history, oldest first. */
  getHistory(): readonly Milestone[];
  /** Most recent milestone, or null if none. */
  getLatest(): Milestone | null;
  /** Remove all history. */
  clear(): void;
  /** Idempotent teardown — unsubscribes from the bus. */
  dispose(): void;
}

// =============================================================================
// Default classifier
// =============================================================================

/**
 * Map the channel enum into a MilestoneKind and short label. Used
 * when no custom classifier is supplied.
 */
export function defaultClassify(event: DualFlowEvent): Milestone | null {
  const base = { at: event.at, channel: event.channel };
  switch (event.channel) {
    case CREATION_CHANNELS.RUN_STARTED:
      return {
        ...base,
        kind: 'run-started',
        label: `Run started (${event.runKind})`,
        runId: event.runId,
      };
    case CREATION_CHANNELS.RUN_ENDED:
      return {
        ...base,
        kind: 'run-ended',
        label: `Run ${event.status}`,
        runId: event.runId,
      };
    case CREATION_CHANNELS.MILESTONE:
      return { ...base, kind: 'other', label: event.label, runId: event.runId };
    case CREATION_CHANNELS.DRAFT_PRESENTED:
      return {
        ...base,
        kind: 'draft-presented',
        label: `Draft ${event.draftId}`,
        runId: event.runId,
      };
    case CREATION_CHANNELS.REVIEW_DECIDED:
      return {
        ...base,
        kind: 'review-decided',
        label: `Review ${event.decision}`,
        runId: event.runId,
      };
    case CREATION_CHANNELS.STATUS_UPDATED:
      return {
        ...base,
        kind: 'status-updated',
        label: event.narrative.slice(0, 80),
        runId: event.runId,
      };
    case EXECUTION_CHANNELS.ROUND_ACTIVATION_DECIDED: {
      const activated = event.summary.activatedStages.join('→');
      return {
        ...base,
        kind: 'round-decided',
        label: `Round ${event.summary.round}: ${activated}`,
        runId: event.runId,
      };
    }
    case EXECUTION_CHANNELS.QUALITY_EVALUATED:
      return {
        ...base,
        kind: 'quality-evaluated',
        label: `Quality: ${event.verdict}`,
        runId: event.runId,
      };
    case EXECUTION_CHANNELS.AUTOHEAL_L1_RETRY:
      return {
        ...base,
        kind: 'autoheal',
        label: `Retry #${event.attempt} (${event.trigger.subject})`,
        runId: event.runId,
      };
    case EXECUTION_CHANNELS.AUTOHEAL_L2_DEGRADE:
      return {
        ...base,
        kind: 'autoheal',
        label: `Degrade: ${event.note}`,
        runId: event.runId,
      };
    case EXECUTION_CHANNELS.AUTOHEAL_L3_SUBSTITUTE:
      return {
        ...base,
        kind: 'autoheal',
        label: `Substitute: ${event.fallback}`,
        runId: event.runId,
      };
    case EXECUTION_CHANNELS.AUTOHEAL_L4_TRIGGERED:
      return {
        ...base,
        kind: 'autoheal',
        label: `Subagent: ${event.subagent}`,
        runId: event.runId,
      };
    case EXECUTION_CHANNELS.AUTOHEAL_L5_ESCALATED:
      return {
        ...base,
        kind: 'autoheal',
        label: `Escalated: ${event.reason}`,
        runId: event.runId,
      };
    case EXECUTION_CHANNELS.ARTIFACT_WRITTEN:
      return {
        ...base,
        kind: 'artifact-written',
        label: `${event.kind} ${event.artifactId || '<anonymous>'} written`,
        runId: event.runId,
      };
    case EXECUTION_CHANNELS.ARTIFACT_INVALID: {
      const topIssue = event.issues[0];
      const detail = topIssue
        ? ` (${topIssue.code}${topIssue.field ? `: ${topIssue.field}` : ''})`
        : '';
      return {
        ...base,
        kind: 'artifact-invalid',
        label: `${event.kind} ${event.path.split('/').pop() ?? event.path} invalid${detail}`,
        runId: event.runId,
      };
    }
    default:
      // task/plan/apply/step produce detailed events that are too
      // granular for milestones — skip by default. Callers that want
      // them should supply a custom classifier.
      return null;
  }
}

// =============================================================================
// Implementation
// =============================================================================

class MilestoneTracker implements IMilestoneTracker {
  private readonly _history: Milestone[] = [];
  private readonly _max: number;
  private readonly _memoryStore?: ISharedMemoryStore;
  private readonly _classify: (event: DualFlowEvent) => Milestone | null;
  private _unsubscribe: (() => void) | null = null;

  constructor(bus: IEventBus, config: MilestoneTrackerConfig = {}) {
    this._max = Math.max(1, config.maxHistory ?? 64);
    if (config.memoryStore) this._memoryStore = config.memoryStore;
    this._classify = config.classify ?? defaultClassify;

    this._unsubscribe = bus.onAny((event) => this._ingest(event));
  }

  getHistory(): readonly Milestone[] {
    return this._history;
  }

  getLatest(): Milestone | null {
    if (this._history.length === 0) return null;
    return this._history[this._history.length - 1] ?? null;
  }

  clear(): void {
    this._history.length = 0;
  }

  dispose(): void {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _ingest(event: DualFlowEvent): void {
    const milestone = this._classify(event);
    if (!milestone) return;
    this._history.push(milestone);
    while (this._history.length > this._max) this._history.shift();
    if (this._memoryStore) {
      this._memoryStore.append('shared', 'milestone', milestone, milestone.kind);
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createMilestoneTracker(
  bus: IEventBus,
  config?: MilestoneTrackerConfig,
): IMilestoneTracker {
  return new MilestoneTracker(bus, config);
}
