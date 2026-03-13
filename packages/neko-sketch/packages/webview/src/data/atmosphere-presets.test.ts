import type { AtmosphereConfig } from '../types/scene';
import { atmosphereToEmitter } from './atmosphere-presets';

const baseConfig = (overrides: Partial<AtmosphereConfig> = {}): AtmosphereConfig => ({
  preset: 'rain',
  intensity: 1,
  color: [1, 1, 1, 0.5],
  wind: [0, 0],
  ...overrides,
});

describe('atmosphereToEmitter', () => {
  it('returns null for "none" preset', () => {
    expect(atmosphereToEmitter(baseConfig({ preset: 'none' }))).toBeNull();
  });

  it('returns valid emitter for "rain" preset', () => {
    const emitter = atmosphereToEmitter(baseConfig({ preset: 'rain' }));
    expect(emitter).not.toBeNull();
    expect(emitter!.shape).toBe('rect');
    expect(emitter!.blendMode).toBe('normal');
    expect(emitter!.name).toContain('rain');
  });

  it('scales rate and opacity by intensity', () => {
    const low = atmosphereToEmitter(baseConfig({ intensity: 0.5 }))!;
    const high = atmosphereToEmitter(baseConfig({ intensity: 2 }))!;
    expect(high.rate).toBe(low.rate * 4); // 2/0.5 = 4x
    expect(high.opacity[0]).toBeCloseTo(low.opacity[0]! * 4);
  });

  it('applies wind offset to gravity', () => {
    const noWind = atmosphereToEmitter(baseConfig({ wind: [0, 0] }))!;
    const withWind = atmosphereToEmitter(baseConfig({ wind: [30, -10] }))!;
    expect(withWind.gravity[0]).toBe(noWind.gravity[0]! + 30);
    expect(withWind.gravity[1]).toBe(noWind.gravity[1]! - 10);
  });
});
