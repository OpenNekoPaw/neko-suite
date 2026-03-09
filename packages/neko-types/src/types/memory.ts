/**
 * Memory Types - Session memory (shared)
 *
 * Context compression types have been moved to conversation-compressor.ts
 * and context-manager.ts.
 */

import type { ChatMessage } from './platform';

/**
 * Key fact extracted from conversation
 */
export interface KeyFact {
  /** Fact content */
  content: string;
  /** Fact category */
  category: 'preference' | 'decision' | 'context' | 'action';
  /** Extraction timestamp */
  timestamp: number;
  /** Confidence score 0-1 */
  confidence: number;
}

/**
 * Session memory entry
 */
export interface SessionMemoryEntry {
  /** Session ID */
  sessionId: string;
  /** Key facts from session */
  keyFacts: KeyFact[];
  /** Session summary */
  summary?: string;
  /** Created timestamp */
  createdAt: number;
  /** Updated timestamp */
  updatedAt: number;
}

/**
 * Session memory interface
 */
export interface SessionMemory {
  /** Get memory entries for context */
  getEntries(limit?: number): Promise<SessionMemoryEntry[]>;

  /** Get conversation history as messages */
  getHistory(): Promise<ChatMessage[]>;

  /** Add a message to the conversation history */
  addMessage(message: ChatMessage): Promise<void>;

  /** Save current session */
  saveSession(sessionId: string, facts: KeyFact[], summary?: string): Promise<void>;

  /** Search memories by query */
  search(query: string, limit?: number): Promise<SessionMemoryEntry[]>;

  /** Clear all memories */
  clear(): Promise<void>;
}
