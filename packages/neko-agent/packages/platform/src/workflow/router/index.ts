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
import type { LLMRouter } from './llm-router';
import type { RouterMemory } from '../memory/router-memory';
import { hashInput } from './input-hash';

// =============================================================================
// Router options
// =============================================================================

export interface RouterOptions {
  /** Input probe options (drop target, user hint, file reader) */
  probeOptions?: InputProbeOptions;
  /** Default route level when FastProbe can't decide (Phase 1 fallback) */
  defaultFallbackLevel?: RouteLevel;
  /** Phase 3 LLM router, invoked when FastProbe confidence is ambiguous */
  llmRouter?: LLMRouter;
  /**
   * Phase 3 memory cache — checked *before* FastProbe / LLMRouter. When the
   * same input hash has a prior committed decision, the router reuses it
   * (provenance: 'memory').
   */
  memory?: RouterMemory;
  /** Optional workspace dir (used to salt memory hashes) */
  workDir?: string;
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

    // 2) Memory lookup — a prior identical input's committed decision.
    //    Checked before FastProbe so the user sees consistent routes when
    //    they repeat an input (e.g., drag the same file twice).
    const memoryHit = this.lookupMemory(input);
    if (memoryHit) return memoryHit;

    // 3) Input probe (pure, deterministic)
    const ctx = await runInputProbe(input, this.options.probeOptions);

    // 4) FastProbe rules
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

    // 5) Ambiguous — consult the LLMRouter when available and not disabled.
    if (this.options.llmRouter && !overrides?.disableLlmRouter) {
      const llmResult = await this.options.llmRouter.decide({
        input,
        ctx,
        fastHint: fast,
        ...(this.options.workDir !== undefined && { workDir: this.options.workDir }),
      });
      if (llmResult) {
        const recipe = getRouteRecipe(llmResult.level);
        const skip =
          llmResult.skipStages.length > 0 ? [...llmResult.skipStages] : recipe.skipStages;
        return {
          level: llmResult.level,
          flowId: recipe.flowId,
          entryExtension: llmResult.entryExtension ?? recipe.entryExtension,
          skipStages: skip,
          ...(recipe.defaultStageParams !== undefined && {
            stageParams: recipe.defaultStageParams,
          }),
          reason: llmResult.reason,
          confidence: llmResult.confidence,
          provenance: 'llm',
        };
      }
      // Fall through — LLMRouter returned undefined (budget exceeded / error)
    }

    // 6) Low confidence and no LLM help → safe fallback.
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
      reason: `${fast.reason} (low confidence — fallback to ${fallbackLevel})`,
      confidence: fast.confidence,
      provenance: 'rules',
    };
  }

  private lookupMemory(input: RawInput): Route | undefined {
    if (!this.options.memory) return undefined;
    const hash = hashInput(
      input,
      this.options.workDir !== undefined ? { workDir: this.options.workDir } : {},
    );
    const prior = this.options.memory.lookup(hash);
    if (!prior) return undefined;
    const recipe = getRouteRecipe(prior.level);
    return {
      level: prior.level,
      flowId: recipe.flowId,
      entryExtension: recipe.entryExtension,
      skipStages: recipe.skipStages,
      ...(recipe.defaultStageParams !== undefined && {
        stageParams: recipe.defaultStageParams,
      }),
      reason: `Prior decision: ${prior.reason}`,
      confidence: 0.95,
      provenance: 'memory',
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
export { hashInput, type HashInputOptions } from './input-hash';
export { estimateRouteCost, type RouteCostEstimate } from './cost-estimator';
export {
  LLMRouter,
  type LLMChatFn,
  type LLMRouterDecideInput,
  type LLMRouterOptions,
  type LLMRouterResult,
} from './llm-router';
export {
  ROUTER_TOOL_DEFS,
  ROUTER_TOOL_NAMES,
  runAnalyzeTextStructure,
  runCheckExistingAssets,
  runEstimateDuration,
  runAskUser,
  type AnalyzeTextStructureArgs,
  type AnalyzeTextStructureResult,
  type AskUserArgs,
  type AskUserBroker,
  type AskUserResult,
  type CheckExistingAssetsArgs,
  type CheckExistingAssetsResult,
  type CommitRouteArgs,
  type CommitRouteResult,
  type EstimateDurationArgs,
  type EstimateDurationResult,
  type RouterToolContext,
  type RouterToolName,
} from './llm-router-tools';
