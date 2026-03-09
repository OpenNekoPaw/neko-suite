/**
 * Types Module - Export all type definitions
 * 类型模块 - 导出所有类型定义
 *
 * Core types are re-exported from @neko/shared for Single Source of Truth.
 * Webview-specific extensions (i18n keys, presets, factory functions) are defined locally.
 *
 * IMPORTANT: TimelineElement and TimelineTrack are re-exported as EditorElement/EditorTrack
 * which extend the engine types with UI-only fields (animTransform, masks, solo, etc.).
 * This allows the webview Store to store UI state on elements/tracks without
 * polluting the engine-aligned types in @neko/shared.
 */

// Re-export core types from shared (engine-aligned)
export type {
  // Re-export engine element subtypes directly
  MediaElement,
  TextElement,
  AudioElement,
  ShapeElement,
  SubtitleElement,
  // Project
  ProjectData,
  // Track type enum
  TrackType,
} from '@neko/shared';

// Re-export editor-extended types as the "default" element/track types in webview
// This means all webview code that imports TimelineElement/TimelineTrack gets the
// extended versions with UI fields, without changing any import statements.
export type {
  EditorElement as TimelineElement,
  EditorTrack as TimelineTrack,
} from './editor-types';

// Editor-extended types (also available under their own names)
export {
  type EditorElement,
  type EditorMediaElement,
  type EditorAudioElement,
  type EditorTextElement,
  type EditorShapeElement,
  type EditorSubtitleElement,
  type EditorTrack,
  toEngineElement,
  toEngineTrack,
} from './editor-types';

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
export * from './keyframe';
export * from './ui-state';
export * from './shape';
export * from './subtitle';
