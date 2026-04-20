/**
 * Approval Types — unified request/response shape for the three channels.
 *
 * See: docs/architecture/dual-flow-architecture.md §5
 *      plan v2 P4 (Approval unification)
 *
 * Three channels funnel through ApprovalEngine:
 *   - PermissionManager (tool-call-level authorization)
 *   - Plan Review (business-level Plan Card approval)
 *   - QualityGate (pipeline stage pass/fail judgment)
 *
 * Each has its own UI surface, but all three boil down to the same
 * core: "given a candidate action, decide accept / reject / escalate,
 * with optional reason and autoheal hint."
 */

import type { FlowKind } from '@neko-agent/types';

// =============================================================================
// Request kinds
// =============================================================================

export type ApprovalChannel =
  /** Tool call authorization (fine-grained, frequent). */
  | 'permission'
  /** Plan Card review (coarse-grained, once per Plan). */
  | 'plan-review'
  /** Quality gate verdict (per stage). */
  | 'quality-gate';

/** Subject being approved — descriptive, not the full payload. */
export interface ApprovalSubject {
  /** Short identifier the UI will render in headers. */
  label: string;
  /**
   * Stable kind string that strategy packs route on — e.g.
   * 'tool:canvas_generate_image', 'plan:Plan-123', 'quality:consistency'.
   */
  kind: string;
  /** Is the action destructive? Strategy packs inspect this. */
  destructive?: boolean;
  /**
   * Does repeating the same action produce the same result? Informs
   * partial-rerun policies.
   */
  idempotent?: boolean;
}

export interface ApprovalRequest {
  channel: ApprovalChannel;
  /** Which ring the request originated from. */
  flow: FlowKind;
  subject: ApprovalSubject;
  /**
   * Structured context the strategy pack inspects — e.g. tool args,
   * Plan card contents, quality report. Opaque shape kept to keep the
   * engine type-stable across channels.
   */
  context?: Record<string, unknown>;
  /** Unique id so call sites can correlate responses with requests. */
  id: string;
  /** ms epoch. */
  at: number;
}

// =============================================================================
// Decision + response
// =============================================================================

export type ApprovalResolution =
  /** Strategy pack auto-decided (no user ask). */
  | 'auto-accept'
  | 'auto-reject'
  /** User decided through their preferred UI. */
  | 'user-accept'
  | 'user-reject'
  /** Neither: escalate to a higher-authority handler. */
  | 'escalate';

export interface ApprovalResponse {
  requestId: string;
  resolution: ApprovalResolution;
  /** Short machine-readable reason (strategy pack key or UI verb). */
  reason: string;
  /** Human-readable detail for logs/UI. */
  note?: string;
  /** ms epoch — when the decision was made. */
  decidedAt: number;
}

// =============================================================================
// Strategy contract
// =============================================================================

/**
 * A strategy pack is called *before* the UI — it may short-circuit the
 * request (auto-accept / auto-reject) or return `undefined` meaning
 * "ask the user".
 */
export type ApprovalStrategy = (request: ApprovalRequest) => ApprovalResponse | undefined;

export interface StrategyPack {
  /** Label for telemetry. */
  name: string;
  /**
   * Which ring this pack handles. ApprovalEngine picks the pack by
   * request.flow; if both ring-specific packs decline, a 'shared'
   * pack may run last.
   */
  scope: FlowKind | 'shared';
  /** The strategy function itself. */
  evaluate: ApprovalStrategy;
}

// =============================================================================
// User-prompt surface
// =============================================================================

/**
 * Callback the engine invokes when no strategy pack auto-decides.
 * Callers (extension UI, CLI prompt, test stubs) return the user's
 * choice. Returning `undefined` is treated as rejection by the engine.
 */
export type UserApprovalPrompt = (
  request: ApprovalRequest,
) => Promise<ApprovalResponse | undefined>;
