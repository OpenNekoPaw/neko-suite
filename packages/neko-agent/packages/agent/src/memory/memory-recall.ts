/**
 * Memory Recall — Project-memory retrieval with relevance scoring
 *
 * Queries project memory sections, scores them by keyword overlap, and returns
 * the top-N items for prompt injection.
 */

import type { IProjectMemoryManager } from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

export interface MemoryRecallOptions {
  /** Project-scoped memory (.neko/memory.md) */
  projectMemory?: IProjectMemoryManager;
}

export interface RecalledMemory {
  /** Which layer the memory came from */
  source: 'project';
  /** Memory content */
  content: string;
  /** Relevance score 0-1 */
  relevance: number;
}

// =============================================================================
// Recall
// =============================================================================

/**
 * Project-memory recall with keyword-based relevance.
 *
 * Retrieval strategy:
 * 1. Parse `.neko/memory.md` into H2 sections
 * 2. Score each section by keyword overlap with the query
 * 3. Sort by relevance, return top-N
 */
export class MemoryRecall {
  private readonly _project: IProjectMemoryManager | undefined;

  constructor(options: MemoryRecallOptions) {
    this._project = options.projectMemory;
  }

  /**
   * Recall relevant memories from configured layers.
   *
   * @param query Search query (typically user input)
   * @param limit Max results to return (default: 5)
   */
  async recall(query: string, limit = 5): Promise<RecalledMemory[]> {
    if (!this._project) {
      return [];
    }

    const results: RecalledMemory[] = [];
    const sections = this._parseMarkdownSections(this._project.getContent());
    for (const section of sections) {
      const relevance = this._computeRelevance(query, section);
      if (relevance > 0.1) {
        results.push({ source: 'project', content: section, relevance });
      }
    }

    // Sort by relevance (descending), return top N
    return results.sort((a, b) => b.relevance - a.relevance).slice(0, limit);
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  /**
   * Compute relevance score based on keyword overlap.
   *
   * @param query User query
   * @param content Memory content
   */
  private _computeRelevance(query: string, content: string): number {
    const queryWords = this._tokenize(query);
    const contentWords = this._tokenize(content);

    if (queryWords.length === 0 || contentWords.length === 0) return 0;

    // Keyword overlap ratio
    const contentSet = new Set(contentWords);
    let matches = 0;
    for (const word of queryWords) {
      if (contentSet.has(word)) matches++;
    }

    return matches / queryWords.length;
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
