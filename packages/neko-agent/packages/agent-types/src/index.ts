/**
 * @neko-agent/types — Shared type definitions for the neko-agent ecosystem
 *
 * Zero-dependency types package consumed by agent, platform, extension, webview, and cli-tui.
 */

// Message protocol
export type { Message, ToolCall, ContentBlock, ContentBlockType, CodeDiff } from './message';
export type {
  CloseCurrentConversationTabInput,
  CloseCurrentConversationTabProjection,
  SlashCommandResultEffect,
  SlashCommandResultProjection,
  SlashCommandResultProjectionOptions,
} from './command-result-contract';
export type {
  ConnectionServiceType,
  ConnectionState,
  ConnectionStateChangeEvent,
  ConnectionStateListener,
  ConnectionStatus,
} from './connection-state';
export {
  NEKO_AGENT_LLM_GENERATE_COMMAND,
  NEKO_AGENT_REGISTER_CAPABILITIES_COMMAND,
  NEKO_AGENT_REGISTER_SLASH_COMMANDS_COMMAND,
  NEKO_AI_ASSISTANT_FOCUS_COMMAND,
  NEKO_MARKET_EXTENSION_ID,
  NEKO_MARKET_OPEN_SKILLS_COMMAND,
  NEKO_PUPPET_EXTENSION_ID,
  buildPluginSlashCommandCommand,
  type PluginSlashCommandCommandInput,
} from './extension-command-contract';
export {
  NEKO_ENGINE_CLIENT_TIMEOUT_MS,
  NEKO_ENGINE_ENSURE_FRAME_SERVER_COMMAND,
  NEKO_ENGINE_EXTENSION_ID,
  isNekoEngineFrameServerResult,
  type NekoEngineFrameServerResult,
} from './engine-bridge-contract';
export type { EnabledStateRecord } from './enabled-state';
export type {
  PluginSlashCommandDef,
  PluginSlashCommandInvocation,
  RegisteredPluginSlashCommand,
} from './plugin-slash-command';
export { normalizeSlashCommandName } from './slash-command-utils';
export type {
  MarketplaceProjectionMessage,
  ChatWorkspaceModelStateInput,
  ChatWorkspaceModelStateProjection,
  MessageModelProjection,
  MessageModelProjectionInput,
  MarketplaceExecutionEventProjection,
  MarketplaceRequestProjection,
  MediaModelDefaults,
  MediaModelSelectionDefaultsProjection,
  MediaModelSelectionState,
  PluginSlashCommandProjection,
  ProjectFilesProjection,
  ProjectMentionItem,
  ProjectMentionItemKind,
  SessionModeMediaSelectionProjection,
  SettingsDataProjection,
  SsoErrorProjection,
  SsoSessionMessagePayload,
  SsoSessionProjection,
} from './config-message-projector';
export type {
  AgentStateEntry,
  AgentStateStoreProjection,
  ProjectAgentPhaseInput,
  ProjectAgentStateSnapshotInput,
  ProjectAgentStoppedInput,
} from './agent-state-contract';
export type {
  ActiveConversationPayload,
  ActiveConversationProjection,
  ActiveConversationProjectionInput,
  ConversationErrorProjectionInput,
  ConversationMessagesProjection,
  ConversationStreamingState,
} from './conversation-ui-contract';
export type {
  CompressionErrorProjection,
  CompressionResultProjection,
  ContextTokenCountProjection,
  ProjectCompressionErrorInput,
  ProjectCompressionResultInput,
  ProjectContextTokenCountInput,
} from './context-state-contract';
export type {
  AgentBackgroundTask,
  AgentMediaTaskError,
  AgentMediaTaskOutput,
  AgentMediaTaskView,
  AgentWorkItem,
  AgentWorkItemBase,
  AgentWorkItemKind,
  AgentWorkItemStore,
  AgentWorkItemTaskStatus,
  AgentWorkItemTaskStep,
  AgentWorkItemTaskStepStatus,
  AgentWorkItemTaskType,
  SubAgentRuntimeStatus,
  SubAgentWorkItem,
  SubAgentWorkItemEvent,
  SubAgentWorkItemEventType,
  TaskWorkItem,
} from './work-item';
export {
  backgroundTaskToWorkItem,
  isSubAgentWorkItem,
  isTaskWorkItem,
  projectBackgroundTaskToWorkItem,
  projectBackgroundTasksToWorkItems,
  projectMediaTaskToBackgroundTask,
  projectMediaTaskToWorkItem,
  projectSubAgentEventToWorkItem,
  toSubAgentWorkItemStatus,
  type ProjectBackgroundTaskWorkItemInput,
  type ProjectBackgroundTasksWorkItemsInput,
  type ProjectMediaTaskWorkItemInput,
} from './work-item-projector';
export {
  AUDIO_GENERATION_TOOLS,
  FILE_TOOLS,
  IMAGE_GENERATION_TOOLS,
  SEARCH_TOOLS,
  SHELL_TOOLS,
  VIDEO_GENERATION_TOOLS,
  getToolSummary,
} from './tool-summary';
export {
  updatePlanStatusInMessages,
  updatePlanStepInMessages,
  type PlanMessageUpdateResult,
  type PlanStepMessageUpdate,
} from './plan-message-updater';
export type {
  AgentMediaModelCategory,
  AgentMediaModelSelections,
  ActiveConversationMessage,
  AgentStoppedMessage,
  AgentPhaseMessage,
  AgentStateSnapshotMessage,
  AmbientCanvasUpdateMessage,
  CompressionErrorMessage,
  CompressionResultMessage,
  ConfigChangedMessage,
  ConfigStateMessage,
  ConfigStateWithStatusMessage,
  ConfirmToolWebviewMessage,
  ConnectionStateChangedMessage,
  ConnectionStatesMessage,
  ContextTokenCountMessage,
  ConversationListMessage,
  ConversationOnlyWebviewMessage,
  DownloadSvgWebviewMessage,
  DragStartWebviewMessage,
  EmptyWebviewMessage,
  ErrorMessage,
  ExecuteSkillWebviewMessage,
  ExtensionToWebviewMessage,
  ExternalMessage,
  FilePathWebviewMessage,
  GlobalErrorMessage,
  GenerationProgressMessage,
  GenerationProgressPayload,
  GenerationProgressStatus,
  HistoryClearedMessage,
  HooksDataMessage,
  InjectContextMessage,
  InvokePluginSlashCommandWebviewMessage,
  InvokeSlashCommandWebviewMessage,
  MarketInstallWebviewMessage,
  MarketErrorMessage,
  MarketFeaturedMessage,
  MarketInstalledListMessage,
  MarketInstallProgressMessage,
  MarketInstallResultMessage,
  MarketSearchWebviewMessage,
  MarketSearchResultMessage,
  MarketUninstallWebviewMessage,
  MarketUninstallResultMessage,
  MarketUpdatesMessage,
  MediaModelCategory,
  MediaTaskCreatedMessage,
  MediaTaskProgressMessage,
  MermaidErrorWebviewMessage,
  McpServerTestResultMessage,
  MessageCancelledMessage,
  MessageQueuedMessage,
  MessageOfType,
  ModelRef,
  OpenFileWebviewMessage,
  OpenUrlWebviewMessage,
  PluginCommandsMessage,
  PluginsAvailable,
  PluginsAvailableMessage,
  PlanActionWebviewMessage,
  PlanStatusUpdateMessage,
  PlanStepActionWebviewMessage,
  PlanStepStatusUpdateMessage,
  PrefillInputMessage,
  PromptModeChangedMessage,
  ProviderMutationResultMessage,
  ProjectFileMentionInfo,
  ProjectFilesWebviewMessage,
  ProjectFilesMessage,
  ProjectMentionExtra,
  ProjectMentionExtraType,
  ProtocolConnectionState,
  ProtocolConnectionStateMap,
  ProtocolConnectionStatus,
  ProtocolModelCategory,
  RuntimeMediaModelSelections,
  SearchProjectFilesWebviewMessage,
  SendMessageWebviewMessage,
  SendToPluginWebviewMessage,
  SetPromptModeWebviewMessage,
  SettingsDataMessage,
  SettingsUpdatedMessage,
  SkillInjectionMessage,
  SkillsDataMessage,
  SkillsListMessage,
  SlashCommandResultMessage,
  SsoLoginWebviewMessage,
  SsoErrorMessage,
  SsoSessionChangedMessage,
  StreamCompleteMessage,
  StreamTextMessage,
  StreamThinkingMessage,
  SubAgentEventMessage,
  TabStateMessage,
  TaskActionWebviewMessage,
  TaskCreatedMessage,
  TaskRemovedMessage,
  TasksUpdatedMessage,
  TaskUpdatedMessage,
  ThinkingMessage,
  ToolSkillsChangedMessage,
  ToolSkillsDataMessage,
  ToolCallMessage,
  ToolConfirmationMessage,
  ToolResultMessage,
  UpdateSettingsWebviewMessage,
  UpdateTabStateWebviewMessage,
  WebviewToExtensionMessage,
} from './webview-protocol';
export {
  buildAmbientCanvasUpdateMessage,
  buildAgentPhaseMessage,
  buildAgentStateSnapshotMessage,
  buildConfigChangedMessage,
  buildAgentStoppedMessage,
  buildConfigStateMessage,
  buildConfigStateWithStatusMessage,
  buildConnectionStateChangedMessage,
  buildConnectionStatesMessage,
  buildErrorMessage,
  buildExternalInputMessage,
  buildHooksDataMessage,
  buildGlobalErrorMessage,
  buildHistoryClearedMessage,
  buildInjectContextMessage,
  buildMediaTaskCreatedMessage,
  buildMediaTaskProgressMessage,
  buildMessageCancelledMessage,
  buildPluginCommandsMessage,
  buildPluginSlashCommandInvocation,
  buildPluginsAvailableMessage,
  buildSkillsDataMessage,
  buildSubAgentEventMessage,
  buildTabStateMessage,
  buildTaskCreatedMessage,
  buildTaskRemovedMessage,
  buildTaskUpdatedMessage,
  buildTasksUpdatedMessage,
  buildThinkingMessage,
  buildToolConfirmationMessage,
  buildToolSkillsDataMessage,
  isSessionMode,
  parseSendMessageWebviewMessage,
  parseWebviewToExtensionMessage,
  projectGenerationProgressMessage,
  WEBVIEW_TO_EXTENSION_MESSAGE_TYPES,
} from './webview-protocol';

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
export type { Plan, PlanStep, PlanStatus } from './plan';

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

// IdcRun — run record carrying IDC stage-activation summaries
export type {
  IdcRunStatus,
  IdcRunRoundSummary,
  IdcRun,
  IdcRunArtifactKind,
  IdcRunArtifactBinding,
} from './idc-run';

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
  TabState,
  TabType,
  PromptMode,
  SessionMode,
  SsoSession,
  SettingsState,
} from './ui';
export {
  EMPTY_TAB_STATE,
  normalizeTabState,
  projectTabStateUpdate,
  resolveActiveTabConversationId,
  type ProjectTabStateUpdateInput,
  type ResolveActiveTabConversationIdInput,
} from './tab-state-projector';
export {
  NEKO_PLUGIN_EXTENSION_IDS,
  type NekoPluginKey,
  type PluginTransferMediaType,
  type PluginTransferCommandPlan,
  type PluginTransferTarget,
  type ProjectPluginsAvailableInput,
} from './plugin-transfer-contract';
