/**
 * Health Filter Strategy
 *
 * Filters out unavailable providers based on health status
 */

import type {
  MediaRoutingStrategy,
  MediaRoutingCandidate,
  MediaRoutingContext,
} from '../../types';

/**
 * Health filter strategy - removes unhealthy providers
 */
export class HealthFilterStrategy implements MediaRoutingStrategy {
  readonly name = 'health-filter';
  readonly priority = 90;

  filter(
    candidates: MediaRoutingCandidate[],
    context: MediaRoutingContext
  ): MediaRoutingCandidate[] {
    return candidates.filter((c) => {
      // Check if provider is healthy
      const isHealthy = context.providerHealth.get(c.provider.id);
      // Default to healthy if no status is known
      return isHealthy !== false;
    });
  }

  score(
    candidates: MediaRoutingCandidate[],
    _context: MediaRoutingContext
  ): MediaRoutingCandidate[] {
    // No scoring, just filtering
    return candidates.map((c) => ({
      ...c,
      scoreBreakdown: {
        ...c.scoreBreakdown,
        [this.name]: 0,
      },
    }));
  }
}
