/**
 * @neko-agent/types — Shared type definitions for the neko-agent ecosystem
 *
 * Zero-dependency types package consumed by agent, platform, extension, webview, and cli-tui.
 */

// Message protocol
export type { Message, ToolCall, ContentBlock, ContentBlockType, CodeDiff } from './message';

// Plan (parsed plan-mode markdown — agent / extension / webview share)
export type { Plan, PlanStep } from './plan';

// Provider
export type { ConfiguredProvider } from './provider';

// Settings
export type { AIAssistantSettings, ShellExecutionMode } from './settings';
export { DEFAULT_SETTINGS } from './settings';

// Agent phase
export type { AgentPhase, AgentState } from './phase';

// SDD four-stage model (agent-unified-workflow.md §4)
// Replaces the dual-flow primitive pool (deleted in PR3).
export type {
  SddStage,
  StageSet,
  StageActivationDecision,
  StageSkipReason,
  StageTaskShape,
  Paradigm,
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
