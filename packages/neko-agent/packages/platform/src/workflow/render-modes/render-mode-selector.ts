/**
 * RenderModeSelector — picks a `RenderMode` per shot based on source
 * kind, adapter capability, and a user-supplied preference.
 *
 * Pure.  Side-effect-free.  No I/O.  Usable from PlanBuilder or a
 * future `render-engine` pipeline stage without pulling in engine code.
 *
 * Policy (in order):
 *   1. If the adapter doesn't support any of `pure-render`, fall
 *      through to `reference-only`.  Missing adapter → undefined.
 *   2. If the user asked for `pure-render` but the adapter can't do
 *      that mode, downgrade to `render-then-ai` (then `reference-only`).
 *   3. If no preference, use the caller-supplied default (typically
 *      `render-then-ai` — the best quality / cost tradeoff).
 *
 * See docs/architecture/agent-media-architecture.md (three-mode cost
 * table) for the rationale behind the default.
 */

import type {
  PuppetRenderAdapter,
  RenderAdapterRegistry,
  RenderMode,
  RenderSource,
  SceneRenderAdapter,
} from './types';

// =============================================================================
// Fallback order per preference
// =============================================================================

const FALLBACK_ORDER: Record<RenderMode, readonly RenderMode[]> = {
  'pure-render': ['pure-render', 'render-then-ai', 'reference-only'],
  'render-then-ai': ['render-then-ai', 'reference-only', 'pure-render'],
  'reference-only': ['reference-only', 'render-then-ai', 'pure-render'],
};

export interface SelectRenderModeOptions {
  readonly source: RenderSource;
  readonly registry: RenderAdapterRegistry;
  /** User preference; when absent the chosen default is used. */
  readonly preferred?: RenderMode;
  /** Default when no preference is supplied.  Defaults to `render-then-ai`. */
  readonly defaultMode?: RenderMode;
}

export interface SelectRenderModeResult {
  readonly mode: RenderMode;
  readonly adapter: PuppetRenderAdapter | SceneRenderAdapter;
  /** True when the selected mode differed from the caller's preference. */
  readonly downgraded: boolean;
}

export function selectRenderMode(
  options: SelectRenderModeOptions,
): SelectRenderModeResult | undefined {
  const adapter = options.registry.forKind(options.source.kind);
  if (!adapter) return undefined;

  const preferred = options.preferred ?? options.defaultMode ?? 'render-then-ai';
  const chain = FALLBACK_ORDER[preferred] ?? FALLBACK_ORDER['render-then-ai'];

  for (const mode of chain) {
    if (adapter.supports(mode)) {
      return { mode, adapter, downgraded: mode !== preferred };
    }
  }
  return undefined;
}
