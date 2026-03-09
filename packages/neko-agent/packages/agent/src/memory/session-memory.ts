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
