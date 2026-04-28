import { describe, expect, it } from 'vitest';
import { FilterRegistry } from './filter-registry';

describe('FilterRegistry', () => {
  it('registers halftone as a stylize filter with bounded parameters', () => {
    const registry = new FilterRegistry();
    const filter = registry.get('halftone');

    expect(filter).toBeDefined();
    if (!filter) throw new Error('halftone filter should be registered');

    expect(filter.category).toBe('stylize');
    expect(filter.name).toBe('sketch.filter.halftone');
    expect(registry.listByCategory('stylize')).toContain(filter);

    expect(filter.params).toEqual([
      {
        name: 'u_cellSize',
        label: 'sketch.filter.param.cellSize',
        type: 'float',
        default: 8,
        min: 2,
        max: 64,
        step: 1,
      },
      {
        name: 'u_angle',
        label: 'sketch.filter.param.angle',
        type: 'float',
        default: 0,
        min: -3.14,
        max: 3.14,
        step: 0.01,
      },
      {
        name: 'u_amount',
        label: 'sketch.filter.param.amount',
        type: 'float',
        default: 1,
        min: 0,
        max: 1,
        step: 0.01,
      },
    ]);
    expect(filter.fragmentShader).toContain('u_cellSize');
    expect(filter.fragmentShader).toContain('dotMask');
  });

  it('registers gradient map with color uniforms', () => {
    const registry = new FilterRegistry();
    const filter = registry.get('gradient-map');

    expect(filter).toBeDefined();
    if (!filter) throw new Error('gradient map filter should be registered');

    expect(filter.category).toBe('color');
    expect(filter.name).toBe('sketch.filter.gradientMap');
    expect(filter.params).toEqual([
      {
        name: 'u_shadowColor',
        label: 'sketch.filter.param.shadowColor',
        type: 'color',
        default: [0.07, 0.07, 0.09, 1],
      },
      {
        name: 'u_highlightColor',
        label: 'sketch.filter.param.highlightColor',
        type: 'color',
        default: [1, 0.85, 0.45, 1],
      },
      {
        name: 'u_amount',
        label: 'sketch.filter.param.amount',
        type: 'float',
        default: 1,
        min: 0,
        max: 1,
        step: 0.01,
      },
    ]);
    expect(filter.fragmentShader).toContain('u_shadowColor');
    expect(filter.fragmentShader).toContain('u_highlightColor');
  });

  it('registers screen-space ambient occlusion as a bounded stylize filter', () => {
    const registry = new FilterRegistry();
    const filter = registry.get('ssao');

    expect(filter).toBeDefined();
    if (!filter) throw new Error('ssao filter should be registered');

    expect(filter.category).toBe('stylize');
    expect(filter.name).toBe('sketch.filter.ssao');
    expect(filter.params).toEqual([
      {
        name: 'u_radius',
        label: 'sketch.filter.param.radius',
        type: 'float',
        default: 8,
        min: 1,
        max: 48,
        step: 1,
      },
      {
        name: 'u_intensity',
        label: 'sketch.filter.param.intensity',
        type: 'float',
        default: 0.8,
        min: 0,
        max: 2,
        step: 0.05,
      },
      {
        name: 'u_bias',
        label: 'sketch.filter.param.bias',
        type: 'float',
        default: 0.04,
        min: 0,
        max: 0.25,
        step: 0.005,
      },
    ]);
    expect(filter.fragmentShader).toContain('depthHint');
    expect(filter.fragmentShader).toContain('sampleOcclusion');
  });
});
