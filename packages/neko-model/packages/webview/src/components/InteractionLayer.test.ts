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
      ),
    ).toEqual({
      viewportId: 'main',
      sceneRevision: 7,
      x: 0.5,
      y: 0.5,
    });
  });

  it('accepts only matching viewport query revisions', () => {
    expect(isCompatibleViewportQueryResult({ viewportId: 'main', revision: 8 }, 'main', 7)).toBe(
      true,
    );
    expect(isCompatibleViewportQueryResult({ viewportId: 'side', revision: 8 }, 'main', 7)).toBe(
      false,
    );
    expect(isCompatibleViewportQueryResult({ viewportId: 'main', revision: 6 }, 'main', 7)).toBe(
      false,
    );
  });
});
