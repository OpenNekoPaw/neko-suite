/**
 * KeyFact Extractor — Heuristic-based fact extraction from conversations
 *
 * Extracts key facts (preferences, decisions, actions) from recent ChatMessages
 * using keyword matching. No LLM calls — pure heuristic approach for speed.
 *
 * Reuses the Chinese/English keyword pattern from creative-version-log's
 * detectEvaluation() for bilingual support.
 */

import type { ChatMessage, KeyFact } from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

export interface KeyFactExtractorOptions {
  /** Maximum number of facts to keep (default: 10) */
  maxFacts?: number;
  /** Minimum confidence threshold for extraction (default: 0.5) */
  minConfidence?: number;
}

// =============================================================================
// Keyword Patterns (Chinese + English)
// =============================================================================

/** Keywords signaling user preference */
const PREFERENCE_KEYWORDS: readonly string[] = [
  // Chinese
  '喜欢',
  '偏好',
  '习惯',
  '风格',
  '倾向',
  '不喜欢',
  '讨厌',
  '避免',
  '总是',
  '从不',
  '一般',
  '通常',
  // English
  'prefer',
  'like',
  'dislike',
  'always',
  'never',
  'usually',
  'favorite',
  'style',
  'habit',
  'avoid',
  'hate',
];

/** Keywords signaling a decision */
const DECISION_KEYWORDS: readonly string[] = [
  // Chinese
  '决定',
  '选择',
  '确定',
  '方案',
  '采用',
  '就这样',
  '用这个',
  '改成',
  '换成',
  '使用',
  // English
  'decide',
  'choose',
  'select',
  'go with',
  'switch to',
  'use this',
  "let's use",
  "we'll use",
  'change to',
];

/** Keywords signaling context / background info */
const CONTEXT_KEYWORDS: readonly string[] = [
  // Chinese
  '项目',
  '需求',
  '目标',
  '背景',
  '原因',
  '因为',
  '所以',
  '约束',
  '限制',
  '要求',
  // English
  'project',
  'requirement',
  'goal',
  'because',
  'reason',
  'constraint',
  'limitation',
  'must',
  'should',
];

// =============================================================================
// Extractor
// =============================================================================

/**
 * Heuristic KeyFact extractor.
 *
 * Scans recent user messages for keywords indicating preferences,
 * decisions, and contextual facts. De-duplicates against existing facts.
 */
export class KeyFactExtractor {
  private readonly _maxFacts: number;
  private readonly _minConfidence: number;

  constructor(options?: KeyFactExtractorOptions) {
    this._maxFacts = options?.maxFacts ?? 10;
    this._minConfidence = options?.minConfidence ?? 0.5;
  }

  /**
   * Extract key facts from recent messages.
   *
   * @param messages Recent conversation messages
   * @param existingFacts Previously extracted facts (for dedup)
   * @returns Newly extracted facts (excludes duplicates)
   */
  extract(messages: ChatMessage[], existingFacts?: KeyFact[]): KeyFact[] {
    const userMessages = messages
      .filter((m) => m.role === 'user' && typeof m.content === 'string')
      .slice(-10); // Only scan last 10 user messages

    const candidates: KeyFact[] = [];
    const now = Date.now();

    for (const msg of userMessages) {
      const text = msg.content as string;
      if (text.length < 5) continue; // Skip trivially short messages

      // Check preference keywords
      if (this._matchesAny(text, PREFERENCE_KEYWORDS)) {
        candidates.push({
          content: this._truncate(text),
          category: 'preference',
          timestamp: now,
          confidence: 0.8,
        });
        continue; // One fact per message
      }

      // Check decision keywords
      if (this._matchesAny(text, DECISION_KEYWORDS)) {
        candidates.push({
          content: this._truncate(text),
          category: 'decision',
          timestamp: now,
          confidence: 0.7,
        });
        continue;
      }

      // Check context keywords
      if (this._matchesAny(text, CONTEXT_KEYWORDS)) {
        candidates.push({
          content: this._truncate(text),
          category: 'context',
          timestamp: now,
          confidence: 0.6,
        });
        continue;
      }
    }

    // Extract successful tool actions from assistant messages
    const toolActions = this._extractToolActions(messages, now);
    candidates.push(...toolActions);

    // Filter by confidence threshold
    const filtered = candidates.filter((f) => f.confidence >= this._minConfidence);

    // Deduplicate against existing facts
    const deduped = existingFacts ? this._dedup(filtered, existingFacts) : filtered;

    // Return top N by confidence
    return deduped.sort((a, b) => b.confidence - a.confidence).slice(0, this._maxFacts);
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  /** Check if text contains any keyword from the list */
  private _matchesAny(text: string, keywords: readonly string[]): boolean {
    const lower = text.toLowerCase();
    return keywords.some((kw) => lower.includes(kw.toLowerCase()));
  }

  /** Truncate text to a reasonable length for storage */
  private _truncate(text: string, maxLen = 200): string {
    return text.length > maxLen ? text.slice(0, maxLen - 3) + '...' : text;
  }

  /** Extract facts from successful tool calls */
  private _extractToolActions(messages: ChatMessage[], now: number): KeyFact[] {
    const facts: KeyFact[] = [];
    const toolMessages = messages.filter((m) => m.role === 'tool' && typeof m.content === 'string');

    for (const msg of toolMessages.slice(-5)) {
      const content = msg.content as string;
      // Only record successful tool results (no error indicators)
      if (
        content.length > 10 &&
        !content.toLowerCase().includes('error') &&
        !content.toLowerCase().includes('failed')
      ) {
        facts.push({
          content: `Tool result: ${this._truncate(content, 100)}`,
          category: 'action',
          timestamp: now,
          confidence: 0.6,
        });
      }
    }

    return facts;
  }

  /** Deduplicate: skip candidates with >80% content overlap with existing */
  private _dedup(candidates: KeyFact[], existing: KeyFact[]): KeyFact[] {
    return candidates.filter((candidate) => {
      return !existing.some((ex) => this._similarity(candidate.content, ex.content) > 0.8);
    });
  }

  /** Simple Jaccard similarity on word sets */
  private _similarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    if (wordsA.size === 0 && wordsB.size === 0) return 1;

    let intersection = 0;
    wordsA.forEach((w) => {
      if (wordsB.has(w)) intersection++;
    });

    const union = wordsA.size + wordsB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }
}
