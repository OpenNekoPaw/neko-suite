import { describe, expect, it } from 'vitest';
import type { PerspectiveGridState } from '../types';
import { snapPointToPerspectiveGrid } from './perspective-grid-snap';

describe('perspective grid snap', () => {
  it('leaves points unchanged when grid snap is disabled', () => {
    const grid = createGrid({ enabled: true, snapEnabled: false });
    const point = { x: 50, y: 49 };

    expect(snapPointToPerspectiveGrid(point, grid, createCanvas())).toEqual({
      point,
      snapped: false,
      distance: Infinity,
    });
  });

  it('snaps to the nearest one-point perspective ray inside the threshold', () => {
    const grid = createGrid({ enabled: true, snapEnabled: true, mode: 'one-point', divisions: 2 });
    const result = snapPointToPerspectiveGrid({ x: 52, y: 70 }, grid, createCanvas(), {
      threshold: 8,
    });

    expect(result.snapped).toBe(true);
    expect(result.lineKey).toBe('center-3');
    expect(result.point.x).toBeCloseTo(50);
    expect(result.point.y).toBeCloseTo(70);
  });

  it('does not snap when the nearest ray is outside the threshold', () => {
    const grid = createGrid({ enabled: true, snapEnabled: true, mode: 'one-point', divisions: 2 });
    const point = { x: 62, y: 70 };
    const result = snapPointToPerspectiveGrid(point, grid, createCanvas(), { threshold: 4 });

    expect(result.snapped).toBe(false);
    expect(result.point).toBe(point);
  });

  it('includes the vertical vanishing point in three-point mode', () => {
    const grid = createGrid({
      enabled: true,
      snapEnabled: true,
      mode: 'three-point',
      divisions: 2,
    });
    const result = snapPointToPerspectiveGrid({ x: 52, y: -30 }, grid, createCanvas(), {
      threshold: 8,
    });

    expect(result.snapped).toBe(true);
    expect(result.lineKey?.startsWith('vertical-')).toBe(true);
  });
});

function createCanvas(): { readonly width: number; readonly height: number } {
  return { width: 100, height: 100 };
}

function createGrid(overrides: Partial<PerspectiveGridState>): PerspectiveGridState {
  return {
    enabled: false,
    snapEnabled: false,
    mode: 'two-point',
    divisions: 4,
    opacity: 0.4,
    vanishingPoints: {
      center: { x: 50, y: 50 },
      left: { x: -100, y: 50 },
      right: { x: 200, y: 50 },
      vertical: { x: 50, y: -100 },
    },
    ...overrides,
  };
}
