/**
 * Memory Recall — Three-layer memory retrieval with relevance scoring
 *
 * Queries Session, Project, and Global memory layers, merges results
 * by relevance score, and returns top-N items for prompt injection.
 */

import type { SessionMemory as ISessionMemory, IProjectMemoryManager } from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

export interface MemoryRecallOptions {
  /** Session-scoped memory (KeyFact store) */
  sessionMemory?: ISessionMemory;
  /** Project-scoped memory (.neko/memory.md) */
  projectMemory?: IProjectMemoryManager;
  /** Global memory (~/.neko/global-memory.md) */
  globalMemory?: IProjectMemoryManager;
}

export interface RecalledMemory {
  /** Which layer the memory came from */
  source: 'session' | 'project' | 'global';
  /** Memory content */
  content: string;
  /** Relevance score 0-1 */
  relevance: number;
}

// =============================================================================
// Recall
// =============================================================================

/**
 * Three-layer memory recall with keyword-based relevance.
 *
 * Retrieval strategy:
 * 1. Session: search KeyFact entries by query
 * 2. Project/Global: parse H2 sections, keyword match
 * 3. Merge all results, sort by relevance, return top-N
 */
export class MemoryRecall {
  private readonly _session: ISessionMemory | undefined;
  private readonly _project: IProjectMemoryManager | undefined;
  private readonly _global: IProjectMemoryManager | undefined;

  constructor(options: MemoryRecallOptions) {
    this._session = options.sessionMemory;
    this._project = options.projectMemory;
    this._global = options.globalMemory;
  }

  /**
   * Recall relevant memories from all layers.
   *
   * @param query Search query (typically user input)
   * @param limit Max results to return (default: 5)
   */
  async recall(query: string, limit = 5): Promise<RecalledMemory[]> {
    const results: RecalledMemory[] = [];

    // 1. Session layer — KeyFact search
    if (this._session) {
      const entries = await this._session.search(query, limit);
      for (const entry of entries) {
        for (const fact of entry.keyFacts) {
          const relevance = this._computeRelevance(query, fact.content, fact.timestamp);
          results.push({ source: 'session', content: fact.content, relevance });
        }
        if (entry.summary) {
          results.push({
            source: 'session',
            content: entry.summary,
            relevance: this._computeRelevance(query, entry.summary, entry.updatedAt),
          });
        }
      }
    }

    // 2. Project layer — H2 section search
    if (this._project) {
      const sections = this._parseMarkdownSections(this._project.getContent());
      for (const section of sections) {
        const relevance = this._computeRelevance(query, section);
        if (relevance > 0.1) {
          results.push({ source: 'project', content: section, relevance });
        }
      }
    }

    // 3. Global layer — H2 section search
    if (this._global) {
      const sections = this._parseMarkdownSections(this._global.getContent());
      for (const section of sections) {
        const relevance = this._computeRelevance(query, section);
        if (relevance > 0.1) {
          results.push({ source: 'global', content: section, relevance });
        }
      }
    }

    // Sort by relevance (descending), return top N
    return results.sort((a, b) => b.relevance - a.relevance).slice(0, limit);
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  /**
   * Compute relevance score based on keyword overlap + optional time decay.
   *
   * @param query User query
   * @param content Memory content
   * @param timestamp Optional timestamp for time decay
   */
  private _computeRelevance(query: string, content: string, timestamp?: number): number {
    const queryWords = this._tokenize(query);
    const contentWords = this._tokenize(content);

    if (queryWords.length === 0 || contentWords.length === 0) return 0;

    // Keyword overlap ratio
    const contentSet = new Set(contentWords);
    let matches = 0;
    for (const word of queryWords) {
      if (contentSet.has(word)) matches++;
    }
    const overlap = matches / queryWords.length;

    // Time decay factor (half-life of 1 hour for session memories)
    let timeFactor = 1;
    if (timestamp) {
      const ageMs = Date.now() - timestamp;
      const halfLifeMs = 3600 * 1000; // 1 hour
      timeFactor = Math.pow(0.5, ageMs / halfLifeMs);
      // Clamp to [0.1, 1] — old memories still somewhat relevant
      timeFactor = Math.max(0.1, Math.min(1, timeFactor));
    }

    return overlap * timeFactor;
  }

  /** Simple tokenization: lowercase, split on whitespace/CJK boundaries */
  private _tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[\s,;.!?，。！？；、]+/)
      .filter((w) => w.length > 1);
  }

  /** Parse markdown content into H2 sections (heading + body) */
  private _parseMarkdownSections(content: string | null): string[] {
    if (!content) return [];

    const sections: string[] = [];
    const lines = content.split('\n');
    let current: string[] = [];

    for (const line of lines) {
      if (line.startsWith('## ')) {
        if (current.length > 0) {
          sections.push(current.join('\n').trim());
        }
        current = [line];
      } else if (current.length > 0) {
        current.push(line);
      }
    }

    if (current.length > 0) {
      sections.push(current.join('\n').trim());
    }

    return sections;
  }
}
