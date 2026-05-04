/**
 * Runtime layering guide:
 *
 * - Host bindings: translate VSCode/CLI/platform adapters into runtime session
 *   factory config (`runtime-host-bindings`).
 * - Session projection: merge unified runtime planes into AgentSessionConfig
 *   (`session-config-projection`).
 * - Session factory: create/update one AgentSession and its owned registries.
 * - Runner: execute one configured session with confirmation/subagent events.
 * - Controller: refresh a host-owned session target without leaking factory
 *   details to the extension.
 * - Pool/Manager: own multi-conversation lifecycle, eviction, and compression.
 */
export type {
  AgentRuntimeConfig,
  ArtifactWatcherFactory,
  ArtifactWatcherRuntimeConfig,
  IWorkflowRuntime,
  IArtifactStore,
  ICapabilityRuntime,
  IFeedbackLoop,
  IRuntimeJournalWriter,
  IRuntimeWorkspaceFsOps,
} from './types';

export {
  buildAgentSessionConfigWithRuntime,
  createAgentSessionWithRuntime,
  type AgentSessionRuntimeBootstrapConfig,
} from './session-config-projection';

export {
  createWorkspaceArtifactService,
  toIdcRunArtifactBinding,
  type AnyArtifactObservedInput,
  type AnyArtifactRecord,
  type ArtifactObservedInput,
  type ArtifactBinding,
  type ArtifactRecord,
  type ArtifactServiceConfig,
  type ArtifactServiceFsOps,
  type ArtifactWriteInput,
  type IArtifactService,
} from './artifact-service';

export {
  createNodeArtifactStore,
  createNodeRuntimeWorkspaceFsOps,
  type NodeArtifactStoreConfig,
} from './node-artifact-store';

export {
  AgentObservationRecorder,
  createAgentObservationRecorder,
  type AgentObservationRecorderConfig,
  type IAgentObservationRecorder,
} from './agent-observation-recorder';

export {
  buildAgentRuntimeStateSnapshotMessage,
  createAgentStateRuntime,
  type AgentStateRuntime,
  type AgentStateRuntimeEntry,
  type UpdateAgentStateRuntimeInput,
} from './agent-state-runtime';

export {
  AgentRuntimePool,
  type AgentRuntimePoolOptions,
  type AgentRuntimePoolPressureEvent,
  type ManagedAgentRuntime,
} from './agent-runtime-pool';

export {
  createAgentRuntimeManager,
  type AgentRuntimeCompressionResult,
  type AgentRuntimeManager,
  type AgentRuntimeManagerAgent,
  type AgentRuntimeManagerCreateAgentInput,
  type AgentRuntimeManagerDisposable,
  type AgentRuntimeManagerEvent,
  type AgentRuntimeManagerLogger,
  type AgentRuntimeManagerOptions,
} from './agent-runtime-manager';

export {
  createAgentRunnerEventEmitter,
  type AgentRunnerEventEmitter,
  type AgentRunnerConfirmationRequest,
  type AgentRunnerEventSource,
  type AgentRunnerPort,
  type AgentRunnerPortEvent,
  type DisposableLike,
} from './agent-runner-port';

export {
  AgentSessionRunner,
  DEFAULT_AGENT_SESSION_CONFIRMATION_TIMEOUT_MS,
  createAgentSessionRunner,
  type CreateAgentSessionRunnerOptions,
  type AgentSessionRunnerConfirmation,
  type AgentSessionRunnerOptions,
  type AgentSessionRunnerTimer,
} from './agent-session-runner';

export {
  buildAgentRuntimeSessionFactoryConfig,
  type AgentRuntimeHookSource,
  type AgentRuntimeHostBindings,
  type AgentRuntimeSessionAssemblyInput,
} from './runtime-host-bindings';

export {
  createAgentRuntimeSessionController,
  type AgentRuntimeSessionController,
  type AgentRuntimeSessionControllerTarget,
} from './agent-runtime-session-controller';

export {
  IDC_WORKFLOW_DEFINITION_ID,
  buildWorkflowIdentity,
  createAgentWorkflowRuntime,
  createIdcWorkflowDefinition,
  createLegacyWorkflowUsageRecorder,
  selectIdcWorkflowEntryNode,
  type AgentWorkflowRuntime,
  type AgentWorkflowRuntimeOptions,
  type AgentLegacyWorkflowAdapterUsageInput,
  type AgentLegacyWorkflowSunsetPolicy,
  type AgentLegacyWorkflowUsageRecorder,
  type CreateAgentWorkflowRunInput,
} from './agent-workflow-runtime';

export {
  createAgentCapabilityRuntimeRegistries,
  type AgentCapabilityRuntimeRegistries,
} from './capability-runtime-registries';

export {
  createAgentCapabilityInjectionRuntime,
  normalizeManifestCapability,
  normalizeSkillScanCapabilities,
  normalizeSkillCapability,
  validateCapabilityContribution,
  type AgentCapabilityInjectionRuntime,
  type NormalizeSkillScanGroupInput,
  type NormalizeSkillScanInput,
  type NormalizeSkillCapabilityInput,
} from './agent-capability-injection-runtime';

export {
  createAgentPromptSchemaGenerator,
  type AgentPromptSchemaGenerator,
} from './agent-prompt-schema-generator';

export {
  createCapabilityRuntimeBindingStore,
  mergeCapabilityRuntimeBindings,
  type CapabilityRuntimeBindingLogger,
  type CapabilityRuntimeBindingStore,
  type CapabilityRuntimeBindings,
} from './capability-runtime-bindings';

export {
  createCapabilityRuntimeRefreshRuntime,
  type CapabilityRuntimeRefreshLogger,
  type CapabilityRuntimeRefreshOptions,
  type CapabilityRuntimeRefreshResult,
  type CapabilityRuntimeRefreshRuntime,
} from './capability-runtime-refresh';

export {
  NEKO_AUTH_EXTENSION_ID,
  SKILL_ENABLED_STATE_STORAGE_KEY,
  TOOL_SKILL_ENABLED_STATE_STORAGE_KEY,
  buildConfigBridgeGlobalErrorMessage,
  buildConfigBridgeSsoSessionChangedMessage,
  buildConfigChangedRuntimeMessage,
  createEnabledStateRuntimeStore,
  createHookConfigSyncRuntime,
  createSkillConfigSyncRuntime,
  createToolSkillConfigSyncRuntime,
  runConfigBridgeQueryRuntime,
  runConfigBridgeSsoLoginRuntime,
  runConfigBridgeSsoLogoutRuntime,
  type ConfigBridgeRuntimeLogger,
  type ConfigBridgeQueryConfigState,
  type ConfigBridgeQueryMessage,
  type ConfigBridgeQueryRequest,
  type ConfigBridgeQueryRuntimeDeps,
  type ConfigBridgeQueryRuntimeResult,
  type EnabledStateRuntimeStorage,
  type EnabledStateRuntimeStore,
  type EnabledStateRuntimeStoreOptions,
  type HookConfigSyncRuntime,
  type HookConfigSyncRuntimeOptions,
  type SkillConfigSyncRuntime,
  type SkillConfigSyncRuntimeOptions,
  type SkillConfigSyncState,
  type ToolSkillConfigSyncRuntime,
  type ToolSkillConfigSyncRuntimeOptions,
} from './config-bridge-runtime';

export {
  createAgentRuntimeSession,
  resolveAgentRuntimePromptFragments,
  unregisterAgentRuntimeSession,
  updateAgentRuntimeSession,
  type AgentRuntimeSessionFactoryConfig,
  type AgentRuntimeSessionFactoryLogger,
  type AgentRuntimeSessionHandle,
  type AgentRuntimeSessionUpdate,
  type AgentRuntimeSessionUpdateConfig,
} from './agent-session-factory';

export {
  SubAgentRuntimeCoordinator,
  type AgentSubAgentRuntimeRegistration,
  type AgentSubAgentSystemConfig,
} from './subagent-runtime';

export {
  createSubAgentEventRuntime,
  type ProjectSubAgentEventForConversationInput,
  type SubAgentEventRuntime,
} from './subagent-event-runtime';

export {
  createWorkspaceInputProcessorRuntime,
  type WorkspaceInputProcessorRuntime,
  type WorkspaceInputProcessorRuntimeOptions,
} from './workspace-input-processor-runtime';

export {
  createTimelineContextRuntime,
  type BuildTimelineContextPacketInput,
  type TimelineContextEditorLike,
  type TimelineContextRuntime,
  type TimelineContextRuntimeOptions,
} from './timeline-context-runtime';

export {
  buildAgentTurnForWebviewRuntimeInput,
  createAgentTurnHostContextAdapters,
  type AgentTurnActiveSkillState,
  type AgentTurnAssemblyInput,
  type AgentTurnContextHostAdapters,
  type AgentTurnContextHostOptions,
  type AgentTurnConversationHost,
  type AgentTurnHostAdapters,
  type AgentTurnProviderHost,
  type AgentTurnRuntimeServices,
  type AgentTurnSettingsSource,
} from './agent-turn-assembly';

export {
  AGENT_TURN_FALLBACK_MESSAGE,
  executeAgentTurn,
  getAgentTurnFallbackMessage,
  runAgentTurnForWebviewRuntime,
  type AgentTurnForWebviewRuntimeMessage,
  type AgentTurnAgentManager,
  type AgentTurnConfirmationRequest,
  type AgentTurnContextFactoryInput,
  type AgentTurnConversationStore,
  type AgentTurnDisposable,
  type AgentTurnExecutionResult,
  type AgentTurnFallbackReason,
  type AgentTurnProviderSource,
  type AgentTurnRunner,
  type AgentTurnRunnerConfigureInput,
  type AgentTurnRuntimeSettings,
  type AgentTurnStreamProcessorInput,
  type AgentTurnTimelineContextInput,
  type ExecuteAgentTurnInput,
  type RunAgentTurnForWebviewRuntimeInput,
  type RunAgentTurnForWebviewRuntimeResult,
} from './agent-turn-runtime';

export {
  createAgentTurnContext,
  inferAgentTurnProjectType,
  type AgentTurnActiveEditorLike,
  type AgentTurnContext,
  type AgentTurnContextInput,
  type AgentTurnProjectType,
} from './agent-turn-context';

export {
  buildAgentSessionExecutionContext,
  createAgentParentAgentId,
  type AgentExecutionContextSource,
  type BuildAgentSessionExecutionContextInput,
} from './agent-execution-context';

export {
  buildAgentExecutionMetadata,
  buildAgentAssistantMessageFromStream,
  buildAgentHistoryHydrationPlan,
  buildAgentProjectFileSearchPlan,
  buildAgentTurnConfigurationPlan,
  buildAgentTurnContextPatch,
  buildAgentTurnRuntimePlan,
  buildAgentTurnExecutionMetadata,
  buildProviderExpressionTargets,
  buildRuntimeMediaModelSelections,
  buildEnhancedAgentMessage,
  createAgentMessageId,
  executeAgentProjectFileSearch,
  runAgentMessageTurnRuntime,
  projectAgentFileMentions,
  projectAgentMentionExtras,
  projectAgentProjectFilesMessage,
  mergeReferencedMediaImageAttachments,
  prepareAgentMessageDispatch,
  prepareAgentMessageFileReferences,
  appendAmbientCanvasSystemPrompt,
  summarizeAgentEventProgress,
  selectAgentTurnProvider,
  shouldHydrateAgentHistory,
  shouldPersistAgentAssistantStream,
  getAgentHistoryToHydrate,
  type AgentAmbientCanvasNode,
  type AgentExecutionMetadataInput,
  type AgentHistoryHydrationPlan,
  type AgentHistoryHydrationPlanInput,
  type AgentStreamPersistenceSnapshot,
  type BuildAgentAssistantMessageInput,
  type AgentMessageFileReferenceProcessor,
  type AgentProviderCandidate,
  type AgentProjectFileCandidate,
  type AgentProjectFileSearchPlan,
  type AgentProjectFileSearchPlanInput,
  type AgentProjectFilesProjectionInput,
  type AgentProcessedReferencedMedia,
  type AgentReferencedMediaProcessor,
  type AgentReferencedFileContent,
  type AgentMessageDispatchRoute,
  type AgentMessageExecutionOverrides,
  type AgentMessageIdOptions,
  type AgentMessageRuntimeRequest,
  type AgentMessageTurnAgentExecutionInput,
  type AgentMessageTurnFallbackReason,
  type AgentMessageTurnMediaExecutionInput,
  type AgentMessageTurnRuntimeMessage,
  type AgentTurnConfigurationPlan,
  type AgentTurnConfigurationPlanInput,
  type AgentTurnContextPatch,
  type AgentTurnContextPatchInput,
  type AgentTurnProviderSelection,
  type AgentTurnProviderSelectionInput,
  type AgentTurnRuntimePlan,
  type AgentTurnRuntimePlanInput,
  type BuildEnhancedAgentMessageInput,
  type ExecuteAgentProjectFileSearchInput,
  type MergeReferencedMediaImageAttachmentsInput,
  type PreparedAgentMessageDispatch,
  type PreparedAgentMessageFileReferences,
  type PrepareAgentMessageDispatchInput,
  type PrepareAgentMessageFileReferencesInput,
  type ProviderExpressionTargetConfig,
  type RunAgentMessageTurnRuntimeInput,
  type RunAgentMessageTurnRuntimeResult,
} from './message-runtime';

export {
  AGENT_DOCUMENT_CONTEXT_INTENTS,
  AGENT_RETRY_CREATION_MESSAGE,
  buildAgentCreationMessage,
  buildAgentFileContextPayload,
  buildAgentPromptCommandMessage,
  buildAgentRetryCreationMessage,
  buildAgentScriptCommandMessage,
  createAgentFileContextPayloadId,
  getAgentCreationQuickStartOptions,
  inferAgentCreationIntentFromFilePath,
  inferAgentFileContextType,
  type AgentCreationQuickStartOption,
  type AgentPromptCommandKind,
  type AgentScriptCommandKind,
  type BuildAgentCreationMessageInput,
  type BuildAgentFileContextPayloadInput,
  type BuildAgentPromptCommandMessageInput,
  type BuildAgentScriptCommandMessageInput,
} from './agent-entry-intent-runtime';

export {
  isLocalMediaFilePath,
  projectMessageForResourceDisplay,
  projectMessagesForResourceDisplay,
  projectResourceValue,
  updateBackgroundTaskToolResultUrls,
  type MessageResourceUpdateResult,
  type MessageResourceProjectionOptions,
} from './message-resource-projector';

export {
  applyAgentStreamEventToState,
  createAgentStreamMessageId,
  createAgentStreamProjectionState,
  finalizeAgentStreamProjectionState,
  projectAgentStreamEventToWebviewMessages,
  type AgentStreamProjectionState,
  type AgentStreamMessageIdOptions,
  type AgentStreamStateOptions,
  type AgentStreamStateUpdate,
  type AgentStreamWebviewMessage,
  type CollectedToolCall,
  type ProjectAgentStreamEventToWebviewMessagesInput,
} from './agent-stream-state';

export {
  AgentEventStreamRuntimeProcessor,
  type AgentEventStreamRuntimeBackgroundTasks,
  type AgentEventStreamRuntimeMessage,
  type ProcessAgentEventStreamRuntimeInput,
} from './agent-event-stream-runtime';

export {
  persistAgentStreamBackgroundTaskResultUrls,
  projectAgentStreamBackgroundTaskProgress,
  projectAgentStreamBackgroundTaskStart,
  type AgentStreamBackgroundTaskProgressInput,
  type AgentStreamBackgroundTaskProgressProjection,
  type AgentStreamBackgroundTaskStartInput,
  type AgentStreamBackgroundTaskStartProjection,
  type PersistAgentStreamBackgroundTaskResultUrlsInput,
} from './agent-stream-background-task';

export {
  startAgentStreamBackgroundTaskObserver,
  type AgentStreamBackgroundTaskDeliveryContext,
  type AgentStreamBackgroundTaskIgnoredEvent,
  type AgentStreamBackgroundTaskObservedProgress,
  type AgentStreamBackgroundTaskProgressErrorEvent,
  type AgentStreamBackgroundTaskProgressEvent,
  type ObserveAgentStreamBackgroundTaskProgressInput,
  type StartAgentStreamBackgroundTaskObserverInput,
  type StartAgentStreamBackgroundTaskObserverResult,
} from './agent-stream-task-observer';

export {
  runAgentMediaTurnForWebview,
  type AgentMediaTurnExecutionInput,
  type AgentMediaTurnIgnoredTaskEvent,
  type AgentMediaTurnProgressErrorEvent,
  type AgentMediaTurnRuntimeMessage,
  type AgentMediaTurnTaskEvent,
  type RunAgentMediaTurnForWebviewInput,
  type RunAgentMediaTurnForWebviewResult,
} from './media-turn-webview-runtime';

export {
  buildActiveConversationMessage,
  buildConversationListMessage,
  type ActiveConversationMessage,
  type ActiveConversationView,
  type ConversationListItemView,
  type ConversationListMessage,
  type ConversationViewSource,
} from './conversation-webview-presenter';

export {
  buildChatAmbientCanvasUpdateMessage,
  buildChatContextInjectionMessage,
  buildChatExternalInputMessage,
  buildChatPluginCommandsMessage,
  buildChatRestorePlan,
  buildChatTabStateMessage,
  buildInvalidWebviewPayloadMessage,
  syncActiveConversationFromTabState,
  updateTabStateRuntime,
  type BuildChatRestorePlanInput,
  type ChatRestorePlan,
  type ChatRestorePlanAction,
  type ConversationTabRuntimeEffects,
  type ConversationTabSyncReason,
  type ConversationTabSyncResult,
  type SyncActiveConversationFromTabStateInput,
  type UpdateTabStateRuntimeInput,
  type UpdateTabStateRuntimeResult,
} from './conversation-tab-runtime';

export {
  resolveRequiredConversationRoute,
  type ResolveRequiredConversationRouteInput,
  type ResolveRequiredConversationRouteResult,
} from './conversation-route-runtime';

export {
  buildCompressionErrorMessage,
  buildCompressionResultMessage,
  buildContextTokenCountMessage,
  type CompressionErrorMessage,
  type CompressionResultData,
  type CompressionResultMessage,
  type ContextTokenCountMessage,
  type ContextWebviewMessage,
} from './context-webview-presenter';

export {
  compressAgentContext,
  sendAgentContextTokenCount,
  type AgentContextControlAction,
  type AgentContextControlBaseInput,
  type AgentContextControlResult,
  type CompressAgentContextInput,
  type SendAgentContextTokenCountInput,
} from './context-control-runtime';

export {
  buildRuntimePluginSlashCommandDispatch,
  buildRuntimePluginTransferPlan,
  buildRuntimePluginsAvailableMessage,
  createRuntimePluginSlashCommandRegistry,
  type BuildPluginTransferPlanInput,
  type PluginSlashCommandDef,
  type RegisteredPluginSlashCommand,
  type RuntimePluginSlashCommandDispatch,
  type RuntimePluginSlashCommandRegistry,
} from './plugin-transfer-runtime';

export {
  extractFileReferencePaths,
  formatFileAttachmentContent,
  formatMediaAttachmentReference,
  formatUnreadableFileAttachment,
  parseBase64DataUrl,
  projectAgentMessageAttachments,
  type AgentAttachmentProjectionDeps,
  type AgentAttachmentProjectionError,
  type AgentBase64ImageAttachment,
  type AgentProcessedAttachments,
} from './attachment-projection';

export {
  buildTurnMultimodalContextPacket,
  combineMultimodalContextPackets,
  applyEvidenceFeedbackPolicy,
  createCanvasSelectionContextPacket,
  createMediaAttachmentContextPacket,
  createTextContextPacket,
  createTimelineContextPacketFromEditor,
  createTimelineSelectionContextPacket,
  createToolProducedMultimodalEvidenceFeedback,
  filterToolsByModalityAvailability,
  loadPacketMediaPayloads,
  projectGeneratedArtifactReference,
  summarizeEvidenceFeedback,
  type BuildTurnMultimodalContextPacketInput,
  type CanvasSelectionContextNode,
  type CanvasSelectionContextOptions,
  type CombineMultimodalContextPacketsOptions,
  type MediaAttachmentContextInput,
  type TextContextInput,
  type TimelineEditorContextInput,
  type TimelineSelectionContextElement,
  type TimelineSelectionContextOptions,
  type ToolProducedMultimodalEvidenceInput,
} from './multimodal-context-packet';

export {
  resolveTimelinePerceptionInputs,
  resolveTimelineVideoFrameInputs,
  type AudioSegmentExtractionClient,
  type FrameExtractionClient,
  type ImageCaptureClient,
  type PerceptionInputResolverFsOps,
  type ResolvePerceptionInputsOptions,
  type TimelinePerceptionInputClient,
} from './perception-input-resolver';

export {
  createCanvasNodeUpdateAdapter,
  createDefaultOperationToolAdapterRegistry,
  createModelElementUpdateAdapter,
  createTimelineElementUpdateAdapter,
  type CanvasNodeUpdateAdapterOptions,
  type DefaultOperationToolAdapterRegistryOptions,
  type ModelElementUpdateAdapterOptions,
  type TimelineElementUpdateAdapterOptions,
} from './operation-adapters';

export {
  CapabilityRegistryRuntime,
  type CapabilityDiscoveryDeps,
  type CapabilityProtocolInfo,
  type CapabilityRegistryRuntimeDeps,
  type CapabilityRegistryRuntimeLogger,
} from './capability-registry-runtime';

export {
  CanvasGenerationRuntime,
  buildCanvasMediaOutputDataUrl,
  buildCanvasGenerationPrompt,
  buildCanvasImageGenerationRequest,
  buildCanvasShotPromptMessages,
  buildCanvasShotPromptUserContent,
  convertCanvasFileUrlToPath,
  extractCanvasPromptText,
  inferCanvasImageMimeType,
  isCanvasLocalFilePath,
  normalizeCanvasControlMode,
  normalizeCanvasGenerationCount,
  normalizeCanvasIpAdapterMode,
  normalizeCanvasIpAdapterReferences,
  parseCanvasImageDataUrl,
  parseCanvasReferenceRef,
  planCanvasImageSource,
  resolveCanvasIpAdapterReferences,
  selectCanvasReferenceImageSource,
  type CanvasControlMode,
  type CanvasGenerationInput,
  type CanvasGenerationProgress,
  type CanvasGenerationResult,
  type CanvasGenerationRuntimeDeps,
  type CanvasGenerationRuntimeLogger,
  type CanvasGenerationStatus,
  type CanvasImageGenerationRequest,
  type CanvasImageResolveResult,
  type CanvasImageSourcePlan,
  type CanvasIpAdapterReference,
  type CanvasIpAdapterReferenceInput,
  type CanvasMediaOutput,
  type CanvasMediaService,
  type CanvasMediaTask,
  type CanvasPromptLLM,
  type CanvasPromptMessage,
  type CanvasPromptRole,
  type CanvasReferenceNode,
  type CanvasShotPromptData,
} from './canvas-generation-runtime';

export {
  CanvasAmbientContextRuntime,
  DEFAULT_CANVAS_AMBIENT_SCOPE_ID,
  projectCanvasAssetChangeSummary,
  projectCanvasChangeSummary,
  readCanvasNodeAssetKind,
  readCanvasNodeAssetUri,
  summarizeCanvasNode,
  type CanvasAssetChangeInput,
  type CanvasAmbientContextRuntimeOptions,
  type CanvasAmbientContextScopeState,
  type CanvasChangeInput,
  type CanvasChangeSummary,
  type SelectedNodeSummary,
} from './canvas-ambient-context-runtime';
