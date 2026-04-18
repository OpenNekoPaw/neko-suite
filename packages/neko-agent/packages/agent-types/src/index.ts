/**
 * @neko-agent/types — Shared type definitions for the neko-agent ecosystem
 *
 * Zero-dependency types package consumed by agent, platform, extension, webview, and cli-tui.
 */

// Message protocol
export type { Message, ToolCall, ContentBlock, ContentBlockType, CodeDiff } from './message';

// Plan
export type { Plan, PlanStep } from './plan';

// Workflow Plan (Router + Plan layer — distinct from agent step-review Plan)
export type {
  WorkflowRouteLevel,
  WorkflowExtensionId,
  WorkflowBindingSlot,
  WorkflowBindingProvenance,
  WorkflowLitePlanStatus,
  WorkflowRoute,
  WorkflowPlannedStage,
  WorkflowBindingCandidate,
  WorkflowShotBindingSummary,
  WorkflowConstraint,
  WorkflowConstraintKind,
  WorkflowViolation,
  WorkflowViolationFix,
  WorkflowViolationSeverity,
  WorkflowLitePlan,
  WorkflowPlanPreviewMessage,
  WorkflowPlanDispatchedMessage,
  WorkflowPlanStatusMessage,
  WorkflowPlanApproveMessage,
  WorkflowPlanOverrideMessage,
  WorkflowPlanAbortMessage,
  WorkflowPlanEditBindingMessage,
  WorkflowPlanApplyToAllMessage,
  WorkflowPlanUpdatedMessage,
  WorkflowPlanToggleCheckpointMessage,
  WorkflowPlanForkMessage,
  WorkflowPlanDiffRequestMessage,
  WorkflowPlanDiffMessage,
  WorkflowPlanDiffPayload,
  WorkflowPlanDiffRouteChange,
  WorkflowPlanDiffRouteChangeKind,
  WorkflowPlanDiffStageChange,
  WorkflowPlanDiffStageChangeKind,
  WorkflowPlanDiffShotChange,
  WorkflowPlanDiffShotChangeKind,
  WorkflowPlanDiffConstraintChange,
  WorkflowPlanDiffConstraintChangeKind,
  WorkflowIncomingMessage,
  WorkflowOutgoingMessage,
} from './workflow-plan';

// Provider
export type { ConfiguredProvider } from './provider';

// Settings
export type { AIAssistantSettings, ShellExecutionMode } from './settings';
export { DEFAULT_SETTINGS } from './settings';

// Agent phase
export type { AgentPhase, AgentState } from './phase';

// UI types
export type {
  ConversationSummary,
  OpenTab,
  TabType,
  PromptMode,
  SessionMode,
  SsoSession,
  SettingsState,
} from './ui';
