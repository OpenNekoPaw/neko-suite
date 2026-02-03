/**
 * Color Correction Types
 * 颜色校正类型定义
 *
 * Core types are imported from @uniedit/shared for Single Source of Truth.
 * This file extends with webview-specific utilities (presets, LUT data structure).
 */

// =============================================================================
// Re-export Core Types from Shared
// =============================================================================

export type {
  BasicColorAdjustment,
  CurvePoint,
  CurveChannel,
  CurveAdjustment,
  CurvesAdjustment,
  ColorWheelValue,
  ColorWheelsParams,
  HSLColorRange,
  HSLRangeAdjustment,
  HSLAdjustment,
  LUTAdjustment,
  VignetteParams,
  ColorCorrection,
} from '@uniedit/shared';

export {
  DEFAULT_BASIC_COLOR_ADJUSTMENT,
  DEFAULT_CURVE,
  DEFAULT_CURVES_ADJUSTMENT,
  DEFAULT_COLOR_WHEEL_VALUE,
  DEFAULT_COLOR_WHEELS_PARAMS,
  DEFAULT_HSL_RANGE,
  DEFAULT_HSL_ADJUSTMENT,
  DEFAULT_LUT_ADJUSTMENT,
  DEFAULT_VIGNETTE_PARAMS,
  DEFAULT_COLOR_CORRECTION,
} from '@uniedit/shared';

import type { ColorCorrection } from '@uniedit/shared';
import { DEFAULT_COLOR_CORRECTION } from '@uniedit/shared';

// =============================================================================
// Webview-Specific Extensions: LUT Data Structure
// =============================================================================

/**
 * LUT data structure (webview-specific, for runtime LUT loading)
 * LUT数据结构（webview特有，用于运行时LUT加载）
 */
export interface LUTData {
  /** LUT identifier */
  id: string;
  /** Display name */
  name: string;
  /** LUT size (e.g., 17, 33, 65) */
  size: number;
  /** 3D LUT data (flattened RGB values) */
  data: Float32Array;
  /** Original file name */
  fileName?: string;
}

// =============================================================================
// Webview-Specific Extensions: Factory Functions
// =============================================================================

/**
 * Create a new color correction with default values
 */
export function createDefaultColorCorrection(): ColorCorrection {
  return structuredClone(DEFAULT_COLOR_CORRECTION);
}

// =============================================================================
// Webview-Specific Extensions: Color Correction Presets
// =============================================================================

/**
 * Color correction preset
 * 颜色校正预设
 */
export interface ColorCorrectionPreset {
  /** Preset identifier */
  id: string;
  /** Display name */
  name: string;
  /** Category (e.g., 'cinematic', 'vintage', 'portrait') */
  category: string;
  /** Preset settings */
  settings: Partial<ColorCorrection>;
  /** Thumbnail preview (base64 or URL) */
  thumbnail?: string;
}

/**
 * Built-in color correction presets
 * 内置颜色校正预设
 */
export const COLOR_CORRECTION_PRESETS: Record<string, Partial<ColorCorrection>> = {
  cinematicTealOrange: {
    enabled: true,
    basic: {
      ...DEFAULT_COLOR_CORRECTION.basic,
      contrast: 15,
      saturation: 10,
    },
    colorWheels: {
      shadows: { hue: 180, saturation: 120, luminance: -10 }, // Teal shadows
      midtones: { hue: 0, saturation: 100, luminance: 0 },
      highlights: { hue: 30, saturation: 125, luminance: 5 }, // Orange highlights
      global: { hue: 0, saturation: 100, luminance: 0 },
    },
  },
  vintageFilm: {
    enabled: true,
    basic: {
      ...DEFAULT_COLOR_CORRECTION.basic,
      contrast: -10,
      saturation: -20,
      temperature: 10,
    },
    vignette: {
      enabled: true,
      amount: -30,
      midpoint: 50,
      roundness: 0,
      feather: 60,
    },
  },
  coldBlue: {
    enabled: true,
    basic: {
      ...DEFAULT_COLOR_CORRECTION.basic,
      temperature: -30,
      contrast: 10,
    },
  },
  warmSunset: {
    enabled: true,
    basic: {
      ...DEFAULT_COLOR_CORRECTION.basic,
      temperature: 25,
      tint: 10,
      saturation: 15,
      vibrance: 20,
    },
  },
  blackWhite: {
    enabled: true,
    basic: {
      ...DEFAULT_COLOR_CORRECTION.basic,
      contrast: 30,
      saturation: -100,
      clarity: 20,
    },
  },
  highContrast: {
    enabled: true,
    basic: {
      ...DEFAULT_COLOR_CORRECTION.basic,
      contrast: 40,
      saturation: 10,
      clarity: 15,
    },
  },
  softPastel: {
    enabled: true,
    basic: {
      ...DEFAULT_COLOR_CORRECTION.basic,
      contrast: -20,
      saturation: -15,
      highlights: 20,
    },
  },
  bleachBypass: {
    enabled: true,
    basic: {
      ...DEFAULT_COLOR_CORRECTION.basic,
      contrast: 25,
      saturation: -30,
    },
  },
};
