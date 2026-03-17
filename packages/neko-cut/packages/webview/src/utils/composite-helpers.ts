/**
 * Composite Helpers — Convert UI mask/effect/transition data to CompositeLayerConfig format
 *
 * Bridges the gap between webview-local types (MaskInstance, EffectInstance)
 * and the engine-compatible composite types (CompositeMask, CompositeEffect, CompositeTransition).
 */

import type {
  CompositeMask,
  CompositeMaskShape,
  CompositeEffect,
  CompositeLayerConfig,
} from '@neko/shared';
import type { MaskInstance, MaskShape } from '../types/mask';
import { getComputedMaskAtTime } from '../types/mask';
import type { ColorCorrection } from '../types/colorCorrection';
import { DEFAULT_BASIC_COLOR_ADJUSTMENT } from '../types/colorCorrection';
import type { EffectInstance } from '@neko/shared';

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
 * Detect and apply transitions between adjacent layers on the same track.
 *
 * When element A has transitionOut and element B has transitionIn,
 * the overlap region creates a transition. This function annotates
 * the affected layers with CompositeTransition data.
 *
 * @param layers - Mutable layers array (modified in place)
 * @param trackElements - Elements sorted by startTime within each track
 * @param time - Current timeline time
 */
export function applyTransitions(
  layers: CompositeLayerConfig[],
  trackElements: Array<{
    elements: Array<{
      id: string;
      startTime: number;
      duration: number;
      transitionIn?: { type: string; duration: number; easing?: string };
      transitionOut?: { type: string; duration: number; easing?: string };
    }>;
  }>,
  time: number,
): void {
  // Build elementId → layer index map for O(1) lookup
  const idToLayerIdx = new Map<string, number>();
  layers.forEach((l, idx) => {
    if (l.elementId) idToLayerIdx.set(l.elementId, idx);
  });

  // Track-level: check adjacent pairs for transition overlap
  for (const track of trackElements) {
    for (let i = 0; i < track.elements.length - 1; i++) {
      const elemA = track.elements[i];
      const elemB = track.elements[i + 1];
      if (!elemA || !elemB) continue;

      const transOut = elemA.transitionOut;
      const transIn = elemB.transitionIn;

      // Use the transition that exists (prefer outgoing)
      const trans = transOut ?? transIn;
      if (!trans) continue;

      const transitionDuration = trans.duration;
      const overlapStart = elemB.startTime;
      const overlapEnd = overlapStart + transitionDuration;

      // Check if current time is within the transition window
      if (time < overlapStart || time >= overlapEnd) continue;

      const progress = (time - overlapStart) / transitionDuration;

      // Find the corresponding layers by element ID
      const layerAIdx = idToLayerIdx.get(elemA.id);
      const layerBIdx = idToLayerIdx.get(elemB.id);

      if (layerAIdx !== undefined && layerBIdx !== undefined) {
        const layerA = layers[layerAIdx];
        if (layerA) {
          layerA.transition = {
            type: trans.type,
            progress,
            pairedLayerIndex: layerBIdx,
            easing: trans.easing ?? 'linear',
          };
        }
      }
    }
  }
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

/**
 * Convert ColorCorrection basic parameters to a CompositeEffect for engine rendering.
 * Maps UI ranges (-100..100) to engine ranges (-1.0..1.0).
 * Returns null if correction is disabled or all values are at identity.
 */
export function colorCorrectionToCompositeEffect(cc: ColorCorrection): CompositeEffect | null {
  if (!cc.enabled) return null;

  const b = cc.basic;
  const def = DEFAULT_BASIC_COLOR_ADJUSTMENT;

  // Check if all basic params are at default (identity)
  const isIdentity =
    b.brightness === def.brightness &&
    b.exposure === def.exposure &&
    b.contrast === def.contrast &&
    b.highlights === def.highlights &&
    b.shadows === def.shadows &&
    b.whites === def.whites &&
    b.blacks === def.blacks &&
    b.temperature === def.temperature &&
    b.tint === def.tint &&
    b.saturation === def.saturation &&
    b.vibrance === def.vibrance &&
    b.gamma === def.gamma &&
    b.hueShift === def.hueShift;

  if (isIdentity) return null;

  return {
    type: 'color-correction',
    parameters: {
      // Map UI ranges to engine ranges
      brightness: b.brightness / 100, // -100..100 → -1.0..1.0
      exposure: b.exposure, // -5..5 → -5.0..5.0 (already engine range)
      contrast: 1.0 + b.contrast / 100, // -100..100 → 0.0..2.0 (1.0 = no change)
      highlights: b.highlights / 100, // -100..100 → -1.0..1.0
      shadows: b.shadows / 100, // -100..100 → -1.0..1.0
      whites: b.whites / 100, // -100..100 → -1.0..1.0
      blacks: b.blacks / 100, // -100..100 → -1.0..1.0
      temperature: b.temperature / 100, // -100..100 → -1.0..1.0
      tint: b.tint / 100, // -100..100 → -1.0..1.0
      saturation: 1.0 + b.saturation / 100, // -100..100 → 0.0..2.0 (1.0 = no change)
      vibrance: b.vibrance / 100, // -100..100 → -1.0..1.0
      gamma: b.gamma, // 0.1..3.0 → 0.1..3.0 (already engine range)
      hueShift: b.hueShift, // -180..180 → -180..180 (already engine range)
    },
    order: -1, // Apply before user effects (lowest priority)
  };
}

/** Well-known ID for the auto-generated color-correction effect */
const COLOR_CORRECTION_EFFECT_ID = '__color-correction__';

/**
 * Convert ColorCorrection to an EffectInstance for the element.effects array.
 * This allows color correction to flow through the streaming path (element.update → engine).
 * Returns null if correction is disabled or at identity.
 */
export function colorCorrectionToEffectInstance(cc: ColorCorrection): EffectInstance | null {
  const composite = colorCorrectionToCompositeEffect(cc);
  if (!composite) return null;

  return {
    id: COLOR_CORRECTION_EFFECT_ID,
    type: composite.type,
    enabled: true,
    parameters: composite.parameters,
    order: composite.order,
  };
}

/**
 * Merge a color-correction effect into an existing effects array.
 * Replaces any existing color-correction effect, or adds a new one.
 * Returns a new array (does not mutate input).
 */
export function mergeColorCorrectionEffect(
  effects: EffectInstance[],
  cc: ColorCorrection,
): EffectInstance[] {
  const filtered = effects.filter((e) => e.id !== COLOR_CORRECTION_EFFECT_ID);
  const ccEffect = colorCorrectionToEffectInstance(cc);
  if (ccEffect) {
    return [ccEffect, ...filtered];
  }
  return filtered;
}
