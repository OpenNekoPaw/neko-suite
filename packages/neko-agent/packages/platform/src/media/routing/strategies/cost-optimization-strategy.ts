/**
 * Cost Optimization Strategy
 *
 * Scores candidates based on cost efficiency
 */

import type {
  MediaRoutingStrategy,
  MediaRoutingCandidate,
  MediaRoutingContext,
} from '../../types';

/**
 * Cost optimization strategy - prioritizes lower cost providers
 */
export class CostOptimizationStrategy implements MediaRoutingStrategy {
  readonly name = 'cost-optimization';
  readonly priority = 50;

  filter(
    candidates: MediaRoutingCandidate[],
    _context: MediaRoutingContext
  ): MediaRoutingCandidate[] {
    // No filtering, just scoring
    return candidates;
  }

  score(
    candidates: MediaRoutingCandidate[],
    context: MediaRoutingContext
  ): MediaRoutingCandidate[] {
    // Only apply if user prefers cost optimization
    if (context.preference?.optimize !== 'cost') {
      return candidates.map((c) => ({
        ...c,
        scoreBreakdown: {
          ...c.scoreBreakdown,
          [this.name]: 0,
        },
      }));
    }

    // Calculate cost scores
    const costs = candidates.map((c) => {
      const inputCost = c.model.inputCostPer1k || 0;
      const outputCost = c.model.outputCostPer1k || 0;
      return inputCost + outputCost;
    });

    const maxCost = Math.max(...costs, 0.001); // Avoid division by zero

    return candidates.map((c, index) => {
      // Inverse cost scoring: lower cost = higher score
      // Score range: 0-50 points
      const costRatio = costs[index] / maxCost;
      const costScore = (1 - costRatio) * 50;

      return {
        ...c,
        score: c.score + costScore,
        scoreBreakdown: {
          ...c.scoreBreakdown,
          [this.name]: costScore,
        },
      };
    });
  }
}
