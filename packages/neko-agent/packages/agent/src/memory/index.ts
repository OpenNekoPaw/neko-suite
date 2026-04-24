/**
 * Agent Memory Module
 *
 * Provides project memory, fact extraction, and recall for Agent execution.
 * Context compression has been moved to '../context' (ConversationCompressor).
 */

// Project memory (cross-session file-backed memory)
export { FileProjectMemoryManager, createFileProjectMemoryManager } from './project-memory-manager';

// KeyFact extraction (heuristic, no LLM)
export { KeyFactExtractor } from './keyfact-extractor';
export type { KeyFactExtractorOptions } from './keyfact-extractor';

// Memory recall (project memory only)
export { MemoryRecall } from './memory-recall';
export type { MemoryRecallOptions, RecalledMemory } from './memory-recall';

// Shared memory store (P5 — cross-ring scratchpad for dual-flow)
export {
  createSharedMemoryStore,
  type ISharedMemoryStore,
  type SharedMemoryStoreConfig,
  type MemoryScope,
  type MemoryEntry,
  type MemoryListener,
} from './shared-memory-store';
