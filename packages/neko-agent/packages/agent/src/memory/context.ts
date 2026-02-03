/**
 * Context Management - Token counting and context compression
 */

import type {
  ChatMessage,
  ContentPart,
  TokenCounter,
  CompressionStrategy,
  CompressionResult,
  CompressionOptions,
  ContextCompressor,
  ContextManager as IContextManager,
  ContextManagerConfig,
} from '@neko/shared';

/**
 * Extract text content from ChatMessage content (handles both string and ContentPart[] formats)
 */
function extractTextContent(content: string | ContentPart[] | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map(part => part.text)
      .join('');
  }
  return '';
}

/**
 * Simple token counter (character-based approximation)
 */
export class SimpleTokenCounter implements TokenCounter {
  private charsPerToken: number;

  constructor(charsPerToken: number = 4) {
    this.charsPerToken = charsPerToken;
  }

  count(text: string): number {
    return Math.ceil(text.length / this.charsPerToken);
  }

  countMessages(messages: ChatMessage[]): number {
    return messages.reduce((sum, msg) => {
      const content = extractTextContent(msg.content);
      return sum + this.count(content) + 4; // 4 tokens overhead per message
    }, 0);
  }
}

/**
 * Sliding window compressor
 */
export class SlidingWindowCompressor implements ContextCompressor {
  readonly strategy: CompressionStrategy = 'sliding_window';

  async compress(
    messages: ChatMessage[],
    maxTokens: number,
    options?: CompressionOptions
  ): Promise<CompressionResult> {
    const tokenCounter = new SimpleTokenCounter();
    const originalTokens = tokenCounter.countMessages(messages);

    if (originalTokens <= maxTokens) {
      return {
        messages,
        originalTokens,
        compressedTokens: originalTokens,
        ratio: 1,
      };
    }

    const result: ChatMessage[] = [];
    let currentTokens = 0;

    // Preserve system message if requested
    const systemMessage = options?.preserveSystem
      ? messages.find((m) => m.role === 'system')
      : undefined;

    if (systemMessage) {
      result.push(systemMessage);
      currentTokens += tokenCounter.countMessages([systemMessage]);
    }

    // Get non-system messages
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    // Preserve recent messages if specified
    const preserveRecent = options?.preserveRecent || 0;
    const recentMessages = nonSystemMessages.slice(-preserveRecent);
    const recentTokens = tokenCounter.countMessages(recentMessages);

    // Add older messages from the end until we hit the limit
    const remainingTokens = maxTokens - currentTokens - recentTokens;
    const olderMessages = nonSystemMessages.slice(0, -preserveRecent || undefined);

    for (let i = olderMessages.length - 1; i >= 0; i--) {
      const msg = olderMessages[i];
      if (!msg) continue;
      const msgTokens = tokenCounter.countMessages([msg]);
      if (currentTokens + msgTokens > remainingTokens) break;
      result.push(msg);
      currentTokens += msgTokens;
    }

    // Add recent messages
    result.push(...recentMessages);
    currentTokens += recentTokens;

    // Sort by original order
    const finalMessages = systemMessage
      ? [systemMessage, ...result.filter((m) => m.role !== 'system')]
      : result;

    return {
      messages: finalMessages,
      originalTokens,
      compressedTokens: currentTokens,
      ratio: currentTokens / originalTokens,
    };
  }
}

/**
 * Summarize compressor - replaces older messages with a summary
 */
export class SummarizeCompressor implements ContextCompressor {
  readonly strategy: CompressionStrategy = 'summarize';
  private summarizer?: (messages: ChatMessage[]) => Promise<string>;

  constructor(summarizer?: (messages: ChatMessage[]) => Promise<string>) {
    this.summarizer = summarizer;
  }

  async compress(
    messages: ChatMessage[],
    maxTokens: number,
    options?: CompressionOptions
  ): Promise<CompressionResult> {
    const tokenCounter = new SimpleTokenCounter();
    const originalTokens = tokenCounter.countMessages(messages);

    if (originalTokens <= maxTokens) {
      return {
        messages,
        originalTokens,
        compressedTokens: originalTokens,
        ratio: 1,
      };
    }

    const result: ChatMessage[] = [];
    let currentTokens = 0;

    // Preserve system message
    const systemMessage = options?.preserveSystem
      ? messages.find((m) => m.role === 'system')
      : undefined;

    if (systemMessage) {
      result.push(systemMessage);
      currentTokens += tokenCounter.countMessages([systemMessage]);
    }

    // Get non-system messages
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    // Preserve recent messages
    const preserveRecent = options?.preserveRecent || 4;
    const recentMessages = nonSystemMessages.slice(-preserveRecent);
    const recentTokens = tokenCounter.countMessages(recentMessages);

    // Calculate how many tokens we have for summary
    const summaryBudget = maxTokens - currentTokens - recentTokens - 50; // 50 token buffer

    if (summaryBudget > 0 && nonSystemMessages.length > preserveRecent) {
      const olderMessages = nonSystemMessages.slice(0, -preserveRecent);

      // Generate summary
      const summary = await this.generateSummary(olderMessages, summaryBudget);

      // Add summary as a system-like message
      result.push({
        role: 'assistant',
        content: `[Previous conversation summary: ${summary}]`,
      });
      currentTokens += tokenCounter.count(summary) + 10;
    }

    // Add recent messages
    result.push(...recentMessages);
    currentTokens += recentTokens;

    return {
      messages: result,
      originalTokens,
      compressedTokens: currentTokens,
      ratio: currentTokens / originalTokens,
    };
  }

  private async generateSummary(messages: ChatMessage[], maxTokens: number): Promise<string> {
    if (this.summarizer) {
      return this.summarizer(messages);
    }

    // Default: extract key points
    const points: string[] = [];
    for (const msg of messages) {
      const content = extractTextContent(msg.content);
      if (content.length > 100) {
        points.push(`${msg.role}: ${content.slice(0, 100)}...`);
      }
    }

    const summary = points.join(' | ');
    // Truncate if too long
    const tokenCounter = new SimpleTokenCounter();
    if (tokenCounter.count(summary) > maxTokens) {
      return summary.slice(0, maxTokens * 4);
    }
    return summary;
  }
}

/**
 * Selective compressor - keeps messages based on importance scoring
 */
export class SelectiveCompressor implements ContextCompressor {
  readonly strategy: CompressionStrategy = 'selective';

  async compress(
    messages: ChatMessage[],
    maxTokens: number,
    options?: CompressionOptions
  ): Promise<CompressionResult> {
    const tokenCounter = new SimpleTokenCounter();
    const originalTokens = tokenCounter.countMessages(messages);

    if (originalTokens <= maxTokens) {
      return {
        messages,
        originalTokens,
        compressedTokens: originalTokens,
        ratio: 1,
      };
    }

    // Score messages
    const scorer = options?.importanceScorer || this.defaultImportanceScorer;
    const scoredMessages = messages.map((msg, index) => ({
      message: msg,
      score: scorer(msg),
      index,
    }));

    // Always keep system messages
    const systemMessages = scoredMessages.filter((m) => m.message.role === 'system');
    const nonSystemMessages = scoredMessages.filter((m) => m.message.role !== 'system');

    // Preserve recent messages
    const preserveRecent = options?.preserveRecent || 2;
    const recentMessages = nonSystemMessages.slice(-preserveRecent);
    const olderMessages = nonSystemMessages.slice(0, -preserveRecent || undefined);

    // Sort older messages by score
    olderMessages.sort((a, b) => b.score - a.score);

    // Build result
    const result: Array<{ message: ChatMessage; index: number }> = [...systemMessages];
    let currentTokens = tokenCounter.countMessages(systemMessages.map((m) => m.message));

    // Add recent messages first
    const recentTokens = tokenCounter.countMessages(recentMessages.map((m) => m.message));
    currentTokens += recentTokens;

    // Add older messages by importance until budget exhausted
    for (const scored of olderMessages) {
      const msgTokens = tokenCounter.countMessages([scored.message]);
      if (currentTokens + msgTokens > maxTokens - recentTokens) break;
      result.push(scored);
      currentTokens += msgTokens;
    }

    // Add recent messages
    result.push(...recentMessages);

    // Sort by original index
    result.sort((a, b) => a.index - b.index);

    return {
      messages: result.map((r) => r.message),
      originalTokens,
      compressedTokens: currentTokens,
      ratio: currentTokens / originalTokens,
    };
  }

  private defaultImportanceScorer(message: ChatMessage): number {
    const content = extractTextContent(message.content);
    let score = 0;

    // System messages are most important
    if (message.role === 'system') score += 100;

    // Tool calls are important
    if (message.toolCalls && message.toolCalls.length > 0) score += 50;

    // Messages with code blocks
    if (content.includes('```')) score += 30;

    // Messages with decisions or actions
    const actionWords = ['决定', '选择', '创建', '删除', 'create', 'delete', 'update', 'add'];
    for (const word of actionWords) {
      if (content.toLowerCase().includes(word)) score += 10;
    }

    // Longer messages might be more informative
    score += Math.min(content.length / 100, 20);

    return score;
  }
}

/**
 * Context manager implementation
 */
export class ContextManager implements IContextManager {
  private messages: ChatMessage[] = [];
  private config: ContextManagerConfig;
  private compressor: ContextCompressor;

  constructor(config: ContextManagerConfig) {
    this.config = config;
    this.compressor = new SlidingWindowCompressor();
  }

  add(message: ChatMessage): void {
    this.messages.push(message);
  }

  async getMessages(): Promise<ChatMessage[]> {
    const currentTokens = this.config.tokenCounter.countMessages(this.messages);
    const targetTokens = this.config.maxTokens - this.config.reservedTokens;

    if (currentTokens <= targetTokens) {
      return [...this.messages];
    }

    const result = await this.compressor.compress(this.messages, targetTokens, {
      preserveSystem: true,
      preserveRecent: 4,
    });

    return result.messages;
  }

  async compress(messages: ChatMessage[]): Promise<ChatMessage[]> {
    const targetTokens = this.config.maxTokens - this.config.reservedTokens;
    const currentTokens = this.config.tokenCounter.countMessages(messages);

    if (currentTokens <= targetTokens) {
      return messages;
    }

    const result = await this.compressor.compress(messages, targetTokens, {
      preserveSystem: true,
      preserveRecent: 4,
    });

    return result.messages;
  }

  getTokenCount(): number {
    return this.config.tokenCounter.countMessages(this.messages);
  }

  clear(): void {
    this.messages = [];
  }
}
