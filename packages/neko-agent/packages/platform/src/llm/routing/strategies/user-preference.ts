/**
 * LLM User Preference Strategy
 *
 * Priority: 100 (highest)
 * - Filters out excluded providers
 * - Adds bonus score for preferred provider/model
 */

import { addScore } from '../../../core/router';
import type {
  LLMRoutingStrategy,
  LLMRoutingContext,
  ScoredLLMCandidate,
} from '../types';

export class LLMUserPreferenceStrategy implements LLMRoutingStrategy {
  readonly name = 'user-preference';
  readonly priority = 100;

  filter(
    candidates: ScoredLLMCandidate[],
    context: LLMRoutingContext
  ): ScoredLLMCandidate[] {
    const pref = context.preference;

    if (!pref?.excludeTargets?.length) {
      return candidates;
    }

    return candidates.filter(
      (c) => !pref.excludeTargets!.includes(c.item.provider.id)
    );
  }

  score(
    candidates: ScoredLLMCandidate[],
    context: LLMRoutingContext
  ): ScoredLLMCandidate[] {
    const pref = context.preference;

    return candidates.map((c) => {
      let bonus = 0;

      // Preferred provider bonus
      if (pref?.preferredProvider === c.item.provider.id) {
        bonus += 20;
      }

      // Preferred model bonus
      if (pref?.preferredModel === c.item.model.id) {
        bonus += 30;
      }

      return addScore(c, this.name, bonus);
    });
  }
}
