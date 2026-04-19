// =============================================================================
// NKPLAN Format SDK — Types
//
// Persistent wire format for a workflow "LitePlan" + "NkPlan" as described in
// docs/architecture/plan-mode.md §5.
//
// Design invariants:
//   - postMessage-safe JSON (no class instances, no Float32Array, no Date).
//   - Forward-compatible via `version` + nkplan/migrator.ts.
//   - Structurally a strict superset of the Workflow in-memory LitePlan — the
//     platform package's LitePlan can be serialised to NkPlan directly.
// =============================================================================

import type { ValidationError, ValidationResult } from '../config/config-adapter';

export type { ValidationResult, ValidationError };

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

/** Supported NKPLAN format versions */
export type NkplanVersion = '1.0';

/** Current NKPLAN format version */
export const CURRENT_NKPLAN_VERSION: NkplanVersion = '1.0';

// ---------------------------------------------------------------------------
// Route / Stage / Binding (duplicated from agent-types to avoid cross-pkg import)
// ---------------------------------------------------------------------------

export type NkplanRouteLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';

export type NkplanExtensionId = 'agent' | 'story' | 'canvas' | 'sketch' | 'cut' | 'preview';

export type NkplanBindingSlot = 'character' | 'scene' | 'action' | 'prop' | 'style';

export type NkplanBindingProvenance = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'user';

export type NkplanRouteProvenance = 'rules' | 'llm' | 'user-override' | 'memory';

/** A concrete routing decision snapshot */
export interface NkplanRoute {
  readonly level: NkplanRouteLevel;
  readonly flowId: string;
  readonly entryExtension: NkplanExtensionId;
  readonly skipStages: readonly string[];
  readonly stageParams?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly reason: string;
  readonly confidence: number;
  readonly provenance: NkplanRouteProvenance;
}

/** A single stage preview entry */
export interface NkplanStage {
  readonly id: string;
  readonly label: string;
  readonly skipped: boolean;
  readonly estimate?: {
    readonly tokens?: number;
    readonly credits?: number;
    readonly durationSec?: number;
  };
  /** When true, execution must pause here for user confirmation */
  readonly userCheckpoint?: boolean;
}

/** A single binding candidate for a shot × slot */
export interface NkplanBindingCandidate {
  readonly slot: NkplanBindingSlot;
  readonly entityId: string;
  readonly assetId: string;
  readonly provenance: NkplanBindingProvenance;
  readonly confidence: number;
  readonly reason?: string;
}

/** Per-shot binding summary (primary + alternatives + unmatched) */
export interface NkplanShotBindings {
  readonly shotId: string;
  readonly primary: Readonly<Partial<Record<NkplanBindingSlot, NkplanBindingCandidate>>>;
  readonly alternatives: Readonly<
    Partial<Record<NkplanBindingSlot, readonly NkplanBindingCandidate[]>>
  >;
  readonly unmatched: readonly NkplanBindingSlot[];
  /** Whether the user has confirmed this shot's bindings */
  readonly userConfirmed?: boolean;
}

// ---------------------------------------------------------------------------
// Reference chain (populated by Phase 5 reference-chain builder — see
// docs/architecture/creative-consistency.md §4).  Consumers (PipelineExecutor /
// MediaGenerationService) use this to feed ancestor-shot outputs back in as
// references, reducing per-shot drift in diffusion-based generators.
// ---------------------------------------------------------------------------

export type NkplanReferenceChainStrategy = 'sequential' | 'anchored' | 'hybrid';

export interface NkplanReferenceChainEntry {
  /** Target shot that should receive the listed references. */
  readonly shotId: string;
  /** Slot whose chain this entry belongs to (character / scene / prop / ...). */
  readonly slot: NkplanBindingSlot;
  /** Ordered list of *prior* shot ids whose generated output should be reused. */
  readonly references: readonly string[];
  /** Strategy that produced the entry — retained for explainability. */
  readonly strategy: NkplanReferenceChainStrategy;
}

// ---------------------------------------------------------------------------
// Consistency constraints (populated by ConsistencyChecker — see
// docs/architecture/creative-consistency.md §2)
// ---------------------------------------------------------------------------

export type NkplanConstraintKind =
  | 'character_lock'
  | 'time_progression'
  | 'costume_continuity'
  | 'style_lock'
  | 'prop_consistency';

export interface NkplanConstraint {
  readonly id: string;
  readonly kind: NkplanConstraintKind;
  readonly entity: string;
  /** Shot ids the constraint applies to */
  readonly shots: readonly string[];
  /** Payload depends on `kind` (e.g. lockedAsset, sequence, outfit value) */
  readonly payload: Readonly<Record<string, unknown>>;
  readonly severity?: 'error' | 'warning' | 'info';
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export type NkplanStatus =
  | 'pending' // Plan built, awaiting user review
  | 'approved' // User OK'd; ready to dispatch
  | 'executing' // Plan dispatched and running
  | 'paused' // Checkpoint reached; awaiting resume
  | 'edited' // User modified; back to pending for re-approval
  | 'completed' // Pipeline finished successfully
  | 'aborted' // User backed out
  | 'failed'; // Pipeline execution failed

/** Status transition audit log entry */
export interface NkplanStatusEvent {
  readonly status: NkplanStatus;
  readonly at: number;
  readonly reason?: string;
  /** Optional actor identifier (user id / 'system' / 'auto-approve') */
  readonly by?: string;
}

// ---------------------------------------------------------------------------
// Input — the RawInput snapshot that produced this plan.  Persisting lets a
// fork / approve run without re-plumbing RawInput through the caller: the
// plan is self-sufficient, the pipeline derives ctx.source / ctx.sourceFormat
// from plan.input rather than a bag passed alongside.
// ---------------------------------------------------------------------------

export type NkplanInput =
  | { readonly kind: 'prompt'; readonly text: string }
  | { readonly kind: 'file'; readonly path: string; readonly size?: number }
  | { readonly kind: 'files'; readonly paths: readonly string[]; readonly totalSize?: number }
  | { readonly kind: 'project'; readonly path: string; readonly workflow?: string };

// ---------------------------------------------------------------------------
// MatchingShot — the Shot[] input that MatchingEngine + ConsistencyChecker
// ran against.  Persisted so forks / reloaded plans can re-run the checker
// without losing access to the original matching input.  Shape mirrors
// packages/platform/.../matching/types.ts Shot, kept inlined to avoid a
// cross-package import.
// ---------------------------------------------------------------------------

export interface NkplanEntityRef {
  readonly slot: NkplanBindingSlot;
  readonly entityId?: string;
  readonly name?: string;
  /** Optional variant hint ("dawn", "casual") */
  readonly variant?: string;
}

export interface NkplanShot {
  readonly id: string;
  /** Script line / description text (used by L1/L2/L3 matchers) */
  readonly scriptLine?: string;
  /** Pre-extracted entity references (e.g., from NekoStoryAPI) */
  readonly entityRefs?: readonly NkplanEntityRef[];
  /** Scene group for continuity grouping */
  readonly sceneGroupId?: string;
  /** Shot index in the story/canvas (for sequential continuity) */
  readonly index?: number;
  /** Optional free-form tags (e.g., 'scene-change' breaks continuity) */
  readonly tags?: readonly string[];
}

// ---------------------------------------------------------------------------
// NkPlan — the persistent root
// ---------------------------------------------------------------------------

/** Loose reference to a project (path relative to workspace, or absolute) */
export interface NkplanProjectRef {
  readonly path: string;
  readonly name?: string;
}

/** The persistent .nkplan file root */
export interface NkPlan {
  readonly version: NkplanVersion;
  readonly id: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly status: NkplanStatus;
  readonly statusHistory: readonly NkplanStatusEvent[];
  /** Optional fork lineage — points to the parent plan id */
  readonly parentPlanId?: string;
  /** Optional project reference (for multi-project workspaces) */
  readonly project?: NkplanProjectRef;

  readonly route: NkplanRoute;
  readonly stages: readonly NkplanStage[];
  readonly shots?: readonly NkplanShotBindings[];
  readonly constraints?: readonly NkplanConstraint[];
  /** Ancestor references per chained (shot, slot) — Phase 5 reference chain */
  readonly referenceChain?: readonly NkplanReferenceChainEntry[];
  readonly notes?: readonly string[];
  /**
   * The RawInput snapshot that produced this plan (prompt text, file path,
   * etc.).  Optional for backwards compatibility with plans created before
   * the field existed, but freshly built plans always populate it so that
   * forks / approvals don't need the caller to re-plumb the original
   * request through.  See workflow-plan-handler.ts `presentInteractive`.
   */
  readonly input?: NkplanInput;
  /**
   * Original Shot[] that MatchingEngine + ConsistencyChecker ran against.
   * Persisted so forks / reloaded plans can re-run the checker without
   * losing access to the original matching input (pre-Phase-3 reviews
   * had to fail-safe on empty shots, silently preserving prior
   * violations; with this field the checker runs honestly).  Optional
   * for backwards compatibility.
   */
  readonly matchingShots?: readonly NkplanShot[];

  /** Arbitrary stage-scoped parameters (e.g. user-tuned globalStyle) */
  readonly stageParams?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;

  /** Pipeline execution id once dispatched (for cross-reference) */
  readonly pipelineId?: string;
  /** Error message when status='failed' */
  readonly errorMessage?: string;
}

// ---------------------------------------------------------------------------
// SDK options
// ---------------------------------------------------------------------------

export interface NkplanValidateOptions {
  /** When true, treat warnings as errors */
  strict?: boolean;
}

export interface NkplanLoadResult {
  readonly plan: NkPlan;
  readonly validation: ValidationResult;
  readonly migration?: NkplanMigrationResult;
}

export interface NkplanSaveOptions {
  /** Whether to validate before saving (default: true) */
  validate?: boolean;
  /** JSON indentation (default: 2) */
  indent?: number;
}

export interface NkplanMigrationResult {
  readonly data: NkPlan;
  readonly fromVersion: NkplanVersion;
  readonly toVersion: NkplanVersion;
  readonly appliedMigrations: readonly string[];
  readonly warnings: readonly string[];
}
