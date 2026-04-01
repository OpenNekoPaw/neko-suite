/**
 * Context Module - Context management, compression, and persistence
 *
 * This module provides:
 * - LayeredContextManager: Token budget and lifecycle management across layers
 * - ConversationCompressor: Sliding window and summarization
 * - ContextPersistenceManager: Cross-session state persistence
 * - LLMSummarizer: LLM-based conversation summarization
 */

// Context manager
export { LayeredContextManager, createLayeredContextManager } from './context-manager';

// Conversation compressor
export { ConversationCompressor, createConversationCompressor } from './conversation-compressor';

// Context persistence
export {
  ContextPersistenceManager,
  InMemoryContextStorage,
  createContextPersistenceManager,
} from './context-persistence';

// LLM Summarizer
export {
  LLMSummarizer,
  createLLMSummarizer,
  DEFAULT_SUMMARIZER_CONFIG,
  type LLMSummarizerConfig,
} from './llm-summarizer';

// Creative-domain compression
export { MessageClassifier, createMessageClassifier } from './message-classifier';
export {
  CreativeSummarizer,
  createCreativeSummarizer,
  type CreativeSummarizerConfig,
} from './creative-summarizer';

// Creative version log
export {
  CreativeVersionLog,
  createCreativeVersionLog,
  isGenerationTool,
  detectEvaluation,
  type VersionRecordInput,
} from './creative-version-log';

// Re-export types from shared for convenience
export type {
  // Context manager types
  ContextLayer,
  ContextBudget,
  LayerUsage,
  ContextItem,
  ContextState,
  ContextOverflowEvent,
  LayeredContextManagerConfig,
  ContextEventType,
  ContextEvent,
  ContextEventListener,
  ILayeredContextManager,
  // Conversation compressor types
  ConversationCompressionStrategy,
  ToolResultCompressionConfig,
  ConversationWindowConfig,
  SkillCompressionConfig,
  CompressionTriggersConfig,
  ConversationCompressorConfig,
  CompressedMessage,
  ConversationCompressionResult,
  TurnInfo,
  SummarizationRequest,
  SummarizationResult,
  ISummarizer,
  IConversationCompressor,
  // Creative-domain compression types
  CreativeInfoType,
  MessageClassification,
  IMessageClassifier,
  CreativeSummaryBudget,
  CreativeCompressionConfig,
  // Context persistence types
  SerializableContextItem,
  SerializableContextState,
  ContextPersistenceConfig,
  SessionMetadata,
  IContextStorage,
  IContextPersistence,
} from '@neko/shared';
