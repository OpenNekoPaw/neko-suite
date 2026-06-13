/**
 * Approval module — unified engine for permission / draft-review / quality-gate.
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
