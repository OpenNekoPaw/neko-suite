/**
 * Route Registry — L0..L4 route recipes mapped to existing pipeline flows.
 *
 * See docs/architecture/workflow-routing.md §3 for route semantics.
 *
 * Flow mapping (existing flows in @neko/agent/pipeline/pipeline-registry.ts):
 *   flowA: read → parse → import → prompts → pilot → batch → qa → arrange (full, for long text)
 *   flowB: prompts → pilot → batch → qa → arrange (shortest; direct gen)
 *   flowC: read → prompts → pilot → batch → qa → arrange (text but no storyboard)
 *   flowD: parse → arrange (storyboard-only)
 *   flowE: parse → import → prompts → pilot → batch → qa → arrange (pre-structured input)
 *   flowF: parse → import → prompts → pilot → batch → qa → arrange (same as E; F is alias)
 */

import type { RouteLevel, RouteRecipe } from '../types';

// =============================================================================
// Recipes
// =============================================================================

/**
 * L0 — prompt 直出：shortest path. Skip heavy storyboard stages.
 * Flow: flowB, but skip arrange (single-shot → no timeline composition needed).
 */
const L0_RECIPE: RouteRecipe = {
  level: 'L0',
  flowId: 'flowB',
  entryExtension: 'agent',
  skipStages: ['arrangeOnTimeline'],
  description: '一句话 / 单镜头 — prompt 直出',
};

/**
 * L1 — prompt → batch storyboard → cut. MV-style, same visual style across shots.
 * Flow: flowB (no parseStoryboard needed; prompts drive the batch directly).
 */
const L1_RECIPE: RouteRecipe = {
  level: 'L1',
  flowId: 'flowB',
  entryExtension: 'agent',
  skipStages: [],
  description: 'MV / 短视频 — 同风格连镜批量生成',
};

/**
 * L2 — structured input (already has storyboard or fountain script) → full pipeline.
 * Flow: flowE (skip readDocument since input is structured).
 */
const L2_RECIPE: RouteRecipe = {
  level: 'L2',
  flowId: 'flowE',
  entryExtension: 'agent',
  skipStages: [],
  description: '已结构化素材 — 分镜 → 批量生成 → 时间线',
};

/**
 * L3 — long text (novel / Word document) → full pipeline including document parsing.
 * Flow: flowA (all stages).
 */
const L3_RECIPE: RouteRecipe = {
  level: 'L3',
  flowId: 'flowA',
  entryExtension: 'story',
  skipStages: [],
  description: '长文本 — 剧本 → 分镜 → 角色表 → 生成 → 剪辑',
};

/**
 * L4 — visual-first (comic / illustrated book). Enter from preview/sketch, bypass story.
 * Flow: flowE (parseStoryboard expects visual input; skip readDocument).
 */
const L4_RECIPE: RouteRecipe = {
  level: 'L4',
  flowId: 'flowE',
  entryExtension: 'sketch',
  skipStages: ['readDocument'],
  description: '视觉优先 — 漫画 / 绘本改编',
};

// =============================================================================
// Registry
// =============================================================================

const RECIPES: Record<RouteLevel, RouteRecipe> = {
  L0: L0_RECIPE,
  L1: L1_RECIPE,
  L2: L2_RECIPE,
  L3: L3_RECIPE,
  L4: L4_RECIPE,
};

/**
 * Look up the recipe for a route level. Returns a defensive copy.
 */
export function getRouteRecipe(level: RouteLevel): RouteRecipe {
  const recipe = RECIPES[level];
  // Defensive copy (skipStages array) so callers can't mutate the registry
  return {
    ...recipe,
    skipStages: [...recipe.skipStages],
    defaultStageParams: recipe.defaultStageParams
      ? structuredClone(recipe.defaultStageParams)
      : undefined,
  };
}

/**
 * List all known route levels (for UI dropdowns, docs, tests).
 */
export function listRouteLevels(): RouteLevel[] {
  return ['L0', 'L1', 'L2', 'L3', 'L4'];
}

/**
 * List all recipes (defensive copies).
 */
export function listRouteRecipes(): RouteRecipe[] {
  return listRouteLevels().map((l) => getRouteRecipe(l));
}
