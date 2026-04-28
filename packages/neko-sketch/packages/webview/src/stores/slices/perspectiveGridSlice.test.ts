import { describe, expect, it } from 'vitest';
import { createDefaultPerspectiveGrid } from './perspectiveGridSlice';

describe('perspective grid slice helpers', () => {
  it('creates canvas-relative default vanishing points', () => {
    const grid = createDefaultPerspectiveGrid(1000, 500);

    expect(grid.enabled).toBe(false);
    expect(grid.snapEnabled).toBe(false);
    expect(grid.mode).toBe('two-point');
    expect(grid.divisions).toBe(8);
    expect(grid.vanishingPoints.center).toEqual({ x: 500, y: 210 });
    expect(grid.vanishingPoints.left).toEqual({ x: -550, y: 210 });
    expect(grid.vanishingPoints.right).toEqual({ x: 1550, y: 210 });
    expect(grid.vanishingPoints.vertical).toEqual({ x: 500, y: -400 });
  });
});
