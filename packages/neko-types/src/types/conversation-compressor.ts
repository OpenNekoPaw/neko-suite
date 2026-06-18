/**
 * Conversation Compressor Types
 *
 * Defines types for compressing conversation history using
 * sliding window and summarization strategies.
 *
 * Note: Types are prefixed with "Conversation" to avoid conflicts with
 * the simpler compression types in memory.ts.
 */

import type { ChatMessage } from './platform';

/**
 * Conversation compression strategy types
 */
export type ConversationCompressionStrategy = 'sliding_window' | 'summarize' | 'hybrid';

/**
 * Tool result compression configuration
 */
export interface ToolResultCompressionConfig {
  /** Maximum token length for a single tool result */
  maxLength: number;
  /** Fields to keep in compressed result */
  keepFields: string[];
  /** Fields to discard */
  discardFields: string[];
}

/**
 * Conversation window configuration
 */
export interface ConversationWindowConfig {
  /** Number of recent turns to keep in full */
  recentTurns: number;
  /** How to handle older turns: 'summary' | 'discard' */
  olderTurnsStrategy: 'summary' | 'discard';
  /** Maximum tokens for older turns summary */
  olderTurnsSummaryMaxTokens: number;
}

/**
 * Skill context compression configuration
 */
export interface SkillCompressionConfig {
  /** How to handle inactive skills: 'index-only' | 'keep' */
  inactiveSkillsStrategy: 'index-only' | 'keep';
  /** Turns without use before skill is considered inactive */
  activeSkillAge: number;
}

/**
 * Compression triggers configuration
 */
export interface CompressionTriggersConfig {
  /** Token threshold to trigger compression */
  tokenThreshold: number;
  /** Turn threshold to trigger compression */
  turnThreshold: number;
}

/**
 * Full compressor configuration
 */
export interface ConversationCompressorConfig {
  /** Tool result compression settings */
  toolResultCompression: ToolResultCompressionConfig;
  /** Conversation window settings */
  conversationWindow: ConversationWindowConfig;
  /** Skill compression settings */
  skillCompression: SkillCompressionConfig;
  /** Compression triggers */
  triggers: CompressionTriggersConfig;
}

/**
 * Default compressor configuration
 */
export const DEFAULT_COMPRESSOR_CONFIG: ConversationCompressorConfig = {
  toolResultCompression: {
    maxLength: 500,
    keepFields: ['status', 'summary', 'error', 'result'],
    discardFields: ['rawData', 'debug', 'trace', 'stackTrace'],
  },
  conversationWindow: {
    recentTurns: 10,
    olderTurnsStrategy: 'summary',
    olderTurnsSummaryMaxTokens: 2000,
  },
  skillCompression: {
    inactiveSkillsStrategy: 'index-only',
    activeSkillAge: 5,
  },
  triggers: {
    tokenThreshold: 80000,
    turnThreshold: 20,
  },
};

/**
 * Compressed message with metadata
 */
export interface CompressedMessage {
  /** Original message or summary */
  message: ChatMessage;
  /** Source message indexes in the pre-compression history */
  sourceIndexes?: number[];
  /** Whether this is a summary of multiple messages */
  isSummary: boolean;
  /** Original message count if summary */
  originalCount?: number;
  /** Original token count before compression */
  originalTokens?: number;
  /** Compressed token count */
  compressedTokens: number;
  /** Turn range if summary (e.g., "turns 1-5") */
  turnRange?: string;
}

/**
 * Conversation compression result
 */
export interface ConversationCompressionResult {
  /** Compressed messages */
  messages: CompressedMessage[];
  /** Total tokens before compression */
  originalTokens: number;
  /** Total tokens after compression */
  compressedTokens: number;
  /** Compression ratio (0-1, lower = more compression) */
  compressionRatio: number;
  /** Number of messages removed */
  messagesRemoved: number;
  /** Number of summaries created */
  summariesCreated: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Turn information for compression
 */
export interface TurnInfo {
  /** Turn number */
  turnNumber: number;
  /** Messages in this turn */
  messages: ChatMessage[];
  /** Total tokens in this turn */
  tokenCount: number;
  /** Skills used in this turn */
  skillsUsed: string[];
  /** Tools called in this turn */
  toolsCalled: string[];
  /** Timestamp */
  timestamp: number;
}

/**
 * Summarization request
 */
export interface SummarizationRequest {
  /** Messages to summarize */
  messages: ChatMessage[];
  /** Maximum tokens for summary */
  maxTokens: number;
  /** Context hint for summarization */
  contextHint?: string;
}

/**
 * Summarization result
 */
export interface SummarizationResult {
  /** Summary text */
  summary: string;
  /** Source path that produced the summary */
  source?: 'llm' | 'fallback';
  /** Whether the summary was produced by a degraded/local path */
  degraded?: boolean;
  /** Token count of summary */
  tokenCount: number;
  /** Key points extracted */
  keyPoints: string[];
  /** Important entities mentioned */
  entities: string[];
}

/**
 * Summarizer interface (to be implemented by LLM service)
 */
export interface ISummarizer {
  /**
   * Summarize messages
   */
  summarize(request: SummarizationRequest): Promise<SummarizationResult>;
}

/**
 * Conversation compressor interface
 */
// ────────────────────────────────────────────
// Creative-domain compression types
// ────────────────────────────────────────────

/**
 * Information type classification for creative workflows.
 * Lower numeric priority = higher retention importance.
 */
export type CreativeInfoType =
  | 'user_message' // P1: user messages — always keep verbatim
  | 'creative_decision' // P2: style/tone/character/narrative decisions
  | 'version_anchor' // P3: version checkpoints + user satisfaction signals
  | 'iteration_chain' // P4: prompt → params → result → feedback chains
  | 'asset_state' // P5: layer/timeline/canvas structural changes
  | 'aesthetic_pref' // P6: accumulated accept/reject aesthetic signals
  | 'other'; // P7: everything else

/**
 * Classification result for a single message
 */
export interface MessageClassification {
  /** Original message */
  message: ChatMessage;
  /** Detected information type */
  infoType: CreativeInfoType;
  /** Numeric priority (1-7, lower = more important) */
  priority: number;
  /** Suggested retention action */
  retentionHint: 'keep' | 'summarize' | 'discard';
}

/**
 * Message classifier interface — classifies conversation messages
 * by creative information type for priority-based compression.
 */
export interface IMessageClassifier {
  /** Classify an array of messages */
  classify(messages: ChatMessage[]): MessageClassification[];
}

/**
 * Per-category token budget for layered summarisation
 */
export interface CreativeSummaryBudget {
  /** P2: creative direction decisions */
  creativeDecisions: number;
  /** P3: version anchors and evaluations */
  versionAnchors: number;
  /** P4: iteration chains (prompt→result→feedback) */
  iterationChains: number;
  /** P5: asset state snapshots */
  assetStates: number;
  /** P6: aesthetic preference signals */
  aestheticPrefs: number;
}

/**
 * Creative-domain compression configuration.
 * Extends the base compressor with semantic classification.
 */
export interface CreativeCompressionConfig {
  /** Whether to keep ALL user messages verbatim ('all') or only within window ('recent') */
  userMessageRetention: 'all' | 'recent';
  /** Keywords that signal a version anchor / satisfaction checkpoint */
  versionAnchorKeywords: string[];
  /** Keywords that signal a creative direction decision */
  creativeDecisionKeywords: string[];
  /** Keywords that signal aesthetic preference (accept/reject) */
  aestheticPrefKeywords: string[];
  /** Per-category token budget for summarisation */
  summaryBudget: CreativeSummaryBudget;
}

/**
 * Default creative compression configuration
 */
export const DEFAULT_CREATIVE_COMPRESSION_CONFIG: CreativeCompressionConfig = {
  userMessageRetention: 'all',
  versionAnchorKeywords: [
    '这版不错',
    '满意',
    '就这样',
    'OK',
    '完美',
    '可以',
    'keep this',
    'looks good',
    'perfect',
    'love it',
  ],
  creativeDecisionKeywords: [
    '风格',
    '基调',
    '色调',
    '构图',
    '节奏',
    '氛围',
    '主题',
    '角色设定',
    '叙事',
    'style',
    'tone',
    'palette',
    'composition',
    'mood',
    'theme',
    'character design',
    'narrative',
  ],
  aestheticPrefKeywords: [
    '太暗',
    '太亮',
    '更暖',
    '更冷',
    '饱和',
    '对比',
    '不够',
    '过了',
    'too dark',
    'too bright',
    'warmer',
    'cooler',
    'more contrast',
    'less saturated',
  ],
  summaryBudget: {
    creativeDecisions: 500,
    versionAnchors: 300,
    iterationChains: 600,
    assetStates: 300,
    aestheticPrefs: 300,
  },
};

// ────────────────────────────────────────────
// Core compressor interface
// ────────────────────────────────────────────

export interface IConversationCompressor {
  /**
   * Configure the compressor
   */
  configure(config: Partial<ConversationCompressorConfig>): void;

  /**
   * Get current configuration
   */
  getConfig(): ConversationCompressorConfig;

  /**
   * Check if compression should be triggered
   */
  shouldCompress(messages: ChatMessage[], currentTokens: number): boolean;

  /**
   * Compress conversation history
   */
  compress(
    messages: ChatMessage[],
    options?: {
      /** Force compression even if threshold not met */
      force?: boolean;
      /** Target token count */
      targetTokens?: number;
      /** Active skills to preserve context for */
      activeSkills?: string[];
    },
  ): Promise<ConversationCompressionResult>;

  /**
   * Compress a single tool result
   */
  compressToolResult(result: Record<string, unknown>): Record<string, unknown>;

  /**
   * Get turn information from messages
   */
  getTurns(messages: ChatMessage[]): TurnInfo[];

  /**
   * Estimate token count for messages
   */
  estimateTokens(messages: ChatMessage[]): number;
}
