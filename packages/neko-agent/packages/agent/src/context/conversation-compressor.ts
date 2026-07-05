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
  IMessageClassifier,
} from '@neko/shared';
import { DEFAULT_COMPRESSOR_CONFIG } from '@neko/shared';
import { getLogger } from '../utils/logger';

const logger = getLogger('ConversationCompressor');

type CompressorPromptLocale = 'en' | 'zh';

interface ConversationCompressorRuntimeConfig extends Partial<ConversationCompressorConfig> {
  readonly locale?: string;
}

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
  private locale: CompressorPromptLocale = 'en';

  /** Optional summarizer for generating summaries */
  private summarizer?: ISummarizer;

  /** Optional message classifier for priority-based compression */
  private classifier?: IMessageClassifier;

  constructor(
    config?: ConversationCompressorRuntimeConfig,
    summarizer?: ISummarizer,
    classifier?: IMessageClassifier,
  ) {
    const { locale, ...compressorConfig } = config ?? {};
    this.config = { ...DEFAULT_COMPRESSOR_CONFIG, ...compressorConfig };
    this.locale = normalizeCompressorPromptLocale(locale);
    this.summarizer = summarizer;
    this.classifier = classifier;
  }

  /**
   * Configure the compressor
   */
  configure(config: ConversationCompressorRuntimeConfig): void {
    const { locale, ...compressorConfig } = config;
    this.config = { ...this.config, ...compressorConfig };
    if (locale !== undefined) {
      this.locale = normalizeCompressorPromptLocale(locale);
    }
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
   * Set message classifier for creative-domain priority-based compression.
   * When set, older turns are compressed by category instead of a single bulk summary.
   */
  setClassifier(classifier: IMessageClassifier): void {
    this.classifier = classifier;
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
    },
  ): Promise<ConversationCompressionResult> {
    const originalTokens = this.estimateTokens(messages);
    const turns = this.getTurns(messages);
    const messageIndexMap = new Map<ChatMessage, number>();
    messages.forEach((message, index) => {
      messageIndexMap.set(message, index);
    });

    // If not enough turns, return as-is
    if (turns.length <= this.config.conversationWindow.recentTurns && !options?.force) {
      return {
        messages: messages.map((msg, index) => ({
          message: msg,
          sourceIndexes: [index],
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

    // Separate system prompt turn (turn 0) from older turns — never compress it
    const systemTurn =
      olderTurns.length > 0 && olderTurns[0]!.turnNumber === 0 ? olderTurns.shift() : undefined;

    const compressedMessages: CompressedMessage[] = [];
    let summariesCreated = 0;
    let messagesRemoved = 0;

    // Always preserve system prompt messages
    if (systemTurn) {
      for (const msg of systemTurn.messages) {
        compressedMessages.push({
          message: msg,
          sourceIndexes: getMessageSourceIndexes([msg], messageIndexMap),
          isSummary: false,
          compressedTokens: estimateMessageTokens(msg),
        });
      }
    }

    // Handle older turns
    if (olderTurns.length > 0) {
      const olderMessages = olderTurns.flatMap((t) => t.messages);

      if (this.classifier && this.config.conversationWindow.olderTurnsStrategy === 'summary') {
        // Creative-domain classified compression:
        // 1. Classify all older messages
        // 2. Preserve user messages verbatim (P1)
        // 3. Delegate P2–P7 to the summariser (which handles per-category budgets)
        const classified = this.classifier.classify(olderMessages);

        // P1: keep user messages verbatim
        const userMsgs = classified.filter((c) => c.infoType === 'user_message');
        for (const item of userMsgs) {
          compressedMessages.push({
            message: item.message,
            sourceIndexes: getMessageSourceIndexes([item.message], messageIndexMap),
            isSummary: false,
            compressedTokens: estimateMessageTokens(item.message),
          });
        }

        // P2–P7: summarise the rest (classifier-aware summariser handles per-category budgets)
        const nonUserMessages = classified
          .filter((c) => c.infoType !== 'user_message')
          .map((c) => c.message);

        if (nonUserMessages.length > 0) {
          const summary = await this.summarizeMessages(
            nonUserMessages,
            this.config.conversationWindow.olderTurnsSummaryMaxTokens,
          );
          if (summary) {
            compressedMessages.push({
              message: {
                role: 'system',
                content: `${formatSummaryWrapper('creative', olderTurns.length, this.locale)}\n${summary}`,
              },
              sourceIndexes: getMessageSourceIndexes(nonUserMessages, messageIndexMap),
              isSummary: true,
              originalCount: nonUserMessages.length,
              originalTokens: nonUserMessages.reduce((sum, m) => sum + estimateMessageTokens(m), 0),
              compressedTokens: estimateTokens(summary),
              turnRange: `turns 1-${olderTurns.length}`,
            });
            summariesCreated++;
          }
        }
        messagesRemoved += nonUserMessages.length;
      } else if (this.config.conversationWindow.olderTurnsStrategy === 'summary') {
        // Default bulk summary (no classifier)
        const summary = await this.summarizeMessages(
          olderMessages,
          this.config.conversationWindow.olderTurnsSummaryMaxTokens,
        );

        if (summary) {
          compressedMessages.push({
            message: {
              role: 'system',
              content: `${formatSummaryWrapper('bulk', olderTurns.length, this.locale)}\n${summary}`,
            },
            sourceIndexes: getMessageSourceIndexes(olderMessages, messageIndexMap),
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
        messagesRemoved += olderMessages.length;
      }
    }

    // Keep recent turns with tool result compression
    for (const turn of recentTurns) {
      for (const msg of turn.messages) {
        const compressedMsg = this.compressMessage(msg);
        compressedMessages.push({
          message: compressedMsg,
          sourceIndexes: getMessageSourceIndexes([msg], messageIndexMap),
          isSummary: false,
          compressedTokens: estimateMessageTokens(compressedMsg),
        });
      }
    }

    const compressedTokens = compressedMessages.reduce((sum, m) => sum + m.compressedTokens, 0);

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
    maxTokens: number,
  ): Promise<string | null> {
    if (!this.summarizer) {
      // Fallback: create a simple summary without LLM
      return this.createSimpleSummary(messages, maxTokens);
    }

    try {
      const result = await this.summarizer.summarize({
        messages,
        maxTokens,
        locale: this.locale,
        contextHint:
          this.locale === 'zh'
            ? '总结这一段对话的关键点。'
            : 'Summarize the key points of this conversation segment.',
      });
      return result.summary;
    } catch (error) {
      logger.error('Summarization failed', { error });
      return this.createSimpleSummary(messages, maxTokens);
    }
  }

  /**
   * Create a simple summary without LLM
   */
  private createSimpleSummary(messages: ChatMessage[], maxTokens: number): string {
    const parts: string[] = [];
    let tokenCount = 0;
    const labels = getCompressorPromptLabels(this.locale);

    for (const msg of messages) {
      const content = typeof msg.content === 'string' ? msg.content : labels.complexContent;
      const preview = content.slice(0, 100) + (content.length > 100 ? '...' : '');
      const line = `[${labels.roles[msg.role] ?? msg.role}]: ${preview}`;
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

function getMessageSourceIndexes(
  messages: readonly ChatMessage[],
  messageIndexMap: ReadonlyMap<ChatMessage, number>,
): number[] {
  const indexes: number[] = [];

  for (const message of messages) {
    const index = messageIndexMap.get(message);
    if (index !== undefined) {
      indexes.push(index);
    }
  }

  return indexes;
}

function normalizeCompressorPromptLocale(locale?: string): CompressorPromptLocale {
  return locale?.trim().toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function formatSummaryWrapper(
  kind: 'bulk' | 'creative',
  endTurn: number,
  locale: CompressorPromptLocale,
): string {
  if (locale === 'zh') {
    return kind === 'creative' ? `[第 1-${endTurn} 轮创作摘要]` : `[第 1-${endTurn} 轮摘要]`;
  }

  return kind === 'creative'
    ? `[Creative summary of turns 1-${endTurn}]`
    : `[Summary of turns 1-${endTurn}]`;
}

function getCompressorPromptLabels(locale: CompressorPromptLocale): {
  readonly complexContent: string;
  readonly roles: Partial<Record<ChatMessage['role'], string>>;
} {
  if (locale === 'zh') {
    return {
      complexContent: '[复杂内容]',
      roles: {
        system: '系统',
        user: '用户',
        assistant: '助手',
        tool: '工具',
      },
    };
  }

  return {
    complexContent: '[complex content]',
    roles: {},
  };
}

/**
 * Factory function to create a conversation compressor
 */
export function createConversationCompressor(
  config?: ConversationCompressorRuntimeConfig,
  summarizer?: ISummarizer,
  classifier?: IMessageClassifier,
): IConversationCompressor {
  return new ConversationCompressor(config, summarizer, classifier);
}
