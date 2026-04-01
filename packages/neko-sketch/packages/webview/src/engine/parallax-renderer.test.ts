import type { SceneLayer, CameraConfig } from '../types/scene';
import { computeParallaxOffsets, buildParallaxTransform } from './parallax-renderer';

const makeLayer = (overrides: Partial<SceneLayer> = {}): SceneLayer => ({
  id: 'l1',
  name: 'Layer',
  type: 'parallax',
  zIndex: 0,
  parallaxFactor: [1, 1],
  objects: [],
  visible: true,
  ...overrides,
});

const cam: CameraConfig = { x: 100, y: 50, zoom: 2, bounds: null };

describe('computeParallaxOffsets', () => {
  it('filters invisible layers', () => {
    const layers = [makeLayer({ id: 'a', visible: false }), makeLayer({ id: 'b' })];
    const views = computeParallaxOffsets(layers, cam);
    expect(views).toHaveLength(1);
    expect(views[0]!.layerId).toBe('b');
  });

  it('computes correct offsets', () => {
    const layers = [makeLayer({ parallaxFactor: [0.5, 0.25] })];
    const [view] = computeParallaxOffsets(layers, cam);
    expect(view!.offsetX).toBeCloseTo(-100 * 0.5);
    expect(view!.offsetY).toBeCloseTo(-50 * 0.25);
  });

  it('sorts by zIndex ascending', () => {
    const layers = [
      makeLayer({ id: 'top', zIndex: 10 }),
      makeLayer({ id: 'bot', zIndex: -1 }),
      makeLayer({ id: 'mid', zIndex: 5 }),
    ];
    const ids = computeParallaxOffsets(layers, cam).map((v) => v.layerId);
    expect(ids).toEqual(['bot', 'mid', 'top']);
  });
});

describe('buildParallaxTransform', () => {
  it('returns correct 3x3 column-major matrix', () => {
    const view = { layerId: 'l', offsetX: 200, offsetY: 100, zIndex: 0, visible: true as const };
    const m = buildParallaxTransform(view, cam, 800, 600);
    expect(m).toBeInstanceOf(Float32Array);
    expect(m).toHaveLength(9);
    // [sx, 0, 0,  0, sy, 0,  tx, ty, 1]
    // No scaling — zoom is handled by the viewport transform in the final blit pass
    expect(m[0]).toBe(1); // sx = 1 (no per-layer zoom)
    expect(m[4]).toBe(1); // sy = 1
    expect(m[6]).toBeCloseTo((200 / 800) * 2); // tx in NDC
    expect(m[7]).toBeCloseTo(-(100 / 600) * 2); // ty in NDC (Y flipped)
    expect(m[8]).toBe(1);
  });
});
