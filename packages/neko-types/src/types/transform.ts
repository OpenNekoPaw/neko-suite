// =============================================================================
// Transform
// =============================================================================

export interface Transform {
  /** X position (0-1 normalized, 0.5 = center) */
  x: number;
  /** Y position (0-1 normalized, 0.5 = center) */
  y: number;
  /** Scale X (1 = 100%) */
  scaleX: number;
  /** Scale Y (1 = 100%) */
  scaleY: number;
  /** Rotation in degrees */
  rotation: number;
  /** Anchor point X (0-1, 0.5 = center) */
  anchorX: number;
  /** Anchor point Y (0-1, 0.5 = center) */
  anchorY: number;
  /** Opacity (0-1, 1 = fully visible) */
  opacity?: number;
}

export const DEFAULT_TRANSFORM: Transform = {
  x: 0.5,
  y: 0.5,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  anchorX: 0.5,
  anchorY: 0.5,
};
