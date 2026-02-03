/**
 * LLM Context Window Strategy
 *
 * Priority: 70
 * - Filters models with insufficient context window
 * - Adds bonus for larger context windows
 */

import { addScore } from '../../../core/router';
import type {
  LLMRoutingStrategy,
  LLMRoutingContext,
  ScoredLLMCandidate,
} from '../types';

export class LLMContextWindowStrategy implements LLMRoutingStrategy {
  readonly name = 'context-window';
  readonly priority = 70;

  filter(
    candidates: ScoredLLMCandidate[],
    context: LLMRoutingContext
  ): ScoredLLMCandidate[] {
    const minWindow = context.preference?.minContextWindow;
    const estimatedTokens = context.estimatedInputTokens;

    return candidates.filter((c) => {
      const contextWindow = c.item.model.contextWindow ?? 4096;

      // Filter by minimum context window preference
      if (minWindow && contextWindow < minWindow) {
        return false;
      }

      // Filter by estimated tokens (need 20% headroom for output)
      if (estimatedTokens && contextWindow * 0.8 < estimatedTokens) {
        return false;
      }

      return true;
    });
  }

  score(candidates: ScoredLLMCandidate[]): ScoredLLMCandidate[] {
    // Add bonus based on context window size (logarithmic scale)
    return candidates.map((c) => {
      const contextWindow = c.item.model.contextWindow ?? 4096;
      // Log scale: 4k=0, 8k~3, 32k~9, 128k~15
      const bonus = Math.log2(contextWindow / 4096) * 3;
      return addScore(c, this.name, Math.max(0, bonus));
    });
  }
}
