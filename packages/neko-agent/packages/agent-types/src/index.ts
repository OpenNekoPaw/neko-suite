/**
 * @neko-agent/types — Shared type definitions for the neko-agent ecosystem
 *
 * Zero-dependency types package consumed by agent, platform, extension, webview, and cli-tui.
 */

// Message protocol
export type {
  Message,
  MessageContextReference,
  ToolCall,
  ContentBlock,
  ContentBlockType,
  CodeDiff,
  CompositeBlockData,
  CompositeSection,
  CompositeTemplate,
  MediaRef,
} from './message';
export {
  COMPOSITE_CONTENT_FENCE_LANGUAGES,
  extractCompositeContentBlocks,
  parseCompositeContentJson,
  type CompositeContentExtraction,
} from './composite-content-contract';
export type {
  CloseCurrentConversationTabInput,
  CloseCurrentConversationTabProjection,
  SlashCommandResultEffect,
  SlashCommandResultProjection,
  SlashCommandResultProjectionOptions,
} from './command-result-contract';
export {
  NEKO_AGENT_LLM_GENERATE_COMMAND,
  NEKO_AGENT_REGISTER_CAPABILITIES_COMMAND,
  NEKO_AGENT_REGISTER_SLASH_COMMANDS_COMMAND,
  NEKO_AI_ASSISTANT_FOCUS_COMMAND,
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
  ChatWorkspaceModelStateInput,
  ChatWorkspaceModelStateProjection,
  MessageModelProjection,
  MessageModelProjectionInput,
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
  AgentMediaTaskCreativeEntityAction,
  AgentMediaTaskCreativeEntityBindingCandidate,
  AgentMediaTaskCreativeEntityContext,
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
export type {
  AgentWorkflowDefinition,
  AgentWorkflowIdentity,
  AgentLegacyWorkflowAdapterDeprecation,
  AgentLegacyWorkflowAdapterSeverityAfterSunset,
  AgentLegacyWorkflowNodeMapping,
  AgentLegacyWorkflowTelemetry,
  AgentLegacyWorkflowValidationDiagnostic,
  AgentWorkflowNode,
  AgentWorkflowNodeKind,
  AgentWorkflowProjection,
  AgentWorkflowRun,
  AgentWorkflowStageProfile,
  AgentWorkflowStatus,
  AgentWorkflowTransition,
} from './workflow';
export type {
  AgentCapabilityContribution,
  AgentCapabilityContributionIdentity,
  AgentCapabilityContributionKind,
  AgentCapabilityDiagnostic,
  AgentCapabilityDiagnosticPhase,
  AgentCapabilityInjectionContext,
  AgentCapabilityPermissionMode,
  AgentCapabilityPermissionRequirement,
  AgentCapabilityRegistryProjection,
  AgentCapabilitySlashCommandContribution,
  AgentCapabilitySource,
  AgentCapabilityTelemetryEvent,
  AgentCapabilityTelemetryEventKind,
  AgentCapabilityTelemetryReason,
  AgentCapabilityTelemetrySnapshot,
  AgentCapabilityWorkflowNodeRequirement,
  AgentCapabilityWorkflowFragmentContribution,
  AgentArtifactExecutionCapabilityContribution,
  AgentArtifactFacetsContribution,
  AgentEntityMemoryContributorFacetContribution,
  AgentEntityProviderFacetContribution,
  AgentMediaTextExtractorFacetContribution,
  AgentPerceptionCapabilityCachePolicy,
  AgentPerceptionCapabilityConfidenceKind,
  AgentPerceptionCapabilityDeviceTier,
  AgentPerceptionCapabilityExecutionMode,
  AgentPerceptionCapabilityFacetContribution,
  AgentPerceptionCapabilityMediaKind,
  AgentPerceptionCapabilitySource,
  AgentPerceptionCapabilityTask,
  AgentPerceptionProviderFacetContribution,
  AgentRepresentationResolverFacetContribution,
  AgentReviewSurfaceFacetContribution,
  AgentSemanticFacetAvailability,
  AgentSemanticFacetActionAvailability,
  AgentSemanticIndexProviderFacetContribution,
  AgentInjectedCapabilitySet,
} from './capability';
export type {
  GeneratedPromptBundle,
  GeneratedPromptSection,
  GeneratedSchemaBundle,
  GeneratedSchemaPurpose,
  GeneratedStructuredSchema,
  PromptGenerationContext,
  PromptGenerationProviderCapabilities,
  PromptGenerationWorkflowContext,
  PromptSchemaProviderToolMode,
  PromptSchemaStructuredOutputMode,
} from './prompt-schema';
export type {
  AgentGeneratedArtifactProjection,
  AgentMediaMetadata,
  AgentMediaModality,
  AgentMediaPayload,
  AgentMediaPayloadRequest,
  AgentMultimodalEvidenceRef,
  AgentMultimodalEvidenceFeedback,
  AgentMultimodalEvidenceFeedbackPolicy,
  AgentMultimodalEvidenceWithheldReason,
  AgentMultimodalHostAdapter,
  AgentMultimodalPacketLinkage,
  AgentToolModalityDeclaration,
} from './multimodal-tooling';
export type {
  AgentArtifactTransferPayload,
  ArtifactBackfillTransferPayload,
  ArtifactBlockPageTransferPayload,
  ArtifactExecutionSummaryTransferPayload,
  ArtifactSnapshotTransferPayload,
} from './artifact-transfer';
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
  AgentPhaseMessage,
  AgentStateSnapshotMessage,
  AmbientCanvasUpdateMessage,
  CompressionErrorMessage,
  CompressionResultMessage,
  ConfigChangedMessage,
  ConfigStateMessage,
  ConfirmToolWebviewMessage,
  ContextTokenCountMessage,
  ConversationListMessage,
  ConversationOnlyWebviewMessage,
  DownloadSvgWebviewMessage,
  DragStartWebviewMessage,
  EmptyWebviewMessage,
  ErrorMessage,
  ExtensionToWebviewMessage,
  ExternalMessage,
  FilePathWebviewMessage,
  GlobalErrorMessage,
  HistoryClearedMessage,
  InjectContextMessage,
  InvokePluginSlashCommandWebviewMessage,
  InvokeSlashCommandWebviewMessage,
  ExitCharacterDialogueSessionWebviewMessage,
  ExitEmbodyCharacterSessionWebviewMessage,
  MediaModelCategory,
  MediaTaskCreatedMessage,
  MediaTaskProgressMessage,
  MermaidErrorWebviewMessage,
  MessageCancelledMessage,
  MessageQueuedMessage,
  MessageOfType,
  ModelRef,
  CharacterDialogueSessionExitedMessage,
  CharacterDialogueSessionStartedMessage,
  EmbodyCharacterSessionExitedMessage,
  EmbodyCharacterSessionStartedMessage,
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
  ProjectMentionMediaType,
  ProjectMentionSource,
  ProtocolModelCategory,
  RuntimeMediaModelSelections,
  SearchProjectFilesWebviewMessage,
  SendMessageWebviewMessage,
  SendToPluginWebviewMessage,
  SetPromptModeWebviewMessage,
  RevealDocumentLocatorWebviewMessage,
  SettingsDataMessage,
  SettingsUpdatedMessage,
  SkillInjectionMessage,
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
  ToolCallMessage,
  ToolConfirmationMessage,
  ToolResultBackfillMessage,
  ToolResultMessage,
  UpdateSettingsWebviewMessage,
  UpdateTabStateWebviewMessage,
  WebviewToExtensionMessage,
  WorkflowProjectionMessage,
} from './webview-protocol';
export {
  buildAmbientCanvasUpdateMessage,
  buildAgentPhaseMessage,
  buildAgentStateSnapshotMessage,
  buildConfigChangedMessage,
  buildConfigStateMessage,
  buildErrorMessage,
  buildExternalInputMessage,
  buildGlobalErrorMessage,
  buildHistoryClearedMessage,
  buildInjectContextMessage,
  buildMediaTaskCreatedMessage,
  buildMediaTaskProgressMessage,
  buildMessageCancelledMessage,
  buildCharacterDialogueSessionExitedMessage,
  buildCharacterDialogueSessionStartedMessage,
  buildEmbodyCharacterSessionExitedMessage,
  buildEmbodyCharacterSessionStartedMessage,
  buildPluginCommandsMessage,
  buildPluginSlashCommandInvocation,
  buildPluginsAvailableMessage,
  buildSubAgentEventMessage,
  buildStreamCompleteMessage,
  buildStreamTextMessage,
  buildTabStateMessage,
  buildTaskCreatedMessage,
  buildTaskRemovedMessage,
  buildTaskUpdatedMessage,
  buildTasksUpdatedMessage,
  buildThinkingMessage,
  buildToolConfirmationMessage,
  buildWorkflowProjectionMessage,
  isSessionMode,
  parseSendMessageWebviewMessage,
  parseWebviewToExtensionMessage,
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
  ConversationKind,
  CharacterDialogueSessionProjection,
  EmbodyCharacterSessionProjection,
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
  type PluginTransferAssetRef,
  type PluginTransferCanvasImportAssetPayload,
  type PluginTransferCanvasAgentContentPayload,
  type PluginTransferCommand,
  type PluginTransferCommandPayload,
  type PluginTransferCommandPlanMap,
  type PluginTransferContentFormat,
  type PluginTransferCutImportGeneratedClipPayload,
  type PluginTransferCutStoryboardPayload,
  type PluginTransferCutStoryboardShot,
  type PluginTransferCutStoryboardShotBase,
  type PluginTransferMediaType,
  type PluginTransferPathImportAssetPayload,
  type PluginTransferProvenance,
  type PluginTransferCommandPlan,
  type PluginTransferPayload,
  type PluginTransferTargetMode,
  type PluginTransferTargetRef,
  type PluginTransferTarget,
  type ProjectPluginsAvailableInput,
} from './plugin-transfer-contract';
