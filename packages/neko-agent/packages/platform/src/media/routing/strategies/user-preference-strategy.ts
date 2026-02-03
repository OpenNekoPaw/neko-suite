/**
 * User Preference Strategy
 *
 * Prioritizes user-specified provider and model
 */

import type {
  MediaRoutingStrategy,
  MediaRoutingCandidate,
  MediaRoutingContext,
} from '../../types';

/**
 * User preference strategy - honors user's explicit choices
 */
export class UserPreferenceStrategy implements MediaRoutingStrategy {
  readonly name = 'user-preference';
  readonly priority = 100;

  filter(
    candidates: MediaRoutingCandidate[],
    context: MediaRoutingContext
  ): MediaRoutingCandidate[] {
    const preference = context.preference;

    // Filter by excluded providers
    if (preference?.excludeProviders?.length) {
      candidates = candidates.filter(
        (c) => !preference.excludeProviders!.includes(c.provider.id)
      );
    }

    return candidates;
  }

  score(
    candidates: MediaRoutingCandidate[],
    context: MediaRoutingContext
  ): MediaRoutingCandidate[] {
    // No explicit preference scoring in filter-only strategy
    return candidates.map((c) => ({
      ...c,
      scoreBreakdown: {
        ...c.scoreBreakdown,
        [this.name]: 0,
      },
    }));
  }
}
