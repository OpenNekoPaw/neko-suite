import { describe, expect, it } from 'vitest';
import { cloneStampFromSource } from './clone-tool';

describe('clone stamp tool', () => {
  it('copies pixels from the frozen source buffer into the target buffer', () => {
    const source = new Uint8ClampedArray(3 * 1 * 4);
    source.set([20, 40, 60, 255], 0);
    source.set([100, 120, 140, 255], 4);
    source.set([200, 220, 240, 255], 8);
    const target = new Uint8ClampedArray(source);
    target.set([0, 0, 0, 0], 8);

    cloneStampFromSource(target, source, 3, 1, 2, 0, -2, 0, 0.5, 1);

    expect(Array.from(target.slice(8, 12))).toEqual([20, 40, 60, 255]);
  });

  it('uses the source snapshot rather than already-mutated target pixels', () => {
    const source = new Uint8ClampedArray(2 * 1 * 4);
    source.set([255, 0, 0, 255], 0);
    source.set([0, 0, 255, 255], 4);
    const target = new Uint8ClampedArray(source);
    target.set([0, 255, 0, 255], 0);

    cloneStampFromSource(target, source, 2, 1, 1, 0, -1, 0, 0.5, 1);

    expect(Array.from(target.slice(4, 8))).toEqual([255, 0, 0, 255]);
  });
});
