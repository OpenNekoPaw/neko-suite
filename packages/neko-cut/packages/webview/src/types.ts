// =============================================================================
// Unified Types - Re-export from shared package
// 统一类型 - 从 shared 包重新导出
// =============================================================================

// Re-export core types from shared package (Single Source of Truth)
export type {
  // Track types
  TrackType,
  // Timeline elements
  TimelineElement,
  MediaElement,
  TextElement,
  AudioElement,
  ShapeElement,
  // Tracks
  TimelineTrack,
  // Project
  ProjectData,
  ProjectDefaults,
  // Transform
  Transform,
  ElementTransform,
  ComputedTransform,
  AnimatableProperty,
  AnimationKeyframe,
  AnimatablePropertyName,
  BezierHandle,
  // Easing
  EasingType,
  // Blend modes
  BlendModeType,
  // Color correction
  ColorCorrection,
  BasicColorAdjustment,
  CurvesAdjustment,
  CurveAdjustment,
  CurvePoint,
  CurveChannel,
  HSLAdjustment,
  HSLRangeAdjustment,
  HSLColorRange,
  LUTAdjustment,
  VignetteParams,
  ColorWheelsParams,
  ColorWheelValue,
  // Transitions
  Transition,
  TransitionType,
  TransitionDirection,
  TransitionParams,
  ElementTransition,
  TransitionPlacement,
  // Effects
  EffectType,
  EffectParams,
  EffectCategory,
  EffectParameterType,
  EffectParameterValue,
  EffectParameterKeyframe,
  AnimatableEffectParameter,
  EffectInstance,
  // Audio
  AudioProperties,
  SpeedProperties,
  // Masks
  MaskShape,
  MaskShapeType,
  MaskInstance,
  MaskAnimationData,
  MaskEasingType,
  MaskShapeKeyframe,
  MaskPropertyKeyframe,
  AnimatableMaskProperty,
  // Shapes
  ShapeType,
  Shape,
  RectangleShape,
  EllipseShape,
  PolygonShape,
  StarShape,
  LineShape,
  BezierShape,
  ShapeFill,
  ShapeStroke,
  ShapeShadow,
  ShapeStyle,
  ShapeInstance,
  GradientFill,
  GradientStop,
  GradientType,
  FillType,
  StrokeLineCap,
  StrokeLineJoin,
  // Geometry
  Point2D,
  BezierPoint,
  // Subtitles
  SubtitleTrack,
  SubtitleCue,
  SubtitleStyle,
  SubtitleFormat,
  // Messages
  MessageToWebview,
  MessageFromWebview,
  ExportProgressInfo,
  // AI Actions
  AIActionElementType,
  AIActionCapability,
  AIQuickAction,
} from '@neko/shared';

// Re-export AI action helpers
export {
  AI_ACTIONS,
  getActionsForElementType,
  mapElementTypeToAIType,
} from '@neko/shared';

// Re-export constants and functions from shared
export {
  // Transform defaults
  DEFAULT_TRANSFORM,
  // Color correction defaults
  DEFAULT_BASIC_COLOR_ADJUSTMENT,
  DEFAULT_CURVE,
  DEFAULT_CURVES_ADJUSTMENT,
  DEFAULT_HSL_RANGE,
  DEFAULT_HSL_ADJUSTMENT,
  DEFAULT_LUT_ADJUSTMENT,
  DEFAULT_VIGNETTE_PARAMS,
  DEFAULT_COLOR_WHEEL_VALUE,
  DEFAULT_COLOR_WHEELS_PARAMS,
  DEFAULT_COLOR_CORRECTION,
  // Audio defaults
  DEFAULT_AUDIO_PROPERTIES,
  // Animatable property helpers
  createAnimatableProperty,
  createDefaultElementTransform,
  // Shape defaults
  DEFAULT_SHAPE_FILL,
  DEFAULT_SHAPE_STROKE,
  DEFAULT_SHAPE_SHADOW,
  DEFAULT_SHAPE_STYLE,
} from '@neko/shared';

// =============================================================================
// Re-export Types from Local Modules (webview-specific extensions)
// =============================================================================

// Transition types (local extensions)
export type {
  TransitionPreset,
  TransitionCategory,
} from './types/transition';

// Re-export transition utilities
export {
  TRANSITION_TYPE_I18N_KEYS,
  TRANSITION_ICONS,
  TRANSITION_PRESETS,
  createTransition,
  createElementTransition,
  createTransitionFromPreset,
  getTransitionIcon,
  isDirectionalTransition,
  getOppositeTransition,
  is3DTransition,
  requiresColorParam,
  getTransitionCategory,
} from './types/transition';

// Color correction types (local extensions)
export type {
  ColorCorrectionPreset
} from './types/colorCorrection';

// Effect types (local extensions)
export type {
  EffectDefinition,
} from './types/effects';

// Subtitle types (local extensions)
export type {
  SubtitleTemplate
} from './types/subtitle';

// Blend mode types (local extensions)
export type {
  BlendMode,
  BlendModeCategory,
  BlendModeDefinition
} from './types/blendModes';

// Re-export shape factory functions (local implementations)
export {
  createRectangleShape,
  createEllipseShape,
  createPolygonShape,
  createStarShape,
  createLineShape,
  createBezierShape,
  createDefaultFill,
  createDefaultStroke,
  createDefaultShadow,
  createDefaultShapeStyle,
  createShapeInstance,
  cloneShapeInstance,
  getShapeBounds,
  isPointInShape,
  generateStarPoints,
  isRectangleShape,
  isEllipseShape,
  isPolygonShape,
  isStarShape,
  isLineShape,
  isBezierShape,
} from './types/shape';

// Re-export capability interfaces
export type {
  ITimelineElementBase,
  IAnimatable,
  IAudioCapable,
  IEffectable,
  IMediaSource,
} from './types/capabilities';

// Re-export utility functions
export {
  isAnimatable,
  isAudioCapable,
  isEffectable,
  hasMediaSource,
  getEffectiveDuration,
  getElementEndTime,
  isTimeInElement,
} from './types/capabilities';

// =============================================================================
// All Timeline Element (includes shapes)
// =============================================================================

import type { TimelineElement, ShapeElement } from '@neko/shared';

/**
 * All timeline element types including shapes
 */
export type AllTimelineElement = TimelineElement | ShapeElement;

// =============================================================================
// VSCode API Type (re-export from shared)
// =============================================================================

export type { VSCodeAPI } from '@neko/shared';

declare global {
  function acquireVsCodeApi(): import('@neko/shared').VSCodeAPI;
}
