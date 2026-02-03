/**
 * LLM Load Balancing Strategy
 *
 * Priority: 10 (lowest)
 * - Adds random score to distribute load across providers
 */

import { addScore } from '../../../core/router';
import type {
  LLMRoutingStrategy,
  ScoredLLMCandidate,
} from '../types';

export class LLMLoadBalancingStrategy implements LLMRoutingStrategy {
  readonly name = 'load-balancing';
  readonly priority = 10;

  filter(candidates: ScoredLLMCandidate[]): ScoredLLMCandidate[] {
    // Load balancing doesn't filter
    return candidates;
  }

  score(candidates: ScoredLLMCandidate[]): ScoredLLMCandidate[] {
    // Add random score (0-10) to distribute load
    return candidates.map((c) => {
      const randomScore = Math.random() * 10;
      return addScore(c, this.name, randomScore);
    });
  }
}
