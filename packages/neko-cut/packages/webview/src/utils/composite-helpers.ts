/**
 * Composite Helpers — Convert UI mask/effect data to CompositeLayerConfig format
 *
 * Bridges the gap between webview-local types (MaskInstance, EffectInstance)
 * and the engine-compatible composite types (CompositeMask, CompositeEffect).
 */

import type { CompositeMask, CompositeMaskShape } from '@neko/shared';
import type { MaskInstance, MaskShape } from '../types/mask';
import { getComputedMaskAtTime } from '../types/mask';

/**
 * Convert MaskInstance[] to CompositeMask[] for engine rendering.
 * Evaluates mask animations at the given local time and converts
 * shapes to the engine-compatible geometry format.
 */
export function buildCompositeMasks(masks: MaskInstance[], localTime: number): CompositeMask[] {
  return masks
    .filter((m) => m.enabled)
    .sort((a, b) => a.order - b.order)
    .map((mask) => {
      const computed = getComputedMaskAtTime(mask, localTime);
      return {
        shape: convertMaskShape(computed.shape),
        inverted: mask.inverted,
        feather: computed.feather,
        expansion: computed.expansion,
        opacity: computed.opacity,
        blendMode: mask.blendMode,
      };
    });
}

/**
 * Convert webview MaskShape to engine CompositeMaskShape.
 * Maps between the UI shape types and the engine-compatible geometry format.
 */
function convertMaskShape(shape: MaskShape): CompositeMaskShape {
  switch (shape.type) {
    case 'rectangle':
      return {
        type: 'rectangle',
        centerX: shape.centerX,
        centerY: shape.centerY,
        width: shape.width,
        height: shape.height,
        rotation: shape.rotation,
        cornerRadius: shape.cornerRadius,
      };
    case 'ellipse':
      return {
        type: 'ellipse',
        centerX: shape.centerX,
        centerY: shape.centerY,
        width: shape.width,
        height: shape.height,
        rotation: shape.rotation,
      };
    case 'polygon':
      return {
        type: 'polygon',
        points: shape.points.map((p) => ({ x: p.x, y: p.y })),
      };
    case 'bezier':
      return {
        type: 'bezier',
        controlPoints: shape.points.map((p) => ({
          position: { x: p.anchor.x, y: p.anchor.y },
          handleIn: { x: p.handleIn.x, y: p.handleIn.y },
          handleOut: { x: p.handleOut.x, y: p.handleOut.y },
        })),
        closed: shape.closed,
      };
  }
}
