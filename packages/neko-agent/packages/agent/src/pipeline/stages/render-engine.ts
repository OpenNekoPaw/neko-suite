/**
 * RenderEngine Stage — pre-renders anchor frames for reference-chained shots.
 *
 * Sits between `parseStoryboard` and `batchGenerate` (Phase 5.4d).  For every
 * shot id that appears as a `reference` target in `ctx.referenceChain`, the
 * stage asks the caller-supplied `renderAnchor` resolver to produce one or
 * more frame paths on disk.  Those paths are merged into
 * `ctx.renderedAnchorPaths` where the batch-generate stage's default
 * resolver picks them up first — ahead of the generic taskIds/generatedPaths
 * lookup — so dependent shots see the puppet/scene render anchor even when
 * the anchor itself isn't an AI-generated shot.
 *
 * Adapter choice is the caller's concern:
 *   - Pure `pure-render` mode returns engine frames directly
 *   - `render-then-ai` / `reference-only` modes pre-bake a base frame that
 *     the downstream AI stage conditions on
 *
 * When `renderAnchor` throws or returns an empty list for a given shot, the
 * stage logs via the injected logger (or stays silent) and moves on — the
 * dependent shot still runs, it just misses the anchor reference image.
 *
 * See docs/architecture/creative-consistency.md §4 and
 * docs/architecture/workflow-orchestration.md Phase 5.4.
 */

import type { IPipelineStage, PipelineContext } from '../types';

export interface RenderEngineLogger {
  warn(message: string, context?: Record<string, unknown>): void;
}

export interface RenderEngineStageDeps {
  /**
   * Produce one or more rendered frame paths for a single anchor shot.
   * Return an empty list (or undefined) to skip.  The stage never calls
   * this more than once per unique shot id per run.
   */
  renderAnchor: (shotId: string, ctx: PipelineContext) => Promise<readonly string[] | undefined>;
  /** Optional logger for swallowed render failures. */
  logger?: RenderEngineLogger;
}

/**
 * Collect the set of shot ids that any other shot references.  These are
 * the anchors that need pre-rendering.  Self-references are excluded
 * defensively (a shot shouldn't reference its own output anyway).
 */
export function collectAnchorShotIds(ctx: PipelineContext): string[] {
  const chain = ctx.referenceChain;
  if (!chain || chain.length === 0) return [];
  const anchors = new Set<string>();
  for (const entry of chain) {
    for (const ref of entry.references) {
      if (typeof ref !== 'string' || ref.length === 0) continue;
      if (ref === entry.shotId) continue;
      anchors.add(ref);
    }
  }
  return Array.from(anchors);
}

export function createRenderEngineStage(deps: RenderEngineStageDeps): IPipelineStage {
  return {
    name: 'renderEngine',
    type: 'linear',
    gate: 'auto',

    async execute(ctx: PipelineContext): Promise<PipelineContext> {
      const anchors = collectAnchorShotIds(ctx);
      if (anchors.length === 0) return ctx;

      // Fresh map — overlay onto whatever the caller had in ctx.  Unique
      // anchor ids only, so no dedup bookkeeping needed beyond the set
      // produced by collectAnchorShotIds.
      const renderedAnchorPaths: Record<string, readonly string[]> = {
        ...(ctx.renderedAnchorPaths ?? {}),
      };

      // Render in parallel — anchors have no inter-dependencies (a render
      // target is source material, not another generated shot).
      const results = await Promise.all(
        anchors.map(async (shotId) => {
          try {
            const paths = await deps.renderAnchor(shotId, ctx);
            return { shotId, paths: paths ?? [] };
          } catch (err) {
            deps.logger?.warn('[renderEngine] adapter threw — skipping anchor', {
              shotId,
              error: err instanceof Error ? err.message : String(err),
            });
            return { shotId, paths: [] as readonly string[] };
          }
        }),
      );

      for (const { shotId, paths } of results) {
        if (paths.length === 0) continue;
        renderedAnchorPaths[shotId] = paths;
      }

      if (Object.keys(renderedAnchorPaths).length === 0) return ctx;
      return { ...ctx, renderedAnchorPaths };
    },
  };
}
