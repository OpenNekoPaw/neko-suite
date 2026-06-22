/**
 * LLM Summarizer Implementation
 *
 * Provides LLM-based summarization for conversation compression.
 */

import type {
  ChatMessage,
  SummarizationRequest,
  SummarizationResult,
  ISummarizer,
  IService,
} from '@neko/shared';
import { getLogger } from '../utils/logger';

const logger = getLogger('LLMSummarizer');

/**
 * LLM Summarizer configuration
 */
export interface LLMSummarizerConfig {
  /** Provider to use for summarization */
  provider?: string;
  /** Model to use for summarization */
  model?: string;
  /** Temperature for summarization (lower = more focused) */
  temperature: number;
  /** System prompt for summarization */
  systemPrompt: string;
  /** Whether to extract key points */
  extractKeyPoints: boolean;
  /** Whether to extract entities */
  extractEntities: boolean;
  /** Maximum retries on failure */
  maxRetries: number;
}

/**
 * Default summarizer configuration
 */
export const DEFAULT_SUMMARIZER_CONFIG: LLMSummarizerConfig = {
  temperature: 0.3,
  systemPrompt: `You are a conversation summarizer. Your task is to create concise summaries of conversation segments.

Guidelines:
1. Focus on key decisions, actions taken, and important information exchanged
2. Preserve technical details that may be needed later
3. Note any unresolved questions or pending tasks
4. Keep the summary factual and objective
5. Use bullet points for clarity when appropriate

Output format:
- Start with a brief overview (1-2 sentences)
- List key points
- Note any important entities (files, functions, concepts) mentioned
- End with any pending items or unresolved questions`,
  extractKeyPoints: true,
  extractEntities: true,
  maxRetries: 2,
};

/**
 * Simple token estimator
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * LLM-based summarizer implementation
 */
export class LLMSummarizer implements ISummarizer {
  /** LLM service */
  private service: IService;

  /** Configuration */
  private config: LLMSummarizerConfig;

  constructor(service: IService, config?: Partial<LLMSummarizerConfig>) {
    this.service = service;
    this.config = { ...DEFAULT_SUMMARIZER_CONFIG, ...config };
  }

  /**
   * Configure the summarizer
   */
  configure(config: Partial<LLMSummarizerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Summarize messages
   */
  async summarize(request: SummarizationRequest): Promise<SummarizationResult> {
    const { messages, maxTokens, contextHint } = request;

    // Build the prompt
    const conversationText = this.formatMessagesForSummary(messages);
    const userPrompt = this.buildSummarizationPrompt(conversationText, maxTokens, contextHint);

    // Call LLM
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await this.service.chat(
          [
            { role: 'system', content: this.config.systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          {
            temperature: this.config.temperature,
            maxTokens: maxTokens + 200, // Extra for formatting
            providerId: this.config.provider,
            modelId: this.config.model,
          },
        );

        // Parse the response
        const content =
          typeof response.message.content === 'string' ? response.message.content : '';
        return this.parseResponse(content, maxTokens);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn('Summarization attempt failed', {
          attempt: attempt + 1,
          error: lastError.message,
        });
      }
    }

    // All retries failed - return a fallback summary
    logger.error('All attempts failed, using fallback');
    return this.createFallbackSummary(messages, maxTokens);
  }

  /**
   * Format messages for summarization
   */
  private formatMessagesForSummary(messages: ChatMessage[]): string {
    const parts: string[] = [];

    for (const msg of messages) {
      const content =
        typeof msg.content === 'string'
          ? msg.content
          : msg.content
              .map((part) => ('text' in part ? part.text : '[non-text content]'))
              .join('\n');

      const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
      parts.push(`[${role}]: ${content}`);
    }

    return parts.join('\n\n');
  }

  /**
   * Build the summarization prompt
   */
  private buildSummarizationPrompt(
    conversationText: string,
    maxTokens: number,
    contextHint?: string,
  ): string {
    let prompt = `Please summarize the following conversation segment.\n\n`;

    if (contextHint) {
      prompt += `Context: ${contextHint}\n\n`;
    }

    prompt += `Target summary length: approximately ${maxTokens} tokens (${maxTokens * 4} characters)\n\n`;
    prompt += `Conversation:\n---\n${conversationText}\n---\n\n`;

    if (this.config.extractKeyPoints) {
      prompt += `Please include a "Key Points:" section with bullet points.\n`;
    }

    if (this.config.extractEntities) {
      prompt += `Please include an "Entities:" section listing important files, functions, or concepts mentioned.\n`;
    }

    return prompt;
  }

  /**
   * Parse the LLM response into a structured result
   */
  private parseResponse(content: string, maxTokens: number): SummarizationResult {
    // Extract key points if present
    const keyPoints: string[] = [];
    const keyPointsMatch = content.match(/Key Points?:?\s*([\s\S]*?)(?=Entities?:|$)/i);
    if (keyPointsMatch) {
      const pointsText = keyPointsMatch[1];
      const points = pointsText.match(/[-•*]\s*(.+)/g);
      if (points) {
        keyPoints.push(...points.map((p) => p.replace(/^[-•*]\s*/, '').trim()));
      }
    }

    // Extract entities if present
    const entities: string[] = [];
    const entitiesMatch = content.match(/Entities?:?\s*([\s\S]*?)$/i);
    if (entitiesMatch) {
      const entitiesText = entitiesMatch[1];
      const entityList = entitiesText.match(/[-•*]\s*(.+)/g);
      if (entityList) {
        entities.push(...entityList.map((e) => e.replace(/^[-•*]\s*/, '').trim()));
      }
    }

    // Get the main summary (everything before Key Points or the whole thing)
    let summary = content;
    const keyPointsIndex = content.search(/Key Points?:/i);
    if (keyPointsIndex > 0) {
      summary = content.substring(0, keyPointsIndex).trim();
    }

    // Truncate if too long
    const tokenCount = estimateTokens(summary);
    if (tokenCount > maxTokens) {
      const targetLength = maxTokens * 4;
      summary = summary.substring(0, targetLength) + '...';
    }

    return {
      summary,
      source: 'llm',
      degraded: false,
      tokenCount: estimateTokens(summary),
      keyPoints,
      entities,
    };
  }

  /**
   * Create a fallback summary without LLM
   */
  private createFallbackSummary(messages: ChatMessage[], maxTokens: number): SummarizationResult {
    const parts: string[] = [];
    let tokenCount = 0;
    const targetTokens = maxTokens * 0.8; // Leave some margin

    for (const msg of messages) {
      const content = typeof msg.content === 'string' ? msg.content : '[complex content]';
      const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;
      const line = `[${msg.role}]: ${preview}`;
      const lineTokens = estimateTokens(line);

      if (tokenCount + lineTokens > targetTokens) {
        break;
      }

      parts.push(line);
      tokenCount += lineTokens;
    }

    const summary = `[Fallback Summary - ${messages.length} messages]\n` + parts.join('\n');

    return {
      summary,
      source: 'fallback',
      degraded: true,
      tokenCount: estimateTokens(summary),
      keyPoints: [],
      entities: [],
    };
  }
}

/**
 * Factory function to create an LLM summarizer
 */
export function createLLMSummarizer(
  service: IService,
  config?: Partial<LLMSummarizerConfig>,
): ISummarizer {
  return new LLMSummarizer(service, config);
}
