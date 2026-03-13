/**
 * Morph animation types
 *
 * Defines morph targets and keyframe-based weight animation.
 */

export interface MorphTarget {
  readonly id: string;
  readonly name: string;
  readonly vertices: readonly [number, number][];
  weight: number;
}

export type MorphEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

export interface MorphKeyframe {
  readonly time: number;
  readonly weights: Record<string, number>;
  readonly easing: MorphEasing;
}

export interface MorphAnimation {
  readonly id: string;
  readonly name: string;
  readonly keyframes: readonly MorphKeyframe[];
  readonly duration: number;
  readonly loop: boolean;
}
