/**
 * Morph Engine
 *
 * Applies morph target deformations and samples keyframe-based weight animations.
 */
import type { MorphTarget, MorphAnimation, MorphEasing } from '../types/morph';

/**
 * Apply morph targets to base vertices using given weights.
 * Returns a new array of deformed vertices.
 */
export function applyMorphTargets(
  baseVertices: readonly [number, number][],
  targets: readonly MorphTarget[],
  weights: ReadonlyMap<string, number>,
): [number, number][] {
  const result: [number, number][] = baseVertices.map(([x, y]) => [x, y]);

  for (const target of targets) {
    const w = weights.get(target.id) ?? 0;
    if (Math.abs(w) < 1e-6) continue;

    for (let i = 0; i < Math.min(result.length, target.vertices.length); i++) {
      const delta = target.vertices[i];
      if (!delta) continue;
      const r = result[i];
      if (!r) continue;
      r[0] += delta[0] * w;
      r[1] += delta[1] * w;
    }
  }

  return result;
}

/**
 * Sample animation weights at a given time.
 * Returns a Map of targetId → interpolated weight.
 */
export function sampleAnimation(animation: MorphAnimation, time: number): Map<string, number> {
  const weights = new Map<string, number>();
  if (animation.keyframes.length === 0) return weights;

  const { duration, loop, keyframes } = animation;
  let t = duration > 0 ? time / duration : 0;
  if (loop) {
    t = t % 1;
    if (t < 0) t += 1;
  } else {
    t = Math.max(0, Math.min(1, t));
  }

  // Find surrounding keyframes
  let prevIdx = 0;
  let nextIdx = 0;
  for (let i = 0; i < keyframes.length; i++) {
    if (keyframes[i]!.time <= t) prevIdx = i;
    if (keyframes[i]!.time >= t) {
      nextIdx = i;
      break;
    }
    nextIdx = i;
  }

  const prev = keyframes[prevIdx]!;
  const next = keyframes[nextIdx]!;

  if (prevIdx === nextIdx) {
    for (const [id, w] of Object.entries(prev.weights)) {
      weights.set(id, w);
    }
    return weights;
  }

  // Interpolate
  const range = next.time - prev.time;
  const localT = range > 0 ? (t - prev.time) / range : 0;
  const easedT = applyEasing(localT, next.easing);

  // Collect all target ids
  const allIds = new Set([...Object.keys(prev.weights), ...Object.keys(next.weights)]);
  for (const id of allIds) {
    const a = prev.weights[id] ?? 0;
    const b = next.weights[id] ?? 0;
    weights.set(id, a + (b - a) * easedT);
  }

  return weights;
}

function applyEasing(t: number, easing: MorphEasing): number {
  switch (easing) {
    case 'ease-in':
      return t * t;
    case 'ease-out':
      return t * (2 - t);
    case 'ease-in-out':
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    case 'linear':
    default:
      return t;
  }
}
