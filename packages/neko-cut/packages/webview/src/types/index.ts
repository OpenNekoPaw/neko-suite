/**
 * Types Module - Export all type definitions
 * 类型模块 - 导出所有类型定义
 *
 * Core types are re-exported from @uniedit/shared for Single Source of Truth.
 * Webview-specific extensions (i18n keys, presets, factory functions) are defined locally.
 */

// Re-export core types from shared
export type {
  TimelineElement,
  MediaElement,
  TextElement,
  AudioElement,
  ShapeElement,
  SubtitleElement,
  ProjectData,
  TimelineTrack,
  TrackType,
} from '@uniedit/shared';

export * from './animation';
export * from './transition';
// colorCorrection types - VignetteParams here is for color correction (from shared)
// effects.ts now uses VignetteEffectParams for visual effects (distinct type)
export {
  type BasicColorAdjustment,
  type CurvePoint,
  type CurveChannel,
  type CurveAdjustment,
  type CurvesAdjustment,
  type ColorWheelValue,
  type ColorWheelsParams,
  type HSLColorRange,
  type HSLRangeAdjustment,
  type HSLAdjustment,
  type LUTAdjustment,
  type VignetteParams,
  type ColorCorrection,
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
  type LUTData,
  type ColorCorrectionPreset,
  COLOR_CORRECTION_PRESETS,
  createDefaultColorCorrection,
} from './colorCorrection';
export * from './effects';
export * from './mask';
export * from './shape';
export * from './subtitle';
