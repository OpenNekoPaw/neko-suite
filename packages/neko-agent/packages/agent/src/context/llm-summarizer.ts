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
  /** Prompt language for model-facing summarization wrappers */
  locale?: string;
}

type LLMSummarizerPromptLocale = 'en' | 'zh';

const DEFAULT_SUMMARIZER_SYSTEM_PROMPT_EN = `You are a conversation summarizer. Your task is to create concise summaries of conversation segments.

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
- End with any pending items or unresolved questions`;

const DEFAULT_SUMMARIZER_SYSTEM_PROMPT_ZH = `你是一个对话摘要器，任务是为对话片段生成简洁摘要。

指南：
1. 聚焦关键决策、已执行操作和重要信息交换
2. 保留后续可能需要的技术细节
3. 记录未解决的问题或待办事项
4. 保持事实性和客观性
5. 适合时使用项目符号提升清晰度

输出格式：
- 先用 1-2 句话简要概述
- 列出关键点
- 记录提到的重要实体（文件、函数、概念）
- 最后列出待办事项或未解决问题`;

/**
 * Default summarizer configuration
 */
export const DEFAULT_SUMMARIZER_CONFIG: LLMSummarizerConfig = {
  temperature: 0.3,
  systemPrompt: DEFAULT_SUMMARIZER_SYSTEM_PROMPT_EN,
  extractKeyPoints: true,
  extractEntities: true,
  maxRetries: 2,
  locale: 'en',
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
    const locale = normalizeLLMSummarizerPromptLocale(request.locale ?? this.config.locale);

    // Build the prompt
    const conversationText = this.formatMessagesForSummary(messages, locale);
    const userPrompt = this.buildSummarizationPrompt(
      conversationText,
      maxTokens,
      locale,
      contextHint,
    );
    const systemPrompt = this.getSystemPrompt(locale);

    // Call LLM
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await this.service.chat(
          [
            { role: 'system', content: systemPrompt },
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
    return this.createFallbackSummary(messages, maxTokens, locale);
  }

  /**
   * Format messages for summarization
   */
  private formatMessagesForSummary(
    messages: ChatMessage[],
    locale: LLMSummarizerPromptLocale,
  ): string {
    const parts: string[] = [];

    for (const msg of messages) {
      const content =
        typeof msg.content === 'string'
          ? msg.content
          : msg.content
              .map((part) =>
                'text' in part
                  ? part.text
                  : locale === 'zh'
                    ? '[非文本内容]'
                    : '[non-text content]',
              )
              .join('\n');

      const role =
        locale === 'zh'
          ? getLLMSummarizerRoleLabel(msg.role)
          : msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
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
    locale: LLMSummarizerPromptLocale,
    contextHint?: string,
  ): string {
    if (locale === 'zh') {
      let prompt = `请总结以下对话片段。\n\n`;

      if (contextHint) {
        prompt += `上下文：${contextHint}\n\n`;
      }

      prompt += `目标摘要长度：约 ${maxTokens} tokens（${maxTokens * 4} 字符）\n\n`;
      prompt += `对话：\n---\n${conversationText}\n---\n\n`;

      if (this.config.extractKeyPoints) {
        prompt += `请包含“关键点：”小节，并使用项目符号。\n`;
      }

      if (this.config.extractEntities) {
        prompt += `请包含“实体：”小节，列出提到的重要文件、函数或概念。\n`;
      }

      return prompt;
    }

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
    const keyPointsMatch = content.match(
      /(?:Key Points?|关键点)[:：]?\s*([\s\S]*?)(?=Entities?:|实体[:：]?|$)/i,
    );
    if (keyPointsMatch) {
      const pointsText = keyPointsMatch[1];
      const points = pointsText.match(/[-•*]\s*(.+)/g);
      if (points) {
        keyPoints.push(...points.map((p) => p.replace(/^[-•*]\s*/, '').trim()));
      }
    }

    // Extract entities if present
    const entities: string[] = [];
    const entitiesMatch = content.match(/(?:Entities?|实体)[:：]?\s*([\s\S]*?)$/i);
    if (entitiesMatch) {
      const entitiesText = entitiesMatch[1];
      const entityList = entitiesText.match(/[-•*]\s*(.+)/g);
      if (entityList) {
        entities.push(...entityList.map((e) => e.replace(/^[-•*]\s*/, '').trim()));
      }
    }

    // Get the main summary (everything before Key Points or the whole thing)
    let summary = content;
    const keyPointsIndex = content.search(/(?:Key Points?|关键点)[:：]/i);
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
  private createFallbackSummary(
    messages: ChatMessage[],
    maxTokens: number,
    locale: LLMSummarizerPromptLocale,
  ): SummarizationResult {
    const parts: string[] = [];
    let tokenCount = 0;
    const targetTokens = maxTokens * 0.8; // Leave some margin

    for (const msg of messages) {
      const content =
        typeof msg.content === 'string'
          ? msg.content
          : locale === 'zh'
            ? '[复杂内容]'
            : '[complex content]';
      const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;
      const role = locale === 'zh' ? getLLMSummarizerRoleLabel(msg.role) : msg.role;
      const line = `[${role}]: ${preview}`;
      const lineTokens = estimateTokens(line);

      if (tokenCount + lineTokens > targetTokens) {
        break;
      }

      parts.push(line);
      tokenCount += lineTokens;
    }

    const summary =
      (locale === 'zh'
        ? `[降级摘要 - ${messages.length} 条消息]\n`
        : `[Fallback Summary - ${messages.length} messages]\n`) + parts.join('\n');

    return {
      summary,
      source: 'fallback',
      degraded: true,
      tokenCount: estimateTokens(summary),
      keyPoints: [],
      entities: [],
    };
  }

  private getSystemPrompt(locale: LLMSummarizerPromptLocale): string {
    const prompt = this.config.systemPrompt;
    if (
      prompt === DEFAULT_SUMMARIZER_SYSTEM_PROMPT_EN ||
      prompt === DEFAULT_SUMMARIZER_SYSTEM_PROMPT_ZH
    ) {
      return getDefaultLLMSummarizerSystemPrompt(locale);
    }
    return prompt;
  }
}

function normalizeLLMSummarizerPromptLocale(
  locale: string | undefined,
): LLMSummarizerPromptLocale {
  return locale?.trim().toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function getDefaultLLMSummarizerSystemPrompt(locale: LLMSummarizerPromptLocale): string {
  return locale === 'zh'
    ? DEFAULT_SUMMARIZER_SYSTEM_PROMPT_ZH
    : DEFAULT_SUMMARIZER_SYSTEM_PROMPT_EN;
}

function getLLMSummarizerRoleLabel(role: ChatMessage['role']): string {
  switch (role) {
    case 'system':
      return '系统';
    case 'user':
      return '用户';
    case 'assistant':
      return '助手';
    case 'tool':
      return '工具';
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
