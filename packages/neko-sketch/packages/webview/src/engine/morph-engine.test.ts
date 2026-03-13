import { describe, it, expect } from 'vitest';
import { applyMorphTargets, sampleAnimation } from './morph-engine';
import type { MorphTarget, MorphAnimation } from '../types/morph';

const base: [number, number][] = [
  [0, 0],
  [1, 1],
];
const target: MorphTarget = {
  id: 't1',
  name: 'smile',
  vertices: [
    [2, 3],
    [4, 5],
  ],
  weight: 0,
};

describe('applyMorphTargets', () => {
  it('returns base vertices when weights map is empty', () => {
    const result = applyMorphTargets(base, [target], new Map());
    expect(result).toEqual([
      [0, 0],
      [1, 1],
    ]);
  });

  it('adds full delta when weight = 1', () => {
    const result = applyMorphTargets(base, [target], new Map([['t1', 1]]));
    expect(result).toEqual([
      [2, 3],
      [5, 6],
    ]);
  });

  it('adds half delta when weight = 0.5', () => {
    const result = applyMorphTargets(base, [target], new Map([['t1', 0.5]]));
    expect(result).toEqual([
      [1, 1.5],
      [3, 3.5],
    ]);
  });
});

describe('sampleAnimation', () => {
  const anim: MorphAnimation = {
    id: 'a1',
    name: 'blink',
    duration: 2,
    loop: false,
    keyframes: [
      { time: 0, weights: { t1: 0 }, easing: 'linear' },
      { time: 1, weights: { t1: 1 }, easing: 'linear' },
    ],
  };

  it('returns exact weights at keyframe time', () => {
    expect(sampleAnimation(anim, 0)).toEqual(new Map([['t1', 0]]));
    expect(sampleAnimation(anim, 2)).toEqual(new Map([['t1', 1]]));
  });

  it('interpolates linearly between keyframes', () => {
    const w = sampleAnimation(anim, 1); // t=1 → normalized 0.5
    expect(w.get('t1')).toBeCloseTo(0.5);
  });

  it('wraps around with loop enabled', () => {
    const loopAnim: MorphAnimation = { ...anim, loop: true };
    // time=3 with duration=2 → normalized t = 1.5 % 1 = 0.5
    const w = sampleAnimation(loopAnim, 3);
    expect(w.get('t1')).toBeCloseTo(0.5);
  });

  it('returns empty map with no keyframes', () => {
    const empty: MorphAnimation = {
      id: 'e',
      name: 'empty',
      keyframes: [],
      duration: 1,
      loop: false,
    };
    expect(sampleAnimation(empty, 0.5)).toEqual(new Map());
  });
});
