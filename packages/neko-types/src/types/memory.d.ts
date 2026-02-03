/**
 * Memory Types - Context management and session memory (shared)
 */
import type { ChatMessage } from './platform';
/**
 * Token counter interface
 */
export interface TokenCounter {
    /** Count tokens in text */
    count(text: string): number;
    /** Count tokens in messages */
    countMessages(messages: ChatMessage[]): number;
}
/**
 * Compression strategy type
 */
export type CompressionStrategy = 'sliding_window' | 'summarize' | 'selective';
/**
 * Compression result
 */
export interface CompressionResult {
    /** Compressed messages */
    messages: ChatMessage[];
    /** Original token count */
    originalTokens: number;
    /** Compressed token count */
    compressedTokens: number;
    /** Compression ratio */
    ratio: number;
}
/**
 * Compression options
 */
export interface CompressionOptions {
    /** Preserve system message */
    preserveSystem?: boolean;
    /** Preserve recent N messages */
    preserveRecent?: number;
    /** Custom importance scorer */
    importanceScorer?: (message: ChatMessage) => number;
}
/**
 * Context compressor interface
 */
export interface ContextCompressor {
    /** Compression strategy type */
    readonly strategy: CompressionStrategy;
    /** Compress messages to fit within token limit */
    compress(messages: ChatMessage[], maxTokens: number, options?: CompressionOptions): Promise<CompressionResult>;
}
/**
 * Context manager configuration
 */
export interface ContextManagerConfig {
    /** Maximum context tokens */
    maxTokens: number;
    /** Reserved tokens for response */
    reservedTokens: number;
    /** Compression strategy */
    strategy: CompressionStrategy;
    /** Token counter */
    tokenCounter: TokenCounter;
}
/**
 * Context manager interface
 */
export interface ContextManager {
    /** Add message to context */
    add(message: ChatMessage): void;
    /** Get current messages (compressed if needed) */
    getMessages(): Promise<ChatMessage[]>;
    /** Get current token count */
    getTokenCount(): number;
    /** Compress messages to fit within token limits */
    compress(messages: ChatMessage[]): Promise<ChatMessage[]>;
    /** Clear context */
    clear(): void;
}
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
//# sourceMappingURL=memory.d.ts.map