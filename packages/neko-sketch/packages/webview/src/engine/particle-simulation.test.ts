import { describe, it, expect } from 'vitest';
import { ParticleSimulation } from './particle-simulation';
import { DEFAULT_EMITTER, type ParticleEmitterConfig } from '../types/particle';

const config: ParticleEmitterConfig = { ...DEFAULT_EMITTER, rate: 100 };

describe('ParticleSimulation', () => {
  it('starts with 0 active particles', () => {
    const sim = new ParticleSimulation();
    expect(sim.getActiveCount()).toBe(0);
  });

  it('emit() creates particles based on rate * dt', () => {
    const sim = new ParticleSimulation();
    sim.emit(config, 0.1);
    expect(sim.getActiveCount()).toBeGreaterThanOrEqual(9);
    expect(sim.getActiveCount()).toBeLessThanOrEqual(11);
  });

  it('update() moves particles and decrements life', () => {
    const sim = new ParticleSimulation();
    sim.emit({ ...config, speed: [100, 100] }, 0.1);
    const before = sim.getInstanceData();
    const firstY = before.data[1];
    sim.update(0.05);
    const after = sim.getInstanceData();
    // Position should have changed due to speed/gravity
    expect(after.data[1]).not.toBe(firstY);
  });

  it('update() deactivates expired particles', () => {
    const sim = new ParticleSimulation();
    sim.emit({ ...config, lifetime: [0.1, 0.1] }, 0.1);
    expect(sim.getActiveCount()).toBeGreaterThan(0);
    sim.update(0.2);
    expect(sim.getActiveCount()).toBe(0);
  });

  it('getInstanceData() returns correct count and stride-7 data', () => {
    const sim = new ParticleSimulation();
    sim.emit(config, 0.1);
    const { data, count } = sim.getInstanceData();
    expect(count).toBe(sim.getActiveCount());
    expect(data.length).toBe(count * 7);
    expect(data).toBeInstanceOf(Float32Array);
  });

  it('reset() clears all particles', () => {
    const sim = new ParticleSimulation();
    sim.emit(config, 0.5);
    expect(sim.getActiveCount()).toBeGreaterThan(0);
    sim.reset();
    expect(sim.getActiveCount()).toBe(0);
  });
});
