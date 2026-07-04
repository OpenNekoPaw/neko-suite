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
  ICreationGuidanceRuntime,
  IArtifactStore,
  ICapabilityRuntime,
  IFeedbackLoop,
  IRuntimeJournalWriter,
  IRuntimeWorkspaceFsOps,
} from './types';

export {
  createAgentContentAccessDiagnostic,
  createAgentContentAccessFailureResult,
  isAgentContentAccessReady,
  toAgentContentAccessDiagnostics,
  type AgentContentAccessRuntime,
  type AgentContentAccessRuntimeRequest,
  type AgentContentAccessCaller,
  type AgentContentAccessDiagnostic,
  type AgentContentAccessDiagnosticCode,
  type AgentContentAccessBaseInput,
  type AgentContentAccessOperationResult,
  type AgentDocumentContentInput,
  type AgentDocumentContentResult,
  type AgentImageMetadataInput,
  type AgentImageMetadataResult,
  type AgentProviderAssetInput,
  type AgentProviderAssetResult,
  type AgentResourceProjectionInput,
  type AgentResourceProjectionResult,
} from './agent-content-access-runtime';

export {
  buildAgentSessionConfigWithRuntime,
  createAgentSessionWithRuntime,
  type AgentSessionRuntimeBootstrapConfig,
} from './session-config-projection';

export {
  createWorkspaceArtifactService,
  toArtifactScopeBinding,
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
  AgentPendingMessageQueueError,
  createAgentRunnerEventEmitter,
  type AgentPendingMessageItem,
  type AgentPendingMessageQueueErrorCode,
  type AgentRunnerEventEmitter,
  type AgentRunnerConfirmationRequest,
  type AgentRunnerEventSource,
  type AgentRunnerPort,
  type AgentRunnerPortEvent,
  type EnqueuePendingMessageInput,
  type DisposableLike,
} from './agent-runner-port';

export {
  AgentSessionRunner,
  AGENT_SESSION_BUSY_MESSAGE,
  AGENT_SESSION_CONFIG_LOCKED_MESSAGE,
  DEFAULT_AGENT_SESSION_CONFIRMATION_TIMEOUT_MS,
  createAgentSessionRunner,
  type CreateAgentSessionRunnerOptions,
  type AgentSessionRunnerConfirmation,
  type AgentSessionRunnerOptions,
  type AgentSessionRunnerTimer,
} from './agent-session-runner';

export {
  buildAgentRuntimeSessionFactoryConfig,
  type AgentRuntimeHostBindings,
  type AgentRuntimeSessionAssemblyInput,
} from './runtime-host-bindings';

export {
  createAgentRuntimeSessionController,
  type AgentRuntimeSessionController,
  type AgentRuntimeSessionControllerTarget,
} from './agent-runtime-session-controller';

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
  type AgentCapabilityInjectionRuntimeOptions,
  type AgentCapabilityInjectionRuntimeRetentionOptions,
  type NormalizeSkillScanGroupInput,
  type NormalizeSkillScanInput,
  type NormalizeSkillCapabilityInput,
} from './agent-capability-injection-runtime';

export {
  AgentCapabilityLifecycleRuntimeError,
  createAgentCapabilityLifecycleRuntime,
  toAgentCapabilityToolResult,
  type AgentCapabilityLifecycleHandler,
  type AgentCapabilityLifecycleHandlerContext,
  type AgentCapabilityLifecycleRuntime,
} from './agent-capability-lifecycle-runtime';

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
  createDeveloperModeTemporaryProcessorRequest,
  createAgentExternalProcessorRuntime,
  type AgentExternalProcessorRuntime,
  type AgentExternalProcessorRuntimeOptions,
  type AgentExternalProcessorPlanInput,
  type AgentExternalProcessorPlanResult,
  type AgentExternalProcessorReadyPlan,
  type AgentExternalProcessorBlockedPlan,
  type AgentExternalProcessorResultInput,
  type AgentExternalProcessorResultProjection,
  type AgentExternalProcessorChainApprovalContinuationInput,
  type AgentExternalProcessorChainRun,
  type AgentExternalProcessorChainStageInput,
  type AgentExternalProcessorChainStagePlanResult,
  type AgentExternalProcessorChainStageRecord,
  type AgentExternalProcessorChainStartInput,
  type AgentExternalProcessorChainTargetChangeInput,
  type DeveloperModeTemporaryProcessorRequest,
  type DeveloperModeTemporaryProcessorRequestInput,
} from './external-processor-runtime';

export {
  createTimelineContextRuntime,
  type BuildTimelineContextPacketInput,
  type TimelineContextEditorLike,
  type TimelineContextRuntime,
  type TimelineContextRuntimeOptions,
} from './timeline-context-runtime';

export {
  buildAgentTurnRuntimeInput,
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
  AGENT_TURN_PRECONDITION_MESSAGE,
  executeAgentTurn,
  getAgentTurnPreconditionMessage,
  runAgentTurnRuntime,
  type AgentTurnHostMessage,
  type AgentTurnAgentManager,
  type AgentTurnConfirmationRequest,
  type AgentTurnContextFactoryInput,
  type AgentTurnConversationStore,
  type AgentTurnDisposable,
  type AgentTurnExecutionResult,
  type AgentTurnPreconditionReason,
  type AgentTurnProviderSource,
  type AgentTurnRunner,
  type AgentTurnRunnerConfigureInput,
  type AgentTurnRuntimeSettings,
  type AgentTurnStreamProcessorInput,
  type AgentTurnTimelineContextInput,
  type ExecuteAgentTurnInput,
  type RunAgentTurnRuntimeInput,
  type RunAgentTurnRuntimeResult,
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
  CHARACTER_DIALOGUE_DEFAULT_CONFIG,
  CharacterDialogueSession,
  buildCharacterDialogueTurnSystemPrompt,
  projectCharacterDialogueTranscriptToChatMessages,
  type CharacterDialogueResponder,
  type CharacterDialogueResponderInput,
  type CharacterDialogueResponderResult,
  type CharacterDialogueSendUserMessageOptions,
  type CharacterDialogueSessionConfig,
  type CharacterDialogueSessionOptions,
  type CharacterDialogueSessionSnapshot,
  type CharacterDialogueTurn,
} from './character-dialogue-session';

export {
  CharacterDialogueRuntimeService,
  appendCharacterDialogueUserSupplement,
  createCharacterDialogueRuntimeService,
  createDefaultCharacterDialogueSessionId,
  createFallbackCharacterDialogueEvaluationReport,
  defaultCharacterDialogueEnrichmentForSource,
  evaluateCharacterDialogueTranscript,
  type CharacterDialogueTranscriptEvaluatorOptions,
  type CharacterDialogueEvaluationInput,
  type CharacterDialogueHeadlessProbeInput,
  type CharacterDialogueManualSupplementInput,
  type CharacterDialogueProfileEnrichmentInput,
  type CharacterDialogueProfileEnrichmentResult,
  type CharacterDialogueProfilePreparationInput,
  type CharacterDialogueProfilePreparationResult,
  type CharacterDialogueRuntimeLogger,
  type CharacterDialogueRuntimePorts,
  type CharacterDialogueRuntimeServiceOptions,
  type CharacterDialogueSavePolicyInput,
  type CharacterDialogueSessionExitReason,
  type CharacterDialogueSuggestionApplyConfirmationInput,
  type CharacterDialogueSuggestionApplyInput,
  type CharacterDialogueSuggestionApplyResult,
  type CharacterDialogueThinProfileAction,
  type CharacterDialogueTranscriptArtifactSaveInput,
  type CharacterDialogueTranscriptArtifactSaveResult,
  type CharacterDialogueTranscriptSavePolicy,
  type CreateCharacterDialogueSessionInput,
  type LoadCharacterDialogueTurnEvidenceInput,
} from './character-dialogue-runtime';

export {
  DEFAULT_CHARACTER_EVIDENCE_BUDGET,
  DEFAULT_CHARACTER_EVIDENCE_MAX_LOCATORS,
  DEFAULT_CHARACTER_EVIDENCE_MAX_WINDOW_LINES,
  DEFAULT_CHARACTER_EVIDENCE_PROJECT_SEARCH_LIMIT,
  DEFAULT_CHARACTER_EVIDENCE_SUPPORTED_EXTENSIONS,
  aggregateCharacterEvidenceFreshness,
  characterEvidenceLocatorToSourceRef,
  createCharacterEvidenceStrategy,
  dashboardDetailToCharacterEvidenceLocators,
  dedupeCharacterEvidenceChunks,
  dedupeCharacterEvidenceLocators,
  normalizeCharacterEvidenceBudget,
  normalizeCharacterEvidenceTokens,
  occurrenceProjectionToCharacterEvidenceLocators,
  parseCharacterEvidenceLocation,
  projectCharacterEvidenceBundleToProfileFacts,
  projectSearchItemToCharacterEvidenceLocators,
  rankCharacterEvidenceChunks,
  renderCharacterEvidenceBundle,
  renderCharacterEvidenceChunkText,
  resolveCharacterEvidenceLineRange,
  resolveCharacterEvidenceProjectPath,
  scoreCharacterEvidenceChunk,
  sourceRefToCharacterEvidenceLocators,
  trimCharacterEvidenceChunks,
  type CharacterEvidenceAuthority,
  type CharacterEvidenceBudget,
  type CharacterEvidenceBundle,
  type CharacterEvidenceChunk,
  type CharacterEvidenceDashboardDetailReader,
  type CharacterEvidenceLineRange,
  type CharacterEvidenceLoader,
  type CharacterEvidenceLocator,
  type CharacterEvidenceMetadata,
  type CharacterEvidenceMetadataValue,
  type CharacterEvidenceMode,
  type CharacterEvidenceOccurrenceReader,
  type CharacterEvidenceOmission,
  type CharacterEvidenceOmissionReason,
  type CharacterEvidencePathResolutionInput,
  type CharacterEvidenceProjectSearchInput,
  type CharacterEvidenceProjectSearchReader,
  type CharacterEvidenceRelevance,
  type CharacterEvidenceRelevanceSignal,
  type CharacterEvidenceRequest,
  type CharacterEvidenceResolvedProjectPath,
  type CharacterEvidenceRuntimeLogger,
  type CharacterEvidenceScoreInput,
  type CharacterEvidenceSourceKind,
  type CharacterEvidenceSourceRef,
  type CharacterEvidenceStoryIndexReader,
  type CharacterEvidenceStrategyOptions,
  type CharacterEvidenceTextReader,
  type CharacterEvidenceTrimResult,
  type ParsedCharacterEvidenceLocation,
} from './character-evidence';

export {
  EMBODY_CHARACTER_BLOCKED_TOOL_NAMES,
  EMBODY_CHARACTER_DEFAULT_CONFIG,
  EmbodyCharacterSession,
  buildEmbodyCharacterTurnSystemPrompt,
  isToolAllowedForEmbodyCharacter,
  projectEmbodyCharacterFeedbackPrompt,
  projectEmbodyCharacterTranscriptToChatMessages,
  type EmbodyCharacterCapabilityPolicy,
  type EmbodyCharacterEvidenceSnapshot,
  type EmbodyCharacterFeedbackClassification,
  type EmbodyCharacterResponder,
  type EmbodyCharacterResponderInput,
  type EmbodyCharacterResponderResult,
  type EmbodyCharacterSendUserMessageOptions,
  type EmbodyCharacterSessionConfig,
  type EmbodyCharacterSessionOptions,
  type EmbodyCharacterSessionSnapshot,
  type EmbodyCharacterTurn,
} from './embody-character-session';

export {
  buildAgentExecutionMetadata,
  buildAgentAssistantMessageFromStream,
  buildAgentErrorAssistantMessage,
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
  type AgentLlmRuntimeOptions,
  type AgentExecutionMetadataInput,
  type AgentHistoryHydrationPlan,
  type AgentHistoryHydrationPlanInput,
  type AgentStreamPersistenceSnapshot,
  type BuildAgentAssistantMessageInput,
  type BuildAgentErrorAssistantMessageInput,
  type AgentMessageFileReferenceProcessor,
  type AgentProviderCandidate,
  type AgentProjectFileCandidate,
  type AgentProjectFileSearchPurpose,
  type AgentProjectFileSearchPlan,
  type AgentProjectFileSearchPlanInput,
  type AgentProjectFilesProjectionInput,
  type AgentProjectMentionCandidate,
  type AgentProcessedReferencedMedia,
  type AgentReferencedMediaProcessor,
  type AgentReferencedFileContent,
  type AgentMessageDispatchRoute,
  type AgentMessageExecutionOverrides,
  type AgentMessageIdOptions,
  type AgentMessageRuntimeRequest,
  type AgentMessageTurnAgentExecutionInput,
  type AgentMessageTurnPreconditionReason,
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
  inferAgentCreationIntentFromFilePath,
  inferAgentFileContextType,
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
  projectAgentStreamEventToHostMessages,
  projectAgentStreamEventToWebviewMessages,
  type AgentStreamProjectionMessage,
  type AgentStreamProjectionState,
  type AgentStreamMessageIdOptions,
  type AgentStreamStateOptions,
  type AgentStreamStateUpdate,
  type AgentStreamWebviewMessage,
  type CollectedToolCall,
  type ProjectAgentStreamEventToHostMessagesInput,
  type ProjectAgentStreamEventToWebviewMessagesInput,
} from './agent-stream-state';

export {
  BackfillCoordinator,
  createBackfillCoordinator,
  type BackfillCoordinatorApplyResult,
  type BackfillCoordinatorConfig,
  type BackfillCoordinatorSessionPort,
  type BackfillCoordinatorStreamPort,
  type BackfillCoordinatorWebviewPort,
} from './backfill-coordinator';

export type {
  BackfillSink,
  IPerceptionPipeline,
  MediaProbePort,
  PerceptionClientPort,
  PerceptionPipelinePorts,
  PerceptualAssetPort,
  PerceptualAssetResolverPort,
  ResolvedPerceptualAsset,
} from '../perception';

export {
  applyToolResultBackfillToResult,
  mergeToolResultAttachments,
  mergeToolResultBackfillData,
  mergeToolResultPerceptionCards,
  type ApplyToolResultBackfillResult,
  type BackfillableToolResult,
} from './tool-result-backfill';

export {
  backfillStoryboardGeneratedMediaRefs,
  createStoryboardImageToolCapabilities,
  executeStoryboardImageStrategyRuntime,
  planStoryboardImageStrategyRuntime,
  storyboardRuntimeCanExecute,
  type BackfillStoryboardGeneratedMediaRefsInput,
  type BackfillStoryboardGeneratedMediaRefsResult,
  type ExecuteStoryboardImageRuntimeInput,
  type ExecuteStoryboardImageRuntimeResult,
  type StoryboardGeneratedMediaBackfillCompletion,
  type StoryboardGeneratedMediaBackfillOutput,
  type StoryboardImageRuntimeExecution,
  type StoryboardImageRuntimePlan,
  type StoryboardImageRuntimePlanInput,
  type StoryboardImageRuntimeToolPort,
} from '@neko-agent/skills';

export {
  backfillShotImagePrepOutputRefs,
  applyResolvedReferencesToToolArgs,
  createGenerateVideoReferenceToolArgs,
  createShotImagePrepToolCapabilities,
  createShotImagePrepToolRequest,
  estimateShotImagePrepCost,
  executeShotImagePrepBatch,
  executeShotImagePrepPlan,
  gateShotImagePrepBatch,
  resolveShotImagePrepProviderInputs,
  type ExecuteShotImagePrepBatchInput,
  type ShotImagePrepBackfillCompletion,
  type ShotImagePrepBackfillOutput,
  type ShotImagePrepBatchExecutionResult,
  type ShotImagePrepBatchGateInput,
  type ShotImagePrepBatchGateResult,
  type ShotImagePrepExecutionInput,
  type ShotImagePrepExecutionResult,
  type ShotImagePrepResolvedReferenceBundle,
  type ShotImagePrepRuntimeToolPort,
  type ShotImagePrepToolCapability,
  type ShotImagePrepToolRequest,
} from '@neko-agent/skills';

export {
  backfillBatchExecutionPlanFromSummary,
  createAssetIndexingBatchExecutionPlan,
  createComicAnimationSemanticRecord,
  createDefaultComicAnimationPerceptionFacets,
  createMentionResolverContinuityContext,
  createShotImagePrepBatchExecutionPlan,
  isIndexedRangeTaskStale,
  planComicAnimationIndexingTasks,
  queryStoryContinuitySnapshot,
  rebuildComicAnimationProjectionFromSemanticRecords,
  registerComicAnimationAsset,
  writeComicAnimationSemanticRecordFirst,
  type AssetIndexingBatchInput,
  type BatchExecutionRuntimeBackfillInput,
  type ComicAnimationAssetRegistrationInput,
  type ComicAnimationCacheProjectionPort,
  type ComicAnimationSemanticRecord,
  type ComicAnimationSemanticRecordKind,
  type ComicAnimationSemanticStorePort,
  type IndexingTaskPlan,
  type IndexingTaskPlanningInput,
  type ShotImagePrepBatchPlanInput,
  type StoryContinuityRuntimeOptions,
  type StoryContinuityStoreSnapshot,
} from '@neko-agent/skills';

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
  runAgentMediaTurn,
  type AgentMediaTurnExecutionInput,
  type AgentMediaTurnIgnoredTaskEvent,
  type AgentMediaTurnProgressErrorEvent,
  type AgentMediaTurnRuntimeMessage,
  type AgentMediaTurnTaskEvent,
  type RunAgentMediaTurnInput,
  type RunAgentMediaTurnResult,
} from './media-turn-runtime';

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
  expandRuntimePluginTransferInputs,
  type BuildPluginTransferPlanInput,
  type PluginSlashCommandDef,
  type RegisteredPluginSlashCommand,
  type RuntimePluginSlashCommandDispatch,
  type RuntimePluginSlashCommandRegistry,
} from './plugin-transfer-runtime';

export {
  extractFileReferencePaths,
  formatDocumentAttachmentReference,
  formatFileAttachmentContent,
  formatMediaAttachmentReference,
  formatReadDocumentInstruction,
  formatUnreadableFileAttachment,
  normalizeAgentRuntimePromptLocale,
  parseBase64DataUrl,
  projectAgentMessageAttachments,
  type AgentAttachmentProjectionDeps,
  type AgentAttachmentProjectionError,
  type AgentBase64ImageAttachment,
  type AgentProcessedAttachments,
  type AgentRuntimePromptLocale,
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
