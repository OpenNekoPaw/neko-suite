/**
 * Approval module — unified engine for permission / plan-review / quality-gate.
 *
 * See: docs/architecture/dual-flow-architecture.md §5
 *      plan v2 P4
 */

export {
  createApprovalEngine,
  type IApprovalEngine,
  type ApprovalEngineConfig,
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
