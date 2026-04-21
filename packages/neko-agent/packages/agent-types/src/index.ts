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
  PipelineGateSceneCard,
  PipelineGatePreview,
  PipelineGateWaitingMessage,
  PipelineGateConfirmMessage,
  PipelineGateCancelMessage,
  WorkflowRouterAskMessage,
  WorkflowRouterAskResponseMessage,
  WorkflowRouterAskResponseStatus,
  WorkflowPlanListEntry,
  WorkflowPlanListRequestMessage,
  WorkflowPlanListMessage,
  WorkflowRouterMemoryEntry,
  WorkflowRouterMemoryRequestMessage,
  WorkflowRouterMemoryMessage,
  WorkflowRouterMemoryDeleteMessage,
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

// Dual-flow architecture (Creation Flow / Execution Flow)
export type { FlowKind, FlowTransitionReason, FlowContext, FlowTransitionEvent } from './flow';
export { DEFAULT_FLOW_CONTEXT } from './flow';

// Primitive pool (P1.5 — activation planner inputs/outputs)
// @deprecated Replaced by SDD four-stage model (see ./stage.ts).
//   Kept through PR2 of the refactor to let consumers migrate incrementally.
//   Removed in PR3.
export type {
  CreationPrimitive,
  ExecutionPrimitive,
  Primitive,
  PrimitiveSet,
  PrimitiveActivationDecision,
  PrimitiveSkipReason,
  TaskShape,
} from './primitive';

// SDD four-stage model (agent-unified-workflow.md §4)
// Replaces the primitive pool. Co-exists with it through PR2.
export type {
  SddStage,
  StageSet,
  StageActivationDecision,
  StageSkipReason,
  StageTaskShape,
} from './stage';

// TodoList primitive (P2 W5 — downshifted L1 primitive)
export type { TodoStatus, TodoStatusCamel, TodoItem, TodoList } from './todo-list';
export { toTodoStatusCamel, toTodoStatusSnake } from './todo-list';

// WorkflowRun (P2 W5 — run record carrying primitive activation summaries)
export type { WorkflowRunStatus, WorkflowRunRoundSummary, WorkflowRun } from './workflow-run';
export { roundSummaryFromDecision } from './workflow-run';

// Creation / Execution event namespaces (P2 W5 — ADR §9.2 split)
export type {
  CreationChannel,
  CreationEvent,
  CreationRunStartedEvent,
  CreationMilestoneEvent,
  CreationProposalPresentedEvent,
  CreationReviewDecidedEvent,
  CreationStatusUpdatedEvent,
  CreationRunEndedEvent,
  ReviewDecision,
} from './creation-events';
export { CREATION_CHANNELS } from './creation-events';

export type {
  ExecutionChannel,
  ExecutionEvent,
  ExecutionRoundActivationDecidedEvent,
  ExecutionPlanProducedEvent,
  ExecutionTodoUpdatedEvent,
  ExecutionApproveDecidedEvent,
  ExecutionApplyCommittedEvent,
  ExecutionStepCompletedEvent,
  ExecutionAutohealEvent,
  ExecutionAutohealL1RetryEvent,
  ExecutionAutohealL2DegradeEvent,
  ExecutionAutohealL3SubstituteEvent,
  ExecutionAutohealL4TriggeredEvent,
  ExecutionAutohealL5EscalatedEvent,
  ExecutionQualityEvaluatedEvent,
} from './execution-events';
export { EXECUTION_CHANNELS } from './execution-events';

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
