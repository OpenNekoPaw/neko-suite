/**
 * Session Module - Unified session management
 */

export * from './types';
export * from './agent-session';
export {
  initializeSession,
  type SessionComponents,
  type SessionCallbacks,
  DEFAULT_MAX_CONTEXT_TOKENS,
  DEFAULT_MAX_ITERATIONS,
} from './agent-session-initializer';
export type { ConversationRecord, ConversationIndex } from './conversation-record';
export {
  FileConversationStorage,
  createFileConversationStorage,
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
export { JournalReader } from './journal-reader';
export type {
  ResumedSessionState,
  JournalReaderFsOps,
  JournalReaderOptions,
} from './journal-reader';
export { JournalStorage, createJournalStorage } from './journal-storage';
export type { JournalStorageFsOps } from './journal-storage';
