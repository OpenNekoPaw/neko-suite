/**
 * Session Memory - Persistent memory for session facts and long-term storage
 */

import type {
  ChatMessage,
  KeyFact,
  SessionMemoryEntry,
  SessionMemory as ISessionMemory,
} from '@neko/shared';

/**
 * In-memory session memory implementation
 */
export class InMemorySessionMemory implements ISessionMemory {
  private entries: Map<string, SessionMemoryEntry> = new Map();
  private conversationHistory: ChatMessage[] = [];

  async getEntries(limit?: number): Promise<SessionMemoryEntry[]> {
    const entries = Array.from(this.entries.values()).sort((a, b) => b.updatedAt - a.updatedAt);

    return limit ? entries.slice(0, limit) : entries;
  }

  async getHistory(): Promise<ChatMessage[]> {
    return [...this.conversationHistory];
  }

  async addMessage(message: ChatMessage): Promise<void> {
    this.conversationHistory.push(message);
  }

  async saveSession(sessionId: string, facts: KeyFact[], summary?: string): Promise<void> {
    const now = Date.now();
    const existing = this.entries.get(sessionId);

    this.entries.set(sessionId, {
      sessionId,
      keyFacts: facts,
      summary,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
  }

  async search(query: string, limit?: number): Promise<SessionMemoryEntry[]> {
    const queryLower = query.toLowerCase();
    const results = Array.from(this.entries.values())
      .filter((entry) => {
        const text = [entry.summary || '', ...entry.keyFacts.map((f) => f.content)]
          .join(' ')
          .toLowerCase();
        return text.includes(queryLower);
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);

    return limit ? results.slice(0, limit) : results;
  }

  async clear(): Promise<void> {
    this.entries.clear();
    this.conversationHistory = [];
  }
}

/**
 * Key fact extractor configuration
 */
export interface KeyFactExtractorConfig {
  /** Minimum confidence threshold for facts (0-1) */
  minConfidence?: number;
  /** Maximum number of facts per category */
  maxFactsPerCategory?: number;
}

/**
 * Pattern-based key fact extraction rule
 */
interface ExtractionRule {
  pattern: RegExp;
  category: KeyFact['category'];
  confidence: number;
}

/**
 * Key fact extractor - extracts important facts from conversations
 */
export class KeyFactExtractor {
  private config: Required<KeyFactExtractorConfig>;
  private rules: ExtractionRule[];

  constructor(config: KeyFactExtractorConfig = {}) {
    this.config = {
      minConfidence: config.minConfidence ?? 0.5,
      maxFactsPerCategory: config.maxFactsPerCategory ?? 10,
    };

    // Default extraction rules
    this.rules = [
      // Preferences
      {
        pattern: /(?:prefer|喜欢|偏好)(?:s?)\s*(.+?)(?:\.|$|。)/i,
        category: 'preference',
        confidence: 0.8,
      },
      { pattern: /(?:like|want|想要)\s*(.+?)(?:\.|$|。)/i, category: 'preference', confidence: 0.7 },
      {
        pattern: /(?:don't like|不喜欢|不想)\s*(.+?)(?:\.|$|。)/i,
        category: 'preference',
        confidence: 0.8,
      },

      // Decisions
      {
        pattern: /(?:decide|决定|选择)(?:d?)\s*(?:to\s+)?(.+?)(?:\.|$|。)/i,
        category: 'decision',
        confidence: 0.85,
      },
      {
        pattern: /(?:let's|we should|我们应该)\s*(.+?)(?:\.|$|。)/i,
        category: 'decision',
        confidence: 0.7,
      },
      { pattern: /(?:chose|确定)\s*(.+?)(?:\.|$|。)/i, category: 'decision', confidence: 0.8 },

      // Actions
      {
        pattern: /(?:create|创建|添加|add)(?:d?)\s*(.+?)(?:\.|$|。)/i,
        category: 'action',
        confidence: 0.9,
      },
      {
        pattern: /(?:delete|删除|remove)(?:d?)\s*(.+?)(?:\.|$|。)/i,
        category: 'action',
        confidence: 0.9,
      },
      {
        pattern: /(?:update|更新|modify|修改)(?:d?)\s*(.+?)(?:\.|$|。)/i,
        category: 'action',
        confidence: 0.85,
      },
      {
        pattern: /(?:import|导入)(?:ed?)\s*(.+?)(?:\.|$|。)/i,
        category: 'action',
        confidence: 0.85,
      },
      {
        pattern: /(?:export|导出)(?:ed?)\s*(.+?)(?:\.|$|。)/i,
        category: 'action',
        confidence: 0.85,
      },

      // Context
      {
        pattern: /(?:project|项目)(?:\s+is)?\s*(?:named?|叫|名为)\s*(.+?)(?:\.|$|。)/i,
        category: 'context',
        confidence: 0.9,
      },
      {
        pattern: /(?:timeline|时间线)\s*(?:has)?\s*(\d+\s*(?:tracks?|轨道))/i,
        category: 'context',
        confidence: 0.95,
      },
      {
        pattern: /(?:duration|时长|长度)(?:\s+is)?\s*(.+?)(?:\.|$|。)/i,
        category: 'context',
        confidence: 0.9,
      },
    ];
  }

  /**
   * Extract key facts from messages
   */
  extract(messages: ChatMessage[]): KeyFact[] {
    const facts: KeyFact[] = [];
    const now = Date.now();

    for (const message of messages) {
      const content = this.getMessageContent(message);
      if (!content) continue;

      for (const rule of this.rules) {
        const matches = content.match(rule.pattern);
        if (matches?.[1]) {
          const factContent = matches[1].trim();
          if (factContent.length > 3 && factContent.length < 200) {
            facts.push({
              content: this.formatFactContent(factContent, rule.category),
              category: rule.category,
              timestamp: now,
              confidence: rule.confidence,
            });
          }
        }
      }
    }

    // Filter and deduplicate
    return this.filterAndDeduplicate(facts);
  }

  /**
   * Extract facts from a single message
   */
  extractFromMessage(message: ChatMessage): KeyFact[] {
    return this.extract([message]);
  }

  /**
   * Add custom extraction rule
   */
  addRule(pattern: RegExp, category: KeyFact['category'], confidence: number): void {
    this.rules.push({ pattern, category, confidence });
  }

  /**
   * Get message content as string
   */
  private getMessageContent(message: ChatMessage): string {
    if (typeof message.content === 'string') {
      return message.content;
    }
    return message.content
      .filter((p) => p.type === 'text')
      .map((p) => (p as { type: 'text'; text: string }).text)
      .join(' ');
  }

  /**
   * Format fact content for storage
   */
  private formatFactContent(content: string, category: KeyFact['category']): string {
    // Capitalize first letter
    const formatted = content.charAt(0).toUpperCase() + content.slice(1);

    // Add context prefix based on category
    switch (category) {
      case 'preference':
        return `User preference: ${formatted}`;
      case 'decision':
        return `Decision: ${formatted}`;
      case 'action':
        return `Action taken: ${formatted}`;
      case 'context':
        return `Context: ${formatted}`;
      default:
        return formatted;
    }
  }

  /**
   * Filter facts by confidence and deduplicate
   */
  private filterAndDeduplicate(facts: KeyFact[]): KeyFact[] {
    // Filter by confidence
    const filtered = facts.filter((f) => f.confidence >= this.config.minConfidence);

    // Deduplicate by content similarity
    const seen = new Set<string>();
    const deduplicated: KeyFact[] = [];

    for (const fact of filtered) {
      const normalized = fact.content.toLowerCase().replace(/\s+/g, ' ');
      if (!seen.has(normalized)) {
        seen.add(normalized);
        deduplicated.push(fact);
      }
    }

    // Limit per category
    const byCategory = new Map<string, KeyFact[]>();
    for (const fact of deduplicated) {
      const existing = byCategory.get(fact.category) || [];
      if (existing.length < this.config.maxFactsPerCategory) {
        existing.push(fact);
        byCategory.set(fact.category, existing);
      }
    }

    // Flatten and sort by confidence
    return Array.from(byCategory.values())
      .flat()
      .sort((a, b) => b.confidence - a.confidence);
  }
}
