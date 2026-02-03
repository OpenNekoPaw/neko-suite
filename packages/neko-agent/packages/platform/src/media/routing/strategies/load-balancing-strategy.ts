/**
 * Load Balancing Strategy
 *
 * Provides simple random load balancing across providers
 */

import type {
  MediaRoutingStrategy,
  MediaRoutingCandidate,
  MediaRoutingContext,
} from '../../types';

/**
 * Load balancing strategy - adds random score for distribution
 */
export class LoadBalancingStrategy implements MediaRoutingStrategy {
  readonly name = 'load-balancing';
  readonly priority = 10;

  filter(
    candidates: MediaRoutingCandidate[],
    _context: MediaRoutingContext
  ): MediaRoutingCandidate[] {
    // No filtering
    return candidates;
  }

  score(
    candidates: MediaRoutingCandidate[],
    _context: MediaRoutingContext
  ): MediaRoutingCandidate[] {
    // Add random score component for load distribution
    return candidates.map((c) => {
      const randomScore = Math.random() * 10;
      return {
        ...c,
        score: c.score + randomScore,
        scoreBreakdown: {
          ...c.scoreBreakdown,
          [this.name]: randomScore,
        },
      };
    });
  }
}
