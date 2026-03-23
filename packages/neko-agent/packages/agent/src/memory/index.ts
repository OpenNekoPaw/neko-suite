/**
 * Agent Memory Module
 *
 * Provides session memory for Agent execution.
 * Context compression has been moved to '../context' (ConversationCompressor).
 */

// Session memory
export { InMemorySessionMemory } from './session-memory';

// Project memory (cross-session file-backed memory)
export { FileProjectMemoryManager, createFileProjectMemoryManager } from './project-memory-manager';
