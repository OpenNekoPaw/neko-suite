import { describe, expect, it } from 'vitest';
import {
  buildViewportPointerQuery,
  buildViewportPointerQueryFromPosition,
  isCompatibleViewportQueryResult,
} from './InteractionLayer';

describe('InteractionLayer query helpers', () => {
  it('routes pointer coordinates through viewport and scene revision scoped payloads', () => {
    expect(
      buildViewportPointerQuery(
        'main',
        7,
        { left: 10, top: 20, width: 200, height: 100 },
        { clientX: 110, clientY: 70 },
      ),
    ).toEqual({
      viewportId: 'main',
      sceneRevision: 7,
      x: 0.5,
      y: 0.5,
    });
    expect(
      buildViewportPointerQueryFromPosition(
        'main',
        7,
        { width: 200, height: 100 },
        [100, 50],
      ),
    ).toEqual({
      viewportId: 'main',
      sceneRevision: 7,
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
