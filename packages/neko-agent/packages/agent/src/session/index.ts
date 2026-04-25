/**
 * Session Module - Unified session management
 */

export * from './types';
export * from './agent-session';
export { createSkillRunKind, encodeRunKindSegment } from './idc-run-kind';
/** @deprecated Use `createSkillRunKind` / `encodeRunKindSegment` instead. */
export { createSkillWorkflowId, encodeWorkflowIdSegment } from './idc-workflow-id';
export {
  createPlanModeIdcMetadata,
  createSkillExecutionIdcMetadata,
  mergeIdcExecutionMetadata,
} from './idc-execution-metadata';
export {
  initializeSession,
  type SessionComponents,
  type SessionCallbacks,
  DEFAULT_MAX_CONTEXT_TOKENS,
  DEFAULT_MAX_ITERATIONS,
} from './agent-session-initializer';
export type {
  ConversationRecord,
  ConversationIndex,
  ConversationIndexMeta,
  ConversationsIndexFile,
  ConversationSource,
  ConversationMediaModelSelection,
} from './conversation-record';
export {
  createConversationId,
  createLegacyConversationMigrationId,
  getConversationWorkDirHash,
  isCanonicalConversationId,
  isLegacyConversationId,
  parseConversationId,
} from './conversation-id';
export type { ConversationIdOptions, ParsedConversationId } from './conversation-id';
export {
  ConversationIndexStore,
  type IConversationIndexStore,
  type ConversationIndexStoreFsOps,
  type ConversationIndexStoreOptions,
} from './conversation-index-store';
export {
  discoverLegacyConversationWorkDirs,
  migrateLegacyConversationIndex,
  type ConversationIndexMigrationFsOps,
  type ConversationIndexMigrationOptions,
  type ConversationIndexMigrationResult,
} from './conversation-index-migration';
export {
  FileConversationStorage,
  createFileConversationStorage,
  type LegacyConversationSupportMode,
  type CreateFileConversationStorageOptions,
} from './file-conversation-storage';

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
