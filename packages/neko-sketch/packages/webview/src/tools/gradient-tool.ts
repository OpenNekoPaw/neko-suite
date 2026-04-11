/**
 * Gradient Tool
 *
 * Drag to define gradient direction (linear) or center+radius (radial).
 * Renders into the active layer's FBO via a dedicated GLSL shader.
 */

export type GradientType = 'linear' | 'radial';

export interface GradientState {
  readonly type: GradientType;
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
  /** Start color RGBA [0-1] */
  readonly color0: readonly [number, number, number, number];
  /** End color RGBA [0-1] */
  readonly color1: readonly [number, number, number, number];
}

/** Compute gradient radius for radial mode */
export function gradientRadius(state: GradientState): number {
  const dx = state.endX - state.startX;
  const dy = state.endY - state.startY;
  return Math.sqrt(dx * dx + dy * dy);
}
