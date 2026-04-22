/**
 * Approval module — unified engine for permission / proposal-review / quality-gate.
 *
 * See: docs/architecture/agent-unified-workflow.md §9 (approval governance)
 */

export {
  createApprovalEngine,
  type IApprovalEngine,
  type ApprovalEngineConfig,
  type ApprovalDecisionListener,
} from './approval-engine';

export type {
  ApprovalChannel,
  ApprovalRequest,
  ApprovalResolution,
  ApprovalResponse,
  ApprovalStrategy,
  ApprovalSubject,
  StrategyPack,
  UserApprovalPrompt,
} from './approval-types';

export { creationStrategyPack } from './strategies/creation-strategy-pack';
export { executionStrategyPack } from './strategies/execution-strategy-pack';
export { createPreferencesStrategyPacks } from './strategies/preferences-strategy-pack';

// Adapters bridging existing channels into the engine.
export {
  createPermissionApprovalAdapter,
  type PermissionApprovalAdapterDeps,
} from './adapters/permission-approval-adapter';
export {
  createQualityGateApprovalAdapter,
  verdictFromReport,
  DEFAULT_QUALITY_GATE_THRESHOLDS,
  type QualityGateApprovalAdapterDeps,
  type QualityGateApprovalRequest,
  type QualityGateThresholds,
  type QualityVerdict,
} from './adapters/quality-gate-approval-adapter';
export {
  createPlanReviewApprovalAdapter,
  type PlanReviewApprovalAdapterDeps,
  type PlanReviewApprovalRequest,
  type PlanReviewPlanSummary,
} from './adapters/plan-review-approval-adapter';
