/**
 * Render Mode types — Phase 5.4c stub.
 *
 * Three generation modes are defined for shots that are backed by a 2D
 * puppet (neko-puppet INP) or a 3D scene (gltf):
 *
 *   - `pure-render`     — engine renders frames deterministically; no LLM
 *                         or diffusion model in the loop.  Cheapest +
 *                         most consistent; least creative latitude.
 *   - `render-then-ai`  — engine renders a base frame, AI restyles or
 *                         enhances it (img2img / IP-Adapter).  Mid-cost,
 *                         keeps puppet/scene control + adds polish.
 *   - `reference-only`  — engine output is a *reference image* the AI
 *                         conditions on (no per-pixel rendering).
 *                         Closer to free-form text-to-image with style
 *                         locked by the reference.
 *
 * This file freezes the TS-side contracts so the upcoming neko-puppet
 * and neko-engine integration PRs (Rust runtime-puppet exposing
 * animation enumeration; runtime-scene exposing skeleton + camera
 * control) have stable types to bind to.
 *
 * See docs/architecture/agent-media-architecture.md (three-mode cost
 * table) and docs/architecture/workflow-orchestration.md Phase 5.4c.
 */

// =============================================================================
// Render mode enum
// =============================================================================

export type RenderMode = 'pure-render' | 'render-then-ai' | 'reference-only';

/**
 * Soft cost hint per mode.  Surfaced to UI and PlanBuilder so users see
 * the trade-off before committing.  Numbers are *relative units* — not
 * literal dollars / seconds — and intended to be replaced by per-asset
 * estimates once profiling data is available.
 */
export interface RenderModeCostHint {
  readonly mode: RenderMode;
  readonly relativeCost: number;
  readonly relativeLatency: number;
  readonly relativeQuality: number;
}

export const DEFAULT_RENDER_MODE_COSTS: ReadonlyArray<RenderModeCostHint> = [
  { mode: 'pure-render', relativeCost: 1, relativeLatency: 1, relativeQuality: 0.7 },
  { mode: 'render-then-ai', relativeCost: 4, relativeLatency: 3, relativeQuality: 1.0 },
  { mode: 'reference-only', relativeCost: 6, relativeLatency: 4, relativeQuality: 0.95 },
];

// =============================================================================
// Source asset (puppet | scene)
// =============================================================================

export type RenderSourceKind = 'puppet-2d' | 'scene-3d';

/**
 * Minimal description of a renderable source asset.  Concrete fields
 * (e.g. INP path for puppet, gltf path + camera id for scene) are
 * carried inside `parameters` so the workflow module doesn't pull
 * runtime-specific types into its public contract.
 */
export interface RenderSource {
  readonly kind: RenderSourceKind;
  readonly assetId: string;
  /** Animation / pose / clip id selected for this shot. */
  readonly animationId?: string;
  /** Free-form parameters interpreted by the matching adapter. */
  readonly parameters?: Readonly<Record<string, string | number | boolean>>;
}

// =============================================================================
// Render request / result
// =============================================================================

export interface RenderRequest {
  readonly source: RenderSource;
  /** Frame count; stage default = 1 (single keyframe). */
  readonly frameCount?: number;
  /** Output resolution in pixels (square or `{ width, height }`). */
  readonly width?: number;
  readonly height?: number;
  /** Optional abort signal — adapters should cancel on signal.aborted. */
  readonly signal?: AbortSignal;
}

/**
 * Path-only result.  The adapter writes frames to disk and returns the
 * paths; downstream stages thread the paths into MediaGenerateOptions.
 * (Frame data isn't returned inline to avoid cross-process Buffer
 * round-trips.)
 */
export interface RenderResult {
  /** Absolute / workspace-relative paths of the rendered frames. */
  readonly framePaths: readonly string[];
  /** Optional duration hint for video adapters. */
  readonly durationSec?: number;
}

// =============================================================================
// Adapter contracts
// =============================================================================

export interface PuppetRenderAdapter {
  readonly kind: 'puppet-2d';
  /** Rendering capability — adapters that don't support a mode return false. */
  supports(mode: RenderMode): boolean;
  /** Enumerate animations bundled in the puppet asset. */
  listAnimations(assetId: string): Promise<readonly RenderAnimation[]>;
  /** Render frames according to the request. */
  render(request: RenderRequest): Promise<RenderResult>;
}

export interface SceneRenderAdapter {
  readonly kind: 'scene-3d';
  supports(mode: RenderMode): boolean;
  listAnimations(assetId: string): Promise<readonly RenderAnimation[]>;
  render(request: RenderRequest): Promise<RenderResult>;
}

export type RenderAdapter = PuppetRenderAdapter | SceneRenderAdapter;

export interface RenderAnimation {
  readonly id: string;
  readonly label?: string;
  readonly durationSec?: number;
  /** Free-form metadata (loops, blend group, etc.) */
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

// =============================================================================
// Adapter registry
// =============================================================================

/**
 * Lookup wrapper that selects an adapter by source kind.  Production
 * code wires real `runtime-puppet` / `runtime-scene` adapters here;
 * tests inject `DisabledRenderAdapter` to keep the chain inert.
 */
export interface RenderAdapterRegistry {
  forKind(kind: RenderSourceKind): RenderAdapter | undefined;
}
