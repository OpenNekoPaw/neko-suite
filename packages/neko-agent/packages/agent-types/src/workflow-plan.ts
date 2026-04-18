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

export interface WorkflowLitePlan {
  id: string;
  createdAt: number;
  status: WorkflowLitePlanStatus;
  route: WorkflowRoute;
  stages: WorkflowPlannedStage[];
  shots?: WorkflowShotBindingSummary[];
  notes?: string[];
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

export type WorkflowIncomingMessage =
  | WorkflowPlanPreviewMessage
  | WorkflowPlanDispatchedMessage
  | WorkflowPlanStatusMessage;

export type WorkflowOutgoingMessage =
  | WorkflowPlanApproveMessage
  | WorkflowPlanOverrideMessage
  | WorkflowPlanAbortMessage;
