/**
 * @neko-agent/types — Shared type definitions for the neko-agent ecosystem
 *
 * Zero-dependency types package consumed by agent, platform, extension, webview, and cli-tui.
 */

// Message protocol
export type { Message, ToolCall, ContentBlock, ContentBlockType, CodeDiff } from './message';

// Builtin slash command metadata shared across runtime + UI surfaces
export type {
  BuiltinSlashCommandName,
  BuiltinSlashCommandCategory,
  BuiltinSlashCommandSurface,
  BuiltinSlashCommandDefinition,
} from './builtin-slash-command';
export {
  BUILTIN_SLASH_COMMANDS,
  BUILTIN_SLASH_COMMAND_ALIASES,
  listBuiltinSlashCommands,
  getBuiltinSlashCommand,
} from './builtin-slash-command';

// Plan (parsed plan-mode markdown — agent / extension / webview share)
export type { Plan, PlanStep } from './plan';

// Provider
export type { ConfiguredProvider } from './provider';

// Settings
export type { AIAssistantSettings, ShellExecutionMode } from './settings';
export { DEFAULT_SETTINGS } from './settings';

// Agent phase
export type { AgentPhase, AgentState } from './phase';

// IDC three-stage model (agent-unified-workflow.md §4)
// Renamed 2026-04-22: specify/plan/tasks/implement → draft/plan/apply
export type {
  IdcStage,
  StageSet,
  StageActivationDecision,
  StageSkipReason,
  StageTaskShape,
  Paradigm,
} from './stage';

// Task primitive (Plan-stage user-visible checklist — renamed from TodoList 2026-04-22)
export type { TaskStatus, TaskStatusCamel, TaskItem, Task } from './task';
export { toTaskStatusCamel, toTaskStatusSnake } from './task';

// IdcRun — run record carrying IDC stage-activation summaries
export type {
  IdcRunStatus,
  IdcRunRoundSummary,
  IdcRun,
  IdcRunArtifactKind,
  IdcRunArtifactBinding,
} from './idc-run';
export { roundSummaryFromDecision } from './idc-run';

// Draft — Draft-stage artifact (ADR §5.2, §7.5; renamed from Proposal 2026-04-22)
export type { Draft, DraftStatus } from './draft';

// ExecutionPlan — Plan-stage artifact (ADR §4.2, §5, §7.5)
export type {
  ExecutionPlan,
  ExecutionPlanStatus,
  ExecutionPlanStep,
  ExecutionPlanStepStatus,
} from './execution-plan';

// UserPreferences — approval governance input (ADR §9.3)
export type {
  UserPreferences,
  MergedPreferences,
  PreferenceSubjectRule,
  PreferenceCostThresholds,
} from './preferences';

// CapabilityKind — flat capability pool discriminant (ADR §5.1, §5.3)
export type {
  CapabilityKind,
  CapabilityKindInput,
  CapabilityKindSkillLike,
  CapabilityKindToolLike,
} from './capability-kind';
export { capabilityKindOf, safeCapabilityKindOf } from './capability-kind';

// Creation / Execution event namespaces (P2 W5 — ADR §9.2 split)
export type {
  CreationChannel,
  CreationEvent,
  CreationRunStartedEvent,
  CreationMilestoneEvent,
  CreationDraftPresentedEvent,
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
  ExecutionTaskUpdatedEvent,
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
  ExecutionArtifactWrittenEvent,
  ExecutionArtifactInvalidEvent,
  ArtifactKind,
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
