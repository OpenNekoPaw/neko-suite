/**
 * Agent Memory Module
 *
 * Provides session memory, project memory, global memory,
 * fact extraction, and multi-layer recall for Agent execution.
 * Context compression has been moved to '../context' (ConversationCompressor).
 */

// Session memory
export { InMemorySessionMemory } from './session-memory';

// Project memory (cross-session file-backed memory)
export { FileProjectMemoryManager, createFileProjectMemoryManager } from './project-memory-manager';

// Global memory (cross-project file-backed memory)
export { createGlobalMemoryManager, DEFAULT_GLOBAL_MEMORY_PATH } from './global-memory-manager';

// KeyFact extraction (heuristic, no LLM)
export { KeyFactExtractor } from './keyfact-extractor';
export type { KeyFactExtractorOptions } from './keyfact-extractor';

// Memory recall (three-layer retrieval)
export { MemoryRecall } from './memory-recall';
export type { MemoryRecallOptions, RecalledMemory } from './memory-recall';

// Creative memory hooks (auto recall + extraction)
export { CreativeMemoryHooks } from './creative-memory-hooks';
export type { CreativeMemoryHooksOptions } from './creative-memory-hooks';
