/**
 * Router — Workflow-layer facade.
 *
 * Phase 1 MVP: FastProbe-only (no LLMRouter yet).
 * Phase 3: LLMRouter added as a second layer when FastProbe confidence < 0.9.
 *
 * Contract: given a RawInput + optional overrides, return a Route.
 * The Route is handed to the Plan layer (see docs/architecture/plan-mode.md).
 *
 * See docs/architecture/workflow-routing.md for the full design.
 */

import type { IRouter, RawInput, Route, RouteLevel, RouterOverrides } from '../types';
import { fastProbe, isCommittable } from './fast-probe';
import { probe as runInputProbe, type InputProbeOptions } from './input-probe';
import { getRouteRecipe } from './route-registry';

// =============================================================================
// Router options
// =============================================================================

export interface RouterOptions {
  /** Input probe options (drop target, user hint, file reader) */
  probeOptions?: InputProbeOptions;
  /** Default route level when FastProbe can't decide (Phase 1 fallback) */
  defaultFallbackLevel?: RouteLevel;
}

// =============================================================================
// Router implementation
// =============================================================================

export class Router implements IRouter {
  private readonly defaultFallback: RouteLevel;

  constructor(private readonly options: RouterOptions = {}) {
    this.defaultFallback = options.defaultFallbackLevel ?? 'L2';
  }

  async decide(input: RawInput, overrides?: RouterOverrides): Promise<Route> {
    // 1) User explicit override — bypass all probing
    if (overrides?.forceLevel) {
      const recipe = getRouteRecipe(overrides.forceLevel);
      return {
        level: recipe.level,
        flowId: recipe.flowId,
        entryExtension: recipe.entryExtension,
        skipStages: recipe.skipStages,
        ...(recipe.defaultStageParams !== undefined && {
          stageParams: recipe.defaultStageParams,
        }),
        reason: `User forced ${recipe.level}: ${recipe.description}`,
        confidence: 1.0,
        provenance: 'user-override',
      };
    }

    // 2) Input probe (pure, deterministic)
    const ctx = await runInputProbe(input, this.options.probeOptions);

    // 3) FastProbe rules
    const fast = fastProbe(ctx);

    if (isCommittable(fast) && fast.route !== undefined) {
      const recipe = getRouteRecipe(fast.route);
      // FastProbe may override skipStages (e.g., .fountain skips readDocument)
      const skip = fast.skipStages.length > 0 ? fast.skipStages : recipe.skipStages;
      return {
        level: fast.route,
        flowId: recipe.flowId,
        entryExtension: fast.entryExtension ?? recipe.entryExtension,
        skipStages: skip,
        ...(recipe.defaultStageParams !== undefined && {
          stageParams: recipe.defaultStageParams,
        }),
        reason: fast.reason,
        confidence: fast.confidence,
        provenance: 'rules',
      };
    }

    // 4) Low confidence → Phase 1 falls back to a safe default;
    //    Phase 3 will invoke LLMRouter here instead.
    const fallbackLevel = fast.route ?? this.defaultFallback;
    const recipe = getRouteRecipe(fallbackLevel);
    return {
      level: fallbackLevel,
      flowId: recipe.flowId,
      entryExtension: fast.entryExtension ?? recipe.entryExtension,
      skipStages: fast.skipStages.length > 0 ? fast.skipStages : recipe.skipStages,
      ...(recipe.defaultStageParams !== undefined && {
        stageParams: recipe.defaultStageParams,
      }),
      reason: `${fast.reason} (low confidence — Phase 1 fallback to ${fallbackLevel})`,
      confidence: fast.confidence,
      provenance: 'rules',
    };
  }
}

/**
 * Convenience factory — most callers don't need to customize.
 */
export function createRouter(options: RouterOptions = {}): Router {
  return new Router(options);
}

// Re-exports for consumers
export { fastProbe, isCommittable } from './fast-probe';
export { probe as runInputProbe } from './input-probe';
export { getRouteRecipe, listRouteLevels, listRouteRecipes } from './route-registry';
