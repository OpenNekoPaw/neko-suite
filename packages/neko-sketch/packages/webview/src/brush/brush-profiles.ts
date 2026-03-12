/**
 * Brush Definitions
 *
 * Default settings and dab generation for each brush type.
 * Each brush produces a circular dab with type-specific characteristics.
 */
import type { BrushType, BrushSettings } from '../types';
import type { PressureCurveType } from './pressure-mapper';

/** Brush-specific configuration */
export interface BrushProfile {
  readonly type: BrushType;
  readonly label: string;
  readonly defaultSize: number;
  readonly defaultOpacity: number;
  readonly defaultHardness: number;
  readonly defaultSpacing: number;
  readonly pressureCurve: PressureCurveType;
  readonly minSizeFraction: number;
  readonly minOpacityFraction: number;
  readonly accumulative: boolean; // true = opacity builds up per dab
}

export const BRUSH_PROFILES: Record<BrushType, BrushProfile> = {
  pencil: {
    type: 'pencil',
    label: 'Pencil',
    defaultSize: 4,
    defaultOpacity: 0.8,
    defaultHardness: 0.9,
    defaultSpacing: 0.15,
    pressureCurve: 'linear',
    minSizeFraction: 0.3,
    minOpacityFraction: 0.2,
    accumulative: false,
  },
  pen: {
    type: 'pen',
    label: 'Pen',
    defaultSize: 6,
    defaultOpacity: 1.0,
    defaultHardness: 0.85,
    defaultSpacing: 0.1,
    pressureCurve: 'sCurve',
    minSizeFraction: 0.1,
    minOpacityFraction: 0.0,
    accumulative: false,
  },
  watercolor: {
    type: 'watercolor',
    label: 'Watercolor',
    defaultSize: 30,
    defaultOpacity: 0.3,
    defaultHardness: 0.1,
    defaultSpacing: 0.08,
    pressureCurve: 'soft',
    minSizeFraction: 0.5,
    minOpacityFraction: 0.1,
    accumulative: true,
  },
  airbrush: {
    type: 'airbrush',
    label: 'Airbrush',
    defaultSize: 40,
    defaultOpacity: 0.15,
    defaultHardness: 0.0,
    defaultSpacing: 0.05,
    pressureCurve: 'soft',
    minSizeFraction: 0.3,
    minOpacityFraction: 0.0,
    accumulative: true,
  },
  eraser: {
    type: 'eraser',
    label: 'Eraser',
    defaultSize: 20,
    defaultOpacity: 1.0,
    defaultHardness: 0.7,
    defaultSpacing: 0.1,
    pressureCurve: 'linear',
    minSizeFraction: 0.2,
    minOpacityFraction: 0.0,
    accumulative: false,
  },
  marker: {
    type: 'marker',
    label: 'Marker',
    defaultSize: 16,
    defaultOpacity: 0.6,
    defaultHardness: 0.5,
    defaultSpacing: 0.08,
    pressureCurve: 'firm',
    minSizeFraction: 0.8,
    minOpacityFraction: 0.3,
    accumulative: true,
  },
  pixel: {
    type: 'pixel',
    label: 'Pixel',
    defaultSize: 1,
    defaultOpacity: 1.0,
    defaultHardness: 1.0,
    defaultSpacing: 1.0,
    pressureCurve: 'linear',
    minSizeFraction: 1.0,
    minOpacityFraction: 1.0,
    accumulative: false,
  },
};

/** Get default BrushSettings for a brush type */
export function getDefaultBrushSettings(type: BrushType, color = '#000000'): BrushSettings {
  const profile = BRUSH_PROFILES[type];
  return {
    type,
    size: profile.defaultSize,
    opacity: profile.defaultOpacity,
    hardness: profile.defaultHardness,
    spacing: profile.defaultSpacing,
    color,
    pressureSizeEnabled: true,
    pressureOpacityEnabled: type !== 'pixel',
  };
}
