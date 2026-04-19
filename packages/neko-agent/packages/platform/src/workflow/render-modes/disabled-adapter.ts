/**
 * Disabled render adapters — Phase 5.4c stub default.
 *
 * Used wherever the real engine-side adapters aren't wired up yet
 * (tests, fresh extension bootstrap, feature-flag-off path).  Every
 * call resolves to "no-op" without throwing so chain integration can
 * be tested without a Rust toolchain.
 */

import type {
  PuppetRenderAdapter,
  RenderAdapter,
  RenderAdapterRegistry,
  RenderAnimation,
  RenderMode,
  RenderResult,
  SceneRenderAdapter,
  RenderSourceKind,
} from './types';

const NO_FRAMES: RenderResult = { framePaths: [] };
const NO_ANIMS: ReadonlyArray<RenderAnimation> = [];

export const DisabledPuppetRenderAdapter: PuppetRenderAdapter = {
  kind: 'puppet-2d',
  supports(_mode: RenderMode): boolean {
    return false;
  },
  async listAnimations(_assetId: string): Promise<readonly RenderAnimation[]> {
    return NO_ANIMS;
  },
  async render(): Promise<RenderResult> {
    return NO_FRAMES;
  },
};

export const DisabledSceneRenderAdapter: SceneRenderAdapter = {
  kind: 'scene-3d',
  supports(_mode: RenderMode): boolean {
    return false;
  },
  async listAnimations(_assetId: string): Promise<readonly RenderAnimation[]> {
    return NO_ANIMS;
  },
  async render(): Promise<RenderResult> {
    return NO_FRAMES;
  },
};

/**
 * Map-backed registry.  Pass an explicit set of adapters at construction
 * (typically the engine-side concrete ones); falls through to undefined
 * for any kind without a registered adapter so the caller can degrade
 * to plain text-to-image generation.
 */
export class StaticRenderAdapterRegistry implements RenderAdapterRegistry {
  private readonly map = new Map<RenderSourceKind, RenderAdapter>();
  constructor(adapters: ReadonlyArray<RenderAdapter> = []) {
    for (const a of adapters) this.map.set(a.kind, a);
  }
  forKind(kind: RenderSourceKind): RenderAdapter | undefined {
    return this.map.get(kind);
  }
}

/** Convenience: registry pre-loaded with both Disabled adapters. */
export function createDisabledRenderRegistry(): RenderAdapterRegistry {
  return new StaticRenderAdapterRegistry([DisabledPuppetRenderAdapter, DisabledSceneRenderAdapter]);
}
