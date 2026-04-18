/**
 * Workflow Plan (Router/Plan-layer output) — wire types shared between
 * extension and webview.
 *
 * Distinct from `./plan` (agent-driven step review). This type mirrors
 * Platform's `LitePlan` but strips class references and Float32Array embeddings
 * so it can safely postMessage() across the VSCode IPC boundary.
 *
 * See docs/architecture/plan-mode.md.
 */

// =============================================================================
// Plain copies of enums / basic types
// =============================================================================

export type WorkflowRouteLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';

export type WorkflowExtensionId = 'agent' | 'story' | 'canvas' | 'sketch' | 'cut' | 'preview';

export type WorkflowBindingSlot = 'character' | 'scene' | 'action' | 'prop' | 'style';

export type WorkflowBindingProvenance = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'user';

export type WorkflowLitePlanStatus = 'pending' | 'approved' | 'edited' | 'aborted';

// =============================================================================
// Route (from Workflow layer)
// =============================================================================

export interface WorkflowRoute {
  level: WorkflowRouteLevel;
  flowId: string;
  entryExtension: WorkflowExtensionId;
  skipStages: string[];
  reason: string;
  confidence: number;
  provenance: 'rules' | 'llm' | 'user-override' | 'memory';
}

// =============================================================================
// Plan stage preview
// =============================================================================

export interface WorkflowPlannedStage {
  id: string;
  label: string;
  skipped: boolean;
  estimate?: {
    tokens?: number;
    credits?: number;
    durationSec?: number;
  };
  /** When true, the pipeline pauses after this stage for user confirmation */
  userCheckpoint?: boolean;
}

// =============================================================================
// Per-shot binding preview
// =============================================================================

export interface WorkflowBindingCandidate {
  slot: WorkflowBindingSlot;
  entityId: string;
  assetId: string;
  provenance: 'L1' | 'L2' | 'L3' | 'L4' | 'L5';
  confidence: number;
  reason?: string;
}

export interface WorkflowShotBindingSummary {
  shotId: string;
  primary: Partial<Record<WorkflowBindingSlot, WorkflowBindingCandidate>>;
  alternatives: Partial<Record<WorkflowBindingSlot, WorkflowBindingCandidate[]>>;
  unmatched: WorkflowBindingSlot[];
}

// =============================================================================
// LitePlan (postMessage-safe)
// =============================================================================

export type WorkflowConstraintKind =
  | 'character_lock'
  | 'time_progression'
  | 'costume_continuity'
  | 'style_lock'
  | 'prop_consistency';

export type WorkflowViolationSeverity = 'error' | 'warning' | 'info';

export interface WorkflowConstraint {
  id: string;
  kind: WorkflowConstraintKind;
  entity: string;
  shots: string[];
  payload: Record<string, unknown>;
  severity?: WorkflowViolationSeverity;
}

export type WorkflowViolationFix =
  | {
      kind: 'replace-binding';
      shotId: string;
      slot: WorkflowBindingSlot;
      assetId: string;
    }
  | { kind: 'add-scene-break'; beforeShot: string }
  | { kind: 'accept-as-intentional'; note: string };

export interface WorkflowViolation {
  id: string;
  kind: WorkflowConstraintKind;
  severity: WorkflowViolationSeverity;
  constraintId: string;
  shotIds: string[];
  entity: string;
  slot?: WorkflowBindingSlot;
  message: string;
  suggestions?: WorkflowViolationFix[];
}

export interface WorkflowLitePlan {
  id: string;
  createdAt: number;
  status: WorkflowLitePlanStatus;
  route: WorkflowRoute;
  stages: WorkflowPlannedStage[];
  shots?: WorkflowShotBindingSummary[];
  notes?: string[];
  /** Consistency constraints discovered during build (Phase 2) */
  constraints?: WorkflowConstraint[];
  /** Ephemeral violations — recomputed each build; not persisted in .nkplan */
  violations?: WorkflowViolation[];
  /** Parent plan id when this plan was forked from another */
  parentPlanId?: string;
}

// =============================================================================
// Webview ↔ Extension messages
// =============================================================================

/** Extension → Webview: present a plan for the user to review */
export interface WorkflowPlanPreviewMessage {
  type: 'workflow/planPreview';
  plan: WorkflowLitePlan;
  /** Optional echo of the input for debugging */
  inputSummary?: string;
}

/** Extension → Webview: a plan has been dispatched to the pipeline */
export interface WorkflowPlanDispatchedMessage {
  type: 'workflow/planDispatched';
  planId: string;
  pipelineId: string;
  flowId: string;
}

/** Extension → Webview: plan execution completed / errored */
export interface WorkflowPlanStatusMessage {
  type: 'workflow/planStatus';
  planId: string;
  status: 'approved' | 'executing' | 'completed' | 'aborted' | 'failed';
  errorMessage?: string;
}

/** Webview → Extension: user approved the plan */
export interface WorkflowPlanApproveMessage {
  type: 'workflow/planApprove';
  planId: string;
}

/** Webview → Extension: user overrode the plan with a different route level */
export interface WorkflowPlanOverrideMessage {
  type: 'workflow/planOverride';
  planId: string;
  forceLevel: WorkflowRouteLevel;
}

/** Webview → Extension: user aborted the plan */
export interface WorkflowPlanAbortMessage {
  type: 'workflow/planAbort';
  planId: string;
}

/** Webview → Extension: user overrode a shot binding in the matrix */
export interface WorkflowPlanEditBindingMessage {
  type: 'workflow/planEditBinding';
  planId: string;
  shotId: string;
  slot: WorkflowBindingSlot;
  /** Choose one of the shot's existing alternatives by assetId */
  assetId: string;
}

/** Webview → Extension: propagate a binding to every other shot of the same entity */
export interface WorkflowPlanApplyToAllMessage {
  type: 'workflow/planApplyToAll';
  planId: string;
  entityId: string;
  slot: WorkflowBindingSlot;
  assetId: string;
}

/** Extension → Webview: re-broadcast an updated plan after an edit */
export interface WorkflowPlanUpdatedMessage {
  type: 'workflow/planUpdated';
  plan: WorkflowLitePlan;
}

// =============================================================================
// Checkpoint + fork + diff messages (Phase 2 remainder)
// =============================================================================

/**
 * Webview → Extension: toggle the `userCheckpoint` flag on a stage. When the
 * plan is later dispatched, the pipeline will pause after that stage.
 */
export interface WorkflowPlanToggleCheckpointMessage {
  type: 'workflow/planToggleCheckpoint';
  planId: string;
  stageId: string;
  /** Omit to flip the current value. */
  value?: boolean;
}

/**
 * Webview → Extension: fork the given plan into a new pending plan. Typically
 * used after a pipeline finishes (or aborts) to kick off a new run with the
 * same bindings + different edits.
 */
export interface WorkflowPlanForkMessage {
  type: 'workflow/planFork';
  planId: string;
  /**
   * When true, the fork clears user-confirmed bindings so continuity
   * matching can re-choose. Defaults to false.
   */
  resetToOriginal?: boolean;
}

/** Webview → Extension: ask for a diff between the given plan id and its parent (or explicit left). */
export interface WorkflowPlanDiffRequestMessage {
  type: 'workflow/planDiffRequest';
  /** Plan whose diff we want to see */
  planId: string;
  /**
   * Optional left-hand plan id. When omitted, the handler loads
   * `<planId>.parentPlanId` — useful after a fork.
   */
  againstPlanId?: string;
}

// ---------------------------------------------------------------------------
// Diff payload (kept structurally aligned with platform's PlanDiff)
// ---------------------------------------------------------------------------

export type WorkflowPlanDiffRouteChangeKind = 'level' | 'flowId' | 'skipStages' | 'entryExtension';

export interface WorkflowPlanDiffRouteChange {
  kind: WorkflowPlanDiffRouteChangeKind;
  from: string | string[];
  to: string | string[];
}

export type WorkflowPlanDiffStageChangeKind =
  | 'added'
  | 'removed'
  | 'skippedToggled'
  | 'checkpointToggled';

export interface WorkflowPlanDiffStageChange {
  kind: WorkflowPlanDiffStageChangeKind;
  stageId: string;
  value?: boolean;
}

export type WorkflowPlanDiffShotChangeKind =
  | 'primarySwapped'
  | 'unmatchedChanged'
  | 'confirmedToggled'
  | 'shotAdded'
  | 'shotRemoved';

export interface WorkflowPlanDiffShotChange {
  kind: WorkflowPlanDiffShotChangeKind;
  shotId: string;
  slot?: WorkflowBindingSlot;
  fromAssetId?: string;
  toAssetId?: string;
  value?: boolean;
}

export type WorkflowPlanDiffConstraintChangeKind = 'added' | 'removed';

export interface WorkflowPlanDiffConstraintChange {
  kind: WorkflowPlanDiffConstraintChangeKind;
  constraintId: string;
  constraintKind: string;
}

export interface WorkflowPlanDiffPayload {
  leftId: string;
  rightId: string;
  route: WorkflowPlanDiffRouteChange[];
  stages: WorkflowPlanDiffStageChange[];
  shots: WorkflowPlanDiffShotChange[];
  constraints: WorkflowPlanDiffConstraintChange[];
  unchanged: boolean;
}

/** Extension → Webview: diff result for a prior DiffRequest */
export interface WorkflowPlanDiffMessage {
  type: 'workflow/planDiff';
  /** Unique request handle — matches the triggering request's planId/againstPlanId */
  planId: string;
  againstPlanId: string | undefined;
  diff: WorkflowPlanDiffPayload | undefined;
  /** Populated when the diff can't be computed (e.g., missing persisted plan) */
  errorMessage?: string;
}

// =============================================================================
// Pipeline gate messages (checkpoint pause UI)
//
// The executor already emits `gate_waiting` events; pipeline-progress-bridge
// forwards them as `pipelineGateWaiting` posts (see that file).  These types
// document the wire shape so webview + extension agree, and add the two
// back-channels (resume / cancel) needed to complete the loop.
// =============================================================================

/**
 * Per-scene review card included in the gate preview (populated by
 * pipeline-progress-bridge.buildGatePreview for batch-generate gates).
 */
export interface PipelineGateSceneCard {
  sceneIndex: number;
  heading: string;
  description: string;
  mediaPath: string;
  mediaType: 'image' | 'video';
  failed: boolean;
}

export interface PipelineGatePreview {
  stage: string;
  scenes: PipelineGateSceneCard[];
  globalStyle?: string;
  failedIndices?: number[];
  totalScenes?: number;
  generatedCount?: number;
}

/** Extension → Webview: executor is paused at a gate, awaiting resume. */
export interface PipelineGateWaitingMessage {
  type: 'pipelineGateWaiting';
  pipelineId: string;
  data: PipelineGatePreview;
}

/** Webview → Extension: user resumed the pipeline past the current gate. */
export interface PipelineGateConfirmMessage {
  type: 'pipelineGateConfirm';
  pipelineId: string;
  /** Optional context patch applied before the next stage runs */
  modifications?: Record<string, unknown>;
}

/** Webview → Extension: user cancelled — pipeline should abort at the gate. */
export interface PipelineGateCancelMessage {
  type: 'pipelineGateCancel';
  pipelineId: string;
}

// =============================================================================
// Router ask_user messages (Phase 3.5 — LLMRouter clarifying question)
//
// Wire protocol for the LLMRouter's `ask_user` tool.  Extension posts
// `workflow/routerAsk` with an askId; webview responds with
// `workflow/routerAskResponse`.  The router pauses its budget while
// the ask is outstanding.
// =============================================================================

export type WorkflowRouterAskResponseStatus = 'answered' | 'dismissed';

/** Extension → Webview: the LLM router wants the user to answer a question. */
export interface WorkflowRouterAskMessage {
  type: 'workflow/routerAsk';
  /** Correlation id; include in the response. */
  askId: string;
  question: string;
  /** Optional multiple-choice options; freeform is allowed when absent. */
  options?: string[];
  /** Soft deadline in ms; webview can render a countdown if it wants. */
  timeoutMs?: number;
}

/** Webview → Extension: user's answer (or dismissal) for a routerAsk. */
export interface WorkflowRouterAskResponseMessage {
  type: 'workflow/routerAskResponse';
  askId: string;
  status: WorkflowRouterAskResponseStatus;
  /** One of the options (for answered + multiple-choice). */
  choice?: string;
  /** Freeform typed answer. */
  freeformAnswer?: string;
}

export type WorkflowIncomingMessage =
  | WorkflowPlanPreviewMessage
  | WorkflowPlanDispatchedMessage
  | WorkflowPlanStatusMessage
  | WorkflowPlanUpdatedMessage
  | WorkflowPlanDiffMessage
  | PipelineGateWaitingMessage
  | WorkflowRouterAskMessage;

export type WorkflowOutgoingMessage =
  | WorkflowPlanApproveMessage
  | WorkflowPlanOverrideMessage
  | WorkflowPlanAbortMessage
  | WorkflowPlanEditBindingMessage
  | WorkflowPlanApplyToAllMessage
  | WorkflowPlanToggleCheckpointMessage
  | WorkflowPlanForkMessage
  | WorkflowPlanDiffRequestMessage
  | PipelineGateConfirmMessage
  | PipelineGateCancelMessage
  | WorkflowRouterAskResponseMessage;
