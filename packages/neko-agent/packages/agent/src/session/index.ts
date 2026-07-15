/**
 * Session Module - Unified session management
 */

export * from './types';
export {
  parseConversationJournalMetadata,
  type ConversationJournalChatModelSelection,
  type ConversationJournalLifecycle,
  type ConversationJournalMetadata,
  type ConversationJournalModelSelection,
  type ConversationJournalSource,
} from './conversation-journal-metadata';
export * from './agent-session';
export {
  initializeSession,
  type SessionComponents,
  type SessionCallbacks,
  DEFAULT_MAX_CONTEXT_TOKENS,
  DEFAULT_MAX_ITERATIONS,
} from './agent-session-initializer';
export type {
  ConversationRecord,
  ConversationIndexMeta,
  ConversationsIndexFile,
  ConversationSource,
  ConversationChatModelSelection,
  ConversationMediaModelSelection,
} from './conversation-record';
export {
  createConversationId,
  getConversationWorkDirHash,
  isCanonicalConversationId,
  parseConversationId,
} from './conversation-id';
export type { ConversationIdOptions, ParsedConversationId } from './conversation-id';
export {
  SqliteConversationStorage,
  type ConversationMetadataJournalWriter,
  type SqliteConversationStorageOptions,
} from './sqlite-conversation-storage';
export {
  createNodeSqliteConversationStorage,
  type CreateNodeSqliteConversationStorageOptions,
  type NodeSqliteConversationStorageBinding,
} from './node-sqlite-conversation-storage';
export type {
  ConversationCatalogStaleDiagnostic,
  ConversationResumeStorage,
  ConversationStorageMutationResult,
} from './conversation-resume-storage';
export {
  migrateLegacyConversationCatalog,
  type ConversationCatalogMigrationReport,
  type ConversationCatalogMigrationUnrecoverable,
} from './conversation-catalog-migration';
export {
  ConversationManager,
  type AgentHistoryEntry,
  type CleanupPolicy,
  type Conversation,
  type ConversationReconcileResult,
  type DeleteConversationOptions,
  type ConversationManagerOptions,
  type ConversationStorage,
} from './conversation-manager';
export {
  buildConversationHistoryClearedMessage,
  runCancelMessageRuntime,
  runClearAllConversationsRuntime,
  runClearHistoryRuntime,
  runConfirmToolRuntime,
  runDeleteConversationRuntime,
  runNewConversationRuntime,
  runSwitchConversationRuntime,
  type ConfirmToolRuntimeInput,
  type ConversationControlAction,
  type ConversationControlConversationInput,
  type ConversationControlDisposable,
  type ConversationControlRuntimeEffects,
  type ConversationControlRuntimeMessage,
  type ConversationControlRuntimeResult,
  type ConversationControlRuntimeWarning,
  type ConversationControlRuntimeWarningCode,
  type DeleteConversationRuntimeInput,
  type DeleteConversationRuntimeOptions,
} from './conversation-control-runtime';
export {
  formatToolResultContext,
  hydrateAgentHistoryWithToolResults,
  projectJournalHistoryWithToolContext,
  type AgentHistoryToolCallContext,
  type AgentHistoryToolResultContext,
  type AgentHistoryWithToolContextMessage,
} from './history-hydration';
export {
  buildConversationRecordSavePlan,
  projectConversationMessagesToAgentHistory,
  type AgentHistoryEntry as ProjectedAgentHistoryEntry,
  type ConversationRecordProjectionConversation,
  type ConversationRecordSavePlan,
  type ConversationRecordSavePlanInput,
} from './conversation-record-projector';
export {
  ConversationPersistenceCoordinator,
  type ConversationPersistenceCoordinatorMetrics,
  type ConversationPersistenceCoordinatorOptions,
  type ConversationPersistenceDiagnostic,
  type ConversationPersistenceDiagnosticCode,
  type ConversationPersistenceDisposeResult,
  type ConversationPersistenceFlushResult,
  type ConversationPersistenceOperationKind,
  type ConversationPersistenceOperationResult,
  type ConversationPersistenceStoragePort,
  type ConversationPersistenceSubmission,
  type ConversationPersistenceSubmitResult,
} from './conversation-persistence-coordinator';
export {
  ConversationPersistenceRuntime,
  createConversationPersistenceRuntime,
  type ConversationPersistenceRuntimeOptions,
  type ConversationPersistenceRuntimeQueueResult,
  type ConversationPersistenceRuntimeResult,
  type ConversationPersistenceRuntimeStorage,
  type ConversationPersistenceRuntimeWarning,
} from './conversation-persistence-runtime';
export {
  FileAgentWorkspaceRuntimeStateRuntime,
  createAgentWorkspaceRuntimeStateRuntime,
  createEmptyAgentWorkspaceRuntimeState,
  createFileAgentWorkspaceRuntimeStateRuntime,
  getAgentWorkspaceRuntimeStateFilePath,
  type AgentWorkspaceRuntimeConversationState,
  type AgentWorkspaceRuntimeExecutionMode,
  type AgentWorkspaceRuntimeMediaCategory,
  type AgentWorkspaceRuntimeModelSelection,
  type AgentWorkspaceRuntimeSessionMode,
  type AgentWorkspaceRuntimeState,
  type AgentWorkspaceRuntimeStateFsOps,
  type AgentWorkspaceRuntimeStatePatch,
  type AgentWorkspaceRuntimeStateRuntime,
  type AgentWorkspaceRuntimeStateRuntimeOptions,
  type AgentWorkspaceRuntimeStateSource,
  type AgentWorkspaceRuntimeStatus,
  type AgentWorkspaceRuntimeTokenUsage,
} from './agent-workspace-runtime-state';

// Journal (JSONL session persistence)
export { JournalWriter } from './journal-writer';
export type {
  JournalEntry,
  JournalFsOps,
  JournalWriterOptions,
  StateSnapshot,
  SubAgentRef,
} from './journal-writer';
export { createJournalEntryId } from './journal-writer';
export { JournalReader } from './journal-reader';
export type {
  ResumedSessionState,
  JournalReaderFsOps,
  JournalReaderOptions,
} from './journal-reader';
export { JournalStorage, createJournalStorage, createNodeJournalStorage } from './journal-storage';
export type { JournalStorageFsOps } from './journal-storage';
export { JournalProjection, projectEntriesToHistory } from './journal-projection';
export type {
  IJournalProjection,
  JournalProjectionOptions,
  ConversationSummary,
} from './journal-projection';
export {
  SessionTaskResultObservationRecorder,
  createAgentTaskResultObservationLedger,
  createSessionTaskResultObservationRecorder,
  createTaskResultObservationJournalEntries,
} from './task-result-observation-recorder';
export type {
  AgentTaskResultObservationLedger,
  RecordAgentTaskResultObservationInput,
  RecordAgentTaskResultObservationResult,
  SessionTaskResultObservationRecorderConfig,
  TaskResultObservationJournalEntry,
} from './task-result-observation-recorder';
