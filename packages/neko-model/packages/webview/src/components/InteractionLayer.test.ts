import { describe, expect, it } from 'vitest';
import { buildViewportPointerQuery, isCompatibleViewportQueryResult } from './InteractionLayer';

describe('InteractionLayer query helpers', () => {
  it('routes pointer coordinates through viewport and scene revision scoped payloads', () => {
    expect(
      buildViewportPointerQuery(
        'main',
        7,
        { left: 10, top: 20, width: 200, height: 100 },
        { clientX: 110, clientY: 70 },
        {
          position: { x: 0, y: 1, z: 3 },
          target: { x: 0, y: 0, z: 0 },
          fov: 45,
        },
      ),
    ).toEqual({
      viewportId: 'main',
      sceneRevision: 7,
      camera: {
        position: { x: 0, y: 1, z: 3 },
        target: { x: 0, y: 0, z: 0 },
        fov: 45,
      },
      x: 0.5,
      y: 0.5,
    });
  });

  it('accepts only matching viewport query revisions', () => {
    expect(
      isCompatibleViewportQueryResult(
        { sceneId: 'scene-a', viewportId: 'main', revision: 8 },
        'scene-a',
        'main',
        7,
      ),
    ).toBe(true);
    expect(
      isCompatibleViewportQueryResult({ viewportId: 'main', revision: 8 }, 'scene-a', 'main', 7),
    ).toBe(true);
    expect(
      isCompatibleViewportQueryResult(
        { sceneId: 'scene-b', viewportId: 'main', revision: 8 },
        'scene-a',
        'main',
        7,
      ),
    ).toBe(false);
    expect(
      isCompatibleViewportQueryResult(
        { sceneId: 'scene-a', viewportId: 'side', revision: 8 },
        'scene-a',
        'main',
        7,
      ),
    ).toBe(false);
    expect(
      isCompatibleViewportQueryResult(
        { sceneId: 'scene-a', viewportId: 'main', revision: 6 },
        'scene-a',
        'main',
        7,
      ),
    ).toBe(false);
  });
});
