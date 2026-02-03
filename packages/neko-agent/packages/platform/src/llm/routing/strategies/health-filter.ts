/**
 * LLM Health Filter Strategy
 *
 * Priority: 90
 * - Filters out unhealthy providers
 */

import { addScore } from '../../../core/router';
import type {
  LLMRoutingStrategy,
  LLMRoutingContext,
  ScoredLLMCandidate,
} from '../types';

export class LLMHealthFilterStrategy implements LLMRoutingStrategy {
  readonly name = 'health-filter';
  readonly priority = 90;

  filter(
    candidates: ScoredLLMCandidate[],
    context: LLMRoutingContext
  ): ScoredLLMCandidate[] {
    return candidates.filter((c) => {
      const isHealthy = context.providerHealth.get(c.item.provider.id);
      // Default to healthy if not in map
      return isHealthy !== false;
    });
  }

  score(candidates: ScoredLLMCandidate[]): ScoredLLMCandidate[] {
    // Health filter doesn't add scores, just filters
    return candidates.map((c) => addScore(c, this.name, 0));
  }
}
