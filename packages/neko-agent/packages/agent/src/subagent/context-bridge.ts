/**
 * Context Bridge - Manages context passing between parent and child agents
 *
 * Features:
 * - Extract relevant context summary from parent
 * - Merge SubAgent results back into parent context
 * - Token-aware truncation
 */

import type { ContextExtractionOptions, IContextBridge } from './types';
import { getSubAgentPromptLabels } from './subagent-localization';

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_MAX_TOKENS = 2000;
const DEFAULT_INCLUDE_RECENT_MESSAGES = 5;

// Rough estimate: 1 token ≈ 4 characters
const CHARS_PER_TOKEN = 4;

// =============================================================================
// Context Bridge Implementation
// =============================================================================

/**
 * Context Bridge
 *
 * Handles context extraction and result merging for SubAgents.
 */
export class ContextBridge implements IContextBridge {
  /**
   * Extract summary from parent context for SubAgent
   */
  extractSummary(
    messages: Array<{ role: string; content: string | unknown }>,
    options: ContextExtractionOptions = {},
  ): string {
    const {
      maxTokens = DEFAULT_MAX_TOKENS,
      includeSystemPrompt = false,
      includeRecentMessages = DEFAULT_INCLUDE_RECENT_MESSAGES,
      locale,
    } = options;
    const labels = getSubAgentPromptLabels(locale);

    const maxChars = maxTokens * CHARS_PER_TOKEN;
    const parts: string[] = [];

    // Extract system prompt if requested
    if (includeSystemPrompt) {
      const systemMsg = messages.find((m) => m.role === 'system');
      if (systemMsg) {
        const content = this.extractContent(systemMsg.content);
        parts.push(`## ${labels.systemContext}\n${this.truncate(content, 500)}`);
      }
    }

    // Extract recent messages (excluding system)
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');
    const recentMessages = nonSystemMessages.slice(-includeRecentMessages);

    if (recentMessages.length > 0) {
      parts.push(`## ${labels.recentConversation}`);
      for (const msg of recentMessages) {
        const content = this.extractContent(msg.content);
        const roleLabel = this.formatRole(msg.role, locale);
        parts.push(`[${roleLabel}]: ${this.truncate(content, 300)}`);
      }
    }

    const summary = parts.join('\n\n');
    return this.truncate(summary, maxChars);
  }

  /**
   * Merge SubAgent results into parent context
   */
  mergeResults(
    parentMessages: Array<{ role: string; content: string }>,
    subAgentResults: Array<{ id: string; response: string; name?: string }>,
    locale?: string,
  ): Array<{ role: string; content: string }> {
    if (subAgentResults.length === 0) {
      return parentMessages;
    }

    const resultSummary = subAgentResults
      .map((r) => {
        const header = r.name ? `SubAgent: ${r.name}` : `SubAgent ${r.id}`;
        return `### ${header}\n${r.response}`;
      })
      .join('\n\n');

    const assistantMessage = {
      role: 'assistant',
      content: `${getSubAgentPromptLabels(locale).completedSubtasks}\n\n${resultSummary}`,
    };

    return [...parentMessages, assistantMessage];
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Extract string content from message content
   */
  private extractContent(content: string | unknown): string {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      // Handle content parts (e.g., [{ type: 'text', text: '...' }])
      return content
        .filter(
          (part): part is { type: 'text'; text: string } =>
            typeof part === 'object' &&
            part !== null &&
            'type' in part &&
            part.type === 'text' &&
            'text' in part,
        )
        .map((part) => part.text)
        .join('\n');
    }

    if (typeof content === 'object' && content !== null) {
      return JSON.stringify(content);
    }

    return String(content);
  }

  /**
   * Format role for display
   */
  private formatRole(role: string, locale: string | undefined): string {
    return getSubAgentPromptLabels(locale).roleLabels[role] || role;
  }

  /**
   * Truncate text to max length
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.slice(0, maxLength - 3) + '...';
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a context bridge instance
 */
export function createContextBridge(): IContextBridge {
  return new ContextBridge();
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Estimate token count for text
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Create a context summary for SubAgent
 *
 * Convenience function that creates a ContextBridge and extracts summary.
 */
export function createContextSummaryForSubAgent(
  messages: Array<{ role: string; content: string | unknown }>,
  options?: ContextExtractionOptions,
): string {
  const bridge = new ContextBridge();
  return bridge.extractSummary(messages, options);
}
