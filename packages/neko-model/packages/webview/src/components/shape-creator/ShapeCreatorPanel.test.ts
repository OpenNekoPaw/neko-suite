import { describe, expect, it } from 'vitest';
import { SHAPE_PARAMS } from '../../types/shapeParams';
import { normalizeShapeParamValue } from './ShapeCreatorPanel';

describe('ShapeCreatorPanel parameter controls', () => {
  it('keeps meter-scale primitive controls below 0.5m', () => {
    const cubeWidth = SHAPE_PARAMS.cube.find((def) => def.name === 'width');
    const sphereRadius = SHAPE_PARAMS.sphere.find((def) => def.name === 'radius');

    expect(cubeWidth?.min).toBe(0.01);
    expect(cubeWidth?.step).toBe(0.01);
    expect(sphereRadius?.min).toBe(0.01);
    expect(sphereRadius?.step).toBe(0.01);
  });

  it('normalizes precise number input without snapping back to 0.5m defaults', () => {
    const radius = SHAPE_PARAMS.sphere.find((def) => def.name === 'radius');
    expect(radius).toBeDefined();
    if (!radius) return;

    expect(normalizeShapeParamValue(radius, 0.1)).toBe(0.1);
    expect(normalizeShapeParamValue(radius, 0.01)).toBe(0.01);
    expect(normalizeShapeParamValue(radius, -1)).toBe(0.01);
  });
});
