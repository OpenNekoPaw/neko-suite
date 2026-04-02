/**
 * Creative Memory Hooks — Automatic memory recall + extraction per turn
 *
 * Implements ExecutorHooks to:
 * - onExecuteStart: recall relevant memories → inject into ephemeral prompt layer
 * - onExecuteEnd: extract KeyFacts from conversation → save to session memory
 */

import type {
  ExecutorHooks,
  AgentContext,
  AgentResult,
  SessionMemory as ISessionMemory,
} from '@neko/shared';
import type { ISystemPromptComposer } from '../prompt/system-prompt-composer-types';
import type { KeyFactExtractor } from './keyfact-extractor';
import type { MemoryRecall } from './memory-recall';

// =============================================================================
// Types
// =============================================================================

export interface CreativeMemoryHooksOptions {
  /** KeyFact extraction engine */
  extractor: KeyFactExtractor;
  /** Three-layer memory recall */
  recall: MemoryRecall;
  /** System prompt composer for injection */
  promptComposer: ISystemPromptComposer;
  /** Session memory for saving extracted facts */
  sessionMemory: ISessionMemory;
  /** Max recalled items to inject (default: 5) */
  maxRecallItems?: number;
  /** Session ID for fact storage (default: 'default') */
  sessionId?: string;
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * ExecutorHooks that bridge memory recall and extraction into the agent loop.
 *
 * - Before each execution: recall relevant memories, inject as ephemeral prompt section
 * - After each execution: extract key facts, persist to session memory
 */
export class CreativeMemoryHooks implements ExecutorHooks {
  readonly name = 'creative-memory';

  private readonly _extractor: KeyFactExtractor;
  private readonly _recall: MemoryRecall;
  private readonly _promptComposer: ISystemPromptComposer;
  private readonly _sessionMemory: ISessionMemory;
  private readonly _maxRecall: number;
  private readonly _sessionId: string;

  constructor(options: CreativeMemoryHooksOptions) {
    this._extractor = options.extractor;
    this._recall = options.recall;
    this._promptComposer = options.promptComposer;
    this._sessionMemory = options.sessionMemory;
    this._maxRecall = options.maxRecallItems ?? 5;
    this._sessionId = options.sessionId ?? 'default';
  }

  /**
   * Before execution: recall relevant memories and inject into prompt.
   */
  async onExecuteStart(input: string, _context: AgentContext): Promise<void> {
    try {
      const recalled = await this._recall.recall(input, this._maxRecall);

      if (recalled.length === 0) {
        // Remove stale recall section if nothing relevant
        this._promptComposer.removeSection('memory:recall');
        return;
      }

      // Format recalled memories as Markdown
      const lines = recalled.map(
        (r) => `- [${r.source}] ${r.content} (relevance: ${r.relevance.toFixed(2)})`,
      );
      const content = `## Recalled Memories\n\n${lines.join('\n')}`;

      this._promptComposer.setSection({
        id: 'memory:recall',
        layer: 'ephemeral',
        content,
        priority: 40,
      });
    } catch {
      // Memory recall failure should not block execution
    }
  }

  /**
   * After execution: extract key facts and save to session memory.
   */
  async onExecuteEnd(result: AgentResult): Promise<void> {
    if (!result.success) return; // Don't extract from failed executions

    try {
      // Get current session entries for dedup
      const existingEntries = await this._sessionMemory.getEntries(1);
      const existingFacts = existingEntries.length > 0 ? existingEntries[0]!.keyFacts : [];

      // Get recent history for extraction
      const history = await this._sessionMemory.getHistory();
      const newFacts = this._extractor.extract(history, existingFacts);

      if (newFacts.length > 0) {
        // Merge with existing facts
        const merged = [...existingFacts, ...newFacts];
        await this._sessionMemory.saveSession(this._sessionId, merged, result.response);
      }
    } catch {
      // Memory extraction failure should not block execution
    }
  }
}
