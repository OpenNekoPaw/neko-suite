/**
 * Cost estimator — rough token/credit/duration estimate per route.
 *
 * Used by the LLMRouter's `estimate_duration` tool so the model can compare
 * two candidate routes without asking the user. Deliberately approximate —
 * it mirrors the PlanBuilder's STAGE_META hints and adds a small router
 * overhead for each stage the route will actually run.
 *
 * See docs/architecture/workflow-routing.md §7 for how these numbers feed
 * back into the Plan card's "estimate" column.
 */

import type { RouteLevel } from '../types';
import { getRouteRecipe } from './route-registry';

export interface RouteCostEstimate {
  tokens: number;
  credits: number;
  durationSec: number;
}

/**
 * Stage meta — intentionally a subset of plan-builder's STAGE_META so the
 * router estimate matches what the Plan card shows.  When these two go out
 * of sync the user sees a mismatch; keep them editable side-by-side.
 */
const STAGE_COST: Record<string, Partial<RouteCostEstimate>> = {
  readDocument: { durationSec: 5 },
  parseStoryboard: { tokens: 2000, durationSec: 15 },
  importStoryboardToCanvas: { durationSec: 3 },
  generatePrompts: { tokens: 4000, durationSec: 20 },
  generatePilot: { credits: 5, durationSec: 45 },
  batchGenerate: { credits: 40, durationSec: 240 },
  qualityGate: { durationSec: 15 },
  arrangeOnTimeline: { durationSec: 5 },
};

/** Stages that each flow runs, mirroring plan-builder.stagesForFlow() */
function stagesForFlow(flowId: string): readonly string[] {
  switch (flowId) {
    case 'flowA':
      return [
        'readDocument',
        'parseStoryboard',
        'importStoryboardToCanvas',
        'generatePrompts',
        'generatePilot',
        'batchGenerate',
        'qualityGate',
        'arrangeOnTimeline',
      ];
    case 'flowB':
      return [
        'generatePrompts',
        'generatePilot',
        'batchGenerate',
        'qualityGate',
        'arrangeOnTimeline',
      ];
    case 'flowC':
      return [
        'readDocument',
        'generatePrompts',
        'generatePilot',
        'batchGenerate',
        'qualityGate',
        'arrangeOnTimeline',
      ];
    case 'flowD':
      return ['parseStoryboard', 'arrangeOnTimeline'];
    case 'flowE':
    case 'flowF':
      return [
        'parseStoryboard',
        'importStoryboardToCanvas',
        'generatePrompts',
        'generatePilot',
        'batchGenerate',
        'qualityGate',
        'arrangeOnTimeline',
      ];
    default:
      return [];
  }
}

/**
 * Compute a rough cost estimate for a given RouteLevel, respecting the
 * recipe's skipStages.
 */
export function estimateRouteCost(level: RouteLevel): RouteCostEstimate {
  const recipe = getRouteRecipe(level);
  const skip = new Set(recipe.skipStages);
  let tokens = 0;
  let credits = 0;
  let durationSec = 0;
  for (const stage of stagesForFlow(recipe.flowId)) {
    if (skip.has(stage)) continue;
    const cost = STAGE_COST[stage];
    if (!cost) continue;
    tokens += cost.tokens ?? 0;
    credits += cost.credits ?? 0;
    durationSec += cost.durationSec ?? 0;
  }
  return { tokens, credits, durationSec };
}

/** For tests */
export const __internal = { stagesForFlow, STAGE_COST };
