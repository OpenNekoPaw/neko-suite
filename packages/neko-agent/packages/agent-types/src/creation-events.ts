/**
 * Creation Events — creation-persona event namespace.
 *
 * Channels follow `creation.<stage>.<verb>` and are **business-semantic**
 * (user-facing), not technical-semantic. Emitted during the IDC Draft /
 * Plan stages while creation-persona is active. Technical, Apply-stage
 * events belong on the execution-events namespace.
 *
 * These are type declarations only. The runtime EventBus maps channel
 * strings to these payload types; this module stays zero-dependency so
 * agent-types can remain infrastructure-free.
 */

import type { StageActivationRoundSummary, StageSkipReason } from './stage';

// =============================================================================
// Channel names (stable strings — used as bus keys)
// =============================================================================

export const CREATION_CHANNELS = {
  /** A new Run was created. */
  RUN_STARTED: 'creation.run.started',
  /** A user-visible milestone was produced by Orchestration or Status. */
  MILESTONE: 'creation.milestone',
  /** A Draft was presented for Review. */
  DRAFT_PRESENTED: 'creation.draft.presented',
  /** User decision on a Review (approve / reject / fork / refine). */
  REVIEW_DECIDED: 'creation.review.decided',
  /** Status summary refreshed (user-facing narrative). */
  STATUS_UPDATED: 'creation.status.updated',
  /** Terminal transition (Run completed or aborted). */
  RUN_ENDED: 'creation.run.ended',
} as const;

export type CreationChannel = (typeof CREATION_CHANNELS)[keyof typeof CREATION_CHANNELS];

// =============================================================================
// Payloads
// =============================================================================

export interface CreationRunStartedEvent {
  channel: typeof CREATION_CHANNELS.RUN_STARTED;
  runId: string;
  creationKind: string;
  at: number;
}

export interface CreationMilestoneEvent {
  channel: typeof CREATION_CHANNELS.MILESTONE;
  runId: string;
  /** Short milestone label (e.g. "12/16 shots drafted"). */
  label: string;
  /** Optional structured detail for UIs that render more than the label. */
  detail?: Record<string, unknown>;
  at: number;
}

export interface CreationDraftPresentedEvent {
  channel: typeof CREATION_CHANNELS.DRAFT_PRESENTED;
  runId: string;
  draftId: string;
  at: number;
}

export type ReviewDecision = 'approve' | 'reject' | 'fork' | 'refine';

export interface CreationReviewDecidedEvent {
  channel: typeof CREATION_CHANNELS.REVIEW_DECIDED;
  runId: string;
  draftId: string;
  decision: ReviewDecision;
  /** Optional reason the user gave. */
  note?: string;
  at: number;
}

export interface CreationStatusUpdatedEvent {
  channel: typeof CREATION_CHANNELS.STATUS_UPDATED;
  runId: string;
  /**
   * Narrative summary composed by the progress narrator (P5). Free-text.
   */
  narrative: string;
  /**
   * Optional snapshot of the latest round summary — enables downstream
   * consumers to correlate narrative with the activation decision that
   * produced it without replaying the bus (R9 compaction).
   */
  lastRound?: StageActivationRoundSummary;
  at: number;
}

export interface CreationRunEndedEvent {
  channel: typeof CREATION_CHANNELS.RUN_ENDED;
  runId: string;
  status: 'completed' | 'aborted' | 'failed';
  /** When the run failed/aborted, the skip reason that triggered the end. */
  reason?: StageSkipReason | 'user-cancel' | 'unrecoverable';
  at: number;
}

// =============================================================================
// Union
// =============================================================================

export type CreationEvent =
  | CreationRunStartedEvent
  | CreationMilestoneEvent
  | CreationDraftPresentedEvent
  | CreationReviewDecidedEvent
  | CreationStatusUpdatedEvent
  | CreationRunEndedEvent;
