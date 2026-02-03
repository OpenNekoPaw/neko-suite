/**
 * LLM Cost Optimization Strategy
 *
 * Priority: 50
 * - Filters models exceeding max cost
 * - Adds score inversely proportional to cost (when optimize='cost')
 */

import { addScore } from '../../../core/router';
import type {
  LLMRoutingStrategy,
  LLMRoutingContext,
  ScoredLLMCandidate,
} from '../types';

export class LLMCostOptimizationStrategy implements LLMRoutingStrategy {
  readonly name = 'cost-optimization';
  readonly priority = 50;

  filter(
    candidates: ScoredLLMCandidate[],
    context: LLMRoutingContext
  ): ScoredLLMCandidate[] {
    const maxCost = context.preference?.maxCostPer1kTokens;

    if (maxCost === undefined) {
      return candidates;
    }

    return candidates.filter((c) => {
      const avgCost = this.getAverageCost(c);
      return avgCost <= maxCost;
    });
  }

  score(
    candidates: ScoredLLMCandidate[],
    context: LLMRoutingContext
  ): ScoredLLMCandidate[] {
    // Only apply cost scoring when optimize='cost'
    if (context.preference?.optimize !== 'cost') {
      return candidates.map((c) => addScore(c, this.name, 0));
    }

    // Calculate cost range
    const costs = candidates.map((c) => this.getAverageCost(c));
    const maxCost = Math.max(...costs, 0.001);

    return candidates.map((c, i) => {
      // Invert cost to score: lower cost = higher score
      const normalizedCost = costs[i] / maxCost;
      const bonus = (1 - normalizedCost) * 30;
      return addScore(c, this.name, bonus);
    });
  }

  private getAverageCost(candidate: ScoredLLMCandidate): number {
    const model = candidate.item.model;
    const inputCost = model.inputCostPer1k ?? 0;
    const outputCost = model.outputCostPer1k ?? 0;
    return (inputCost + outputCost) / 2;
  }
}
