import { describe, expect, it } from 'vitest';
import {
  StaticRenderAdapterRegistry,
  createDisabledRenderRegistry,
  selectRenderMode,
  type PuppetRenderAdapter,
  type RenderAnimation,
  type RenderMode,
  type RenderResult,
  type RenderSource,
  type SceneRenderAdapter,
} from '..';

const PUPPET_SOURCE: RenderSource = { kind: 'puppet-2d', assetId: 'alice' };
const SCENE_SOURCE: RenderSource = { kind: 'scene-3d', assetId: 'forest' };

function makePuppet(supported: ReadonlySet<RenderMode>): PuppetRenderAdapter {
  return {
    kind: 'puppet-2d',
    supports: (mode) => supported.has(mode),
    listAnimations: async (): Promise<readonly RenderAnimation[]> => [],
    render: async (): Promise<RenderResult> => ({ framePaths: [] }),
  };
}

function makeScene(supported: ReadonlySet<RenderMode>): SceneRenderAdapter {
  return {
    kind: 'scene-3d',
    supports: (mode) => supported.has(mode),
    listAnimations: async (): Promise<readonly RenderAnimation[]> => [],
    render: async (): Promise<RenderResult> => ({ framePaths: [] }),
  };
}

describe('selectRenderMode', () => {
  it('returns undefined when no adapter is registered for the source kind', () => {
    const registry = new StaticRenderAdapterRegistry([]);
    expect(selectRenderMode({ source: PUPPET_SOURCE, registry })).toBeUndefined();
  });

  it('uses the preferred mode when the adapter supports it', () => {
    const registry = new StaticRenderAdapterRegistry([
      makePuppet(new Set<RenderMode>(['pure-render', 'render-then-ai'])),
    ]);
    const result = selectRenderMode({
      source: PUPPET_SOURCE,
      registry,
      preferred: 'pure-render',
    });
    expect(result?.mode).toBe('pure-render');
    expect(result?.downgraded).toBe(false);
  });

  it('downgrades pure-render → render-then-ai when pure mode is unsupported', () => {
    const registry = new StaticRenderAdapterRegistry([
      makePuppet(new Set<RenderMode>(['render-then-ai', 'reference-only'])),
    ]);
    const result = selectRenderMode({
      source: PUPPET_SOURCE,
      registry,
      preferred: 'pure-render',
    });
    expect(result?.mode).toBe('render-then-ai');
    expect(result?.downgraded).toBe(true);
  });

  it('downgrades all the way to reference-only when nothing else is supported', () => {
    const registry = new StaticRenderAdapterRegistry([
      makeScene(new Set<RenderMode>(['reference-only'])),
    ]);
    const result = selectRenderMode({
      source: SCENE_SOURCE,
      registry,
      preferred: 'pure-render',
    });
    expect(result?.mode).toBe('reference-only');
    expect(result?.downgraded).toBe(true);
  });

  it('returns undefined when adapter supports nothing', () => {
    const registry = new StaticRenderAdapterRegistry([makePuppet(new Set<RenderMode>())]);
    expect(selectRenderMode({ source: PUPPET_SOURCE, registry })).toBeUndefined();
  });

  it('honours the configurable defaultMode when no preferred is supplied', () => {
    const registry = new StaticRenderAdapterRegistry([
      makePuppet(new Set<RenderMode>(['pure-render', 'render-then-ai', 'reference-only'])),
    ]);
    const result = selectRenderMode({
      source: PUPPET_SOURCE,
      registry,
      defaultMode: 'reference-only',
    });
    expect(result?.mode).toBe('reference-only');
    expect(result?.downgraded).toBe(false);
  });

  it('default registry of disabled adapters returns undefined for any preference', () => {
    const registry = createDisabledRenderRegistry();
    expect(selectRenderMode({ source: PUPPET_SOURCE, registry })).toBeUndefined();
    expect(
      selectRenderMode({ source: SCENE_SOURCE, registry, preferred: 'render-then-ai' }),
    ).toBeUndefined();
  });
});

describe('StaticRenderAdapterRegistry', () => {
  it('returns the matching adapter and undefined for unknown kinds', () => {
    const puppet = makePuppet(new Set<RenderMode>(['pure-render']));
    const reg = new StaticRenderAdapterRegistry([puppet]);
    expect(reg.forKind('puppet-2d')).toBe(puppet);
    expect(reg.forKind('scene-3d')).toBeUndefined();
  });
});
