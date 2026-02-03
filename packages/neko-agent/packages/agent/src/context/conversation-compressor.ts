/**
 * Conversation Compressor Implementation
 *
 * Compresses conversation history using sliding window and summarization strategies.
 */

import type {
  ChatMessage,
  ConversationCompressorConfig,
  ConversationCompressionResult,
  CompressedMessage,
  TurnInfo,
  ISummarizer,
  IConversationCompressor,
} from '@uniedit/shared';
import { DEFAULT_COMPRESSOR_CONFIG } from '@uniedit/shared';

/**
 * Simple token estimator (approximation: 1 token ≈ 4 characters)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate tokens for a message
 */
function estimateMessageTokens(message: ChatMessage): number {
  if (typeof message.content === 'string') {
    return estimateTokens(message.content);
  }
  // For content parts, sum up text parts
  let total = 0;
  for (const part of message.content) {
    if ('text' in part && typeof part.text === 'string') {
      total += estimateTokens(part.text);
    }
  }
  return total;
}

/**
 * Conversation Compressor implementation
 */
export class ConversationCompressor implements IConversationCompressor {
  /** Configuration */
  private config: ConversationCompressorConfig;

  /** Optional summarizer for generating summaries */
  private summarizer?: ISummarizer;

  constructor(
    config?: Partial<ConversationCompressorConfig>,
    summarizer?: ISummarizer
  ) {
    this.config = { ...DEFAULT_COMPRESSOR_CONFIG, ...config };
    this.summarizer = summarizer;
  }

  /**
   * Configure the compressor
   */
  configure(config: Partial<ConversationCompressorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): ConversationCompressorConfig {
    return { ...this.config };
  }

  /**
   * Set summarizer
   */
  setSummarizer(summarizer: ISummarizer): void {
    this.summarizer = summarizer;
  }

  /**
   * Check if compression should be triggered
   */
  shouldCompress(messages: ChatMessage[], currentTokens: number): boolean {
    if (currentTokens >= this.config.triggers.tokenThreshold) {
      return true;
    }

    const turns = this.getTurns(messages);
    if (turns.length >= this.config.triggers.turnThreshold) {
      return true;
    }

    return false;
  }

  /**
   * Compress conversation history
   */
  async compress(
    messages: ChatMessage[],
    options?: {
      force?: boolean;
      targetTokens?: number;
      activeSkills?: string[];
    }
  ): Promise<ConversationCompressionResult> {
    const originalTokens = this.estimateTokens(messages);
    const turns = this.getTurns(messages);

    // If not enough turns, return as-is
    if (turns.length <= this.config.conversationWindow.recentTurns && !options?.force) {
      return {
        messages: messages.map((msg) => ({
          message: msg,
          isSummary: false,
          compressedTokens: estimateMessageTokens(msg),
        })),
        originalTokens,
        compressedTokens: originalTokens,
        compressionRatio: 1,
        messagesRemoved: 0,
        summariesCreated: 0,
        timestamp: Date.now(),
      };
    }

    const recentTurnCount = this.config.conversationWindow.recentTurns;
    const recentTurns = turns.slice(-recentTurnCount);
    const olderTurns = turns.slice(0, -recentTurnCount);

    const compressedMessages: CompressedMessage[] = [];
    let summariesCreated = 0;
    let messagesRemoved = 0;

    // Handle older turns
    if (olderTurns.length > 0) {
      if (this.config.conversationWindow.olderTurnsStrategy === 'summary') {
        // Summarize older turns
        const olderMessages = olderTurns.flatMap((t) => t.messages);
        const summary = await this.summarizeMessages(
          olderMessages,
          this.config.conversationWindow.olderTurnsSummaryMaxTokens
        );

        if (summary) {
          compressedMessages.push({
            message: {
              role: 'system',
              content: `[Summary of turns 1-${olderTurns.length}]\n${summary}`,
            },
            isSummary: true,
            originalCount: olderMessages.length,
            originalTokens: olderTurns.reduce((sum, t) => sum + t.tokenCount, 0),
            compressedTokens: estimateTokens(summary),
            turnRange: `turns 1-${olderTurns.length}`,
          });
          summariesCreated++;
          messagesRemoved += olderMessages.length;
        }
      } else {
        // Discard older turns
        messagesRemoved += olderTurns.flatMap((t) => t.messages).length;
      }
    }

    // Keep recent turns with tool result compression
    for (const turn of recentTurns) {
      for (const msg of turn.messages) {
        const compressedMsg = this.compressMessage(msg);
        compressedMessages.push({
          message: compressedMsg,
          isSummary: false,
          compressedTokens: estimateMessageTokens(compressedMsg),
        });
      }
    }

    const compressedTokens = compressedMessages.reduce(
      (sum, m) => sum + m.compressedTokens,
      0
    );

    return {
      messages: compressedMessages,
      originalTokens,
      compressedTokens,
      compressionRatio: originalTokens > 0 ? compressedTokens / originalTokens : 1,
      messagesRemoved,
      summariesCreated,
      timestamp: Date.now(),
    };
  }

  /**
   * Compress a single message
   */
  private compressMessage(message: ChatMessage): ChatMessage {
    // Compress tool results
    if (message.role === 'tool' && typeof message.content === 'string') {
      try {
        const parsed = JSON.parse(message.content) as Record<string, unknown>;
        const compressed = this.compressToolResult(parsed);
        return {
          ...message,
          content: JSON.stringify(compressed),
        };
      } catch {
        // Not JSON, return as-is
        return message;
      }
    }

    return message;
  }

  /**
   * Compress a single tool result
   */
  compressToolResult(result: Record<string, unknown>): Record<string, unknown> {
    const { keepFields, discardFields, maxLength } = this.config.toolResultCompression;

    const compressed: Record<string, unknown> = {};

    // Keep specified fields
    for (const field of keepFields) {
      if (field in result) {
        compressed[field] = result[field];
      }
    }

    // Copy other fields except discarded ones
    for (const [key, value] of Object.entries(result)) {
      if (!keepFields.includes(key) && !discardFields.includes(key)) {
        compressed[key] = value;
      }
    }

    // Truncate if too long
    const serialized = JSON.stringify(compressed);
    if (estimateTokens(serialized) > maxLength) {
      // Keep only essential fields
      const essential: Record<string, unknown> = {};
      for (const field of keepFields) {
        if (field in compressed) {
          essential[field] = compressed[field];
        }
      }
      essential._truncated = true;
      return essential;
    }

    return compressed;
  }

  /**
   * Summarize messages using the summarizer
   */
  private async summarizeMessages(
    messages: ChatMessage[],
    maxTokens: number
  ): Promise<string | null> {
    if (!this.summarizer) {
      // Fallback: create a simple summary without LLM
      return this.createSimpleSummary(messages, maxTokens);
    }

    try {
      const result = await this.summarizer.summarize({
        messages,
        maxTokens,
        contextHint: 'Summarize the key points of this conversation segment.',
      });
      return result.summary;
    } catch (error) {
      console.error('[ConversationCompressor] Summarization failed:', error);
      return this.createSimpleSummary(messages, maxTokens);
    }
  }

  /**
   * Create a simple summary without LLM
   */
  private createSimpleSummary(messages: ChatMessage[], maxTokens: number): string {
    const parts: string[] = [];
    let tokenCount = 0;

    for (const msg of messages) {
      const content = typeof msg.content === 'string' ? msg.content : '[complex content]';
      const preview = content.slice(0, 100) + (content.length > 100 ? '...' : '');
      const line = `[${msg.role}]: ${preview}`;
      const lineTokens = estimateTokens(line);

      if (tokenCount + lineTokens > maxTokens) {
        break;
      }

      parts.push(line);
      tokenCount += lineTokens;
    }

    return parts.join('\n');
  }

  /**
   * Get turn information from messages
   */
  getTurns(messages: ChatMessage[]): TurnInfo[] {
    const turns: TurnInfo[] = [];
    let currentTurn: TurnInfo | null = null;
    let turnNumber = 0;

    for (const msg of messages) {
      // New turn starts with user message
      if (msg.role === 'user') {
        if (currentTurn) {
          turns.push(currentTurn);
        }
        turnNumber++;
        currentTurn = {
          turnNumber,
          messages: [msg],
          tokenCount: estimateMessageTokens(msg),
          skillsUsed: [],
          toolsCalled: [],
          timestamp: Date.now(),
        };
      } else if (currentTurn) {
        currentTurn.messages.push(msg);
        currentTurn.tokenCount += estimateMessageTokens(msg);

        // Track tool calls
        if (msg.role === 'assistant' && msg.toolCalls) {
          for (const call of msg.toolCalls) {
            if (!currentTurn.toolsCalled.includes(call.function.name)) {
              currentTurn.toolsCalled.push(call.function.name);
            }
          }
        }
      } else {
        // System message or message before first user message
        // Create a turn 0 for system context
        if (!currentTurn) {
          currentTurn = {
            turnNumber: 0,
            messages: [msg],
            tokenCount: estimateMessageTokens(msg),
            skillsUsed: [],
            toolsCalled: [],
            timestamp: Date.now(),
          };
        }
      }
    }

    // Push last turn
    if (currentTurn) {
      turns.push(currentTurn);
    }

    return turns;
  }

  /**
   * Estimate token count for messages
   */
  estimateTokens(messages: ChatMessage[]): number {
    return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
  }
}

/**
 * Factory function to create a conversation compressor
 */
export function createConversationCompressor(
  config?: Partial<ConversationCompressorConfig>,
  summarizer?: ISummarizer
): IConversationCompressor {
  return new ConversationCompressor(config, summarizer);
}
