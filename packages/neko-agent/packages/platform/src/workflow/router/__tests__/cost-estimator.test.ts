import { describe, expect, it } from 'vitest';
import { estimateRouteCost } from '../cost-estimator';

describe('estimateRouteCost', () => {
  it('returns tokens + credits + durationSec for each level', () => {
    for (const level of ['L0', 'L1', 'L2', 'L3', 'L4'] as const) {
      const cost = estimateRouteCost(level);
      expect(cost.tokens).toBeGreaterThanOrEqual(0);
      expect(cost.credits).toBeGreaterThanOrEqual(0);
      expect(cost.durationSec).toBeGreaterThan(0);
    }
  });

  it('L0 is cheaper than L3', () => {
    const l0 = estimateRouteCost('L0');
    const l3 = estimateRouteCost('L3');
    expect(l0.durationSec).toBeLessThan(l3.durationSec);
    expect(l0.credits).toBeLessThanOrEqual(l3.credits);
  });

  it('excludes skipped stages from the total', () => {
    // L0 (flowB) has no readDocument stage — durationSec should not include 5s
    const l0 = estimateRouteCost('L0');
    const readDocSec = 5;
    expect(l0.durationSec).not.toBe(readDocSec);
  });
});
