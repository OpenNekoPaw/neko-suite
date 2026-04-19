/**
 * Plan Layer Types — see docs/architecture/plan-mode.md
 *
 * Phase 1 MVP: LitePlan (in-memory) only. Full .nkplan codec + state machine
 * lands in Phase 2. Contracts here are designed to be forward-compatible.
 */

import type { BindingSlot } from '../asset-library/types';
import type { Constraint, Violation } from '../consistency/types';
import type { BindingCandidate } from '../matching/types';
import type { ReferenceChainEntry } from '../reference-chain/types';
import type { Route } from '../types';

// =============================================================================
// Plan status (lite version)
// =============================================================================

export type LitePlanStatus =
  | 'pending' // plan built, awaiting user review
  | 'approved' // user OK'd; ready to dispatch
  | 'edited' // user modified; needs re-approval
  | 'aborted'; // user backed out

// =============================================================================
// Stage summary (not the executor's stage; the plan's shape of it)
// =============================================================================

export interface PlannedStage {
  /** Stage name from pipeline (matches pipeline-registry entries) */
  readonly id: string;
  /** Short human-readable label for UI */
  readonly label: string;
  /** Whether the Router asked to skip this stage */
  readonly skipped: boolean;
  /** Rough cost / duration hint (shown in UI; not a contract for the runner) */
  readonly estimate?: {
    readonly tokens?: number;
    readonly credits?: number;
    readonly durationSec?: number;
  };
  /**
   * When true, the executor pauses after this stage for user confirmation —
   * even if the stage itself declares `gate: 'auto'`. Persisted in `.nkplan`.
   */
  readonly userCheckpoint?: boolean;
}

// =============================================================================
// Per-shot binding preview
// =============================================================================

export interface ShotBindingSummary {
  readonly shotId: string;
  /** Primary binding chosen by MatchingEngine for each slot */
  readonly primary: Readonly<Partial<Record<BindingSlot, BindingCandidate>>>;
  /** Up to 3 alternatives per slot */
  readonly alternatives: Readonly<Partial<Record<BindingSlot, ReadonlyArray<BindingCandidate>>>>;
  /** Slots where no candidate was found */
  readonly unmatched: ReadonlyArray<BindingSlot>;
}

// =============================================================================
// LitePlan
// =============================================================================

export interface LitePlan {
  /** Unique plan id (kept short; P2 .nkplan uses sha-hash) */
  readonly id: string;
  readonly createdAt: number;
  readonly status: LitePlanStatus;
  /** Route that produced this plan */
  readonly route: Route;
  /** Stages the plan intends to execute (subject to skipStages) */
  readonly stages: ReadonlyArray<PlannedStage>;
  /** Optional per-shot bindings (populated when PlanBuilder has shot info) */
  readonly shots?: ReadonlyArray<ShotBindingSummary>;
  /** Free-form notes from PlanBuilder for the UI */
  readonly notes?: ReadonlyArray<string>;
  /** Consistency constraints discovered during build (Phase 2 ConsistencyChecker) */
  readonly constraints?: ReadonlyArray<Constraint>;
  /**
   * Violations of constraints — ephemeral UI hints. Recomputed by the checker
   * on every build; not stored in the persistent `.nkplan`.
   */
  readonly violations?: ReadonlyArray<Violation>;
  /** Id of the plan this one forked from (see plan-forker.ts). */
  readonly parentPlanId?: string;
  /**
   * Ancestor references per (shot, slot) — Phase 5 reference chain.  When
   * present, PipelineExecutor / MediaGenerationService should thread the
   * listed shot ids' generated output back in as reference images.
   */
  readonly referenceChain?: ReadonlyArray<ReferenceChainEntry>;
}

// =============================================================================
// PlanBuilder inputs
// =============================================================================

export interface PlanBuildInput {
  readonly route: Route;
  /** Optional shot context (e.g., from storyboard) */
  readonly shots?: ReadonlyArray<import('../matching/types').Shot>;
  /** Free-form notes captured during probe/match */
  readonly notes?: ReadonlyArray<string>;
}
