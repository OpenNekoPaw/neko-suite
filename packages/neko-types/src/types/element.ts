// =============================================================================
// Timeline Elements — Aligned with Engine (domain/timeline.rs → Element)
//
// Authority: proto/timeline.proto → Element
// Engine fields on Element: id, name, elementType, startTime, duration,
//   trimStart, trimEnd, transform, opacity, blendMode, effects, muted,
//   hidden, locked
// UI-only fields (animTransform, colorCorrection, masks, keyframes,
//   transitionIn/Out, speed) have been moved to ui-state.ts → ElementEditState
// =============================================================================

import { Transform } from './transform';
import { BlendModeType } from './blendMode';
import { AudioProperties } from './audio';
import { EffectInstance } from './effects';

// =============================================================================
// Base Element — Engine-aligned fields only
// =============================================================================

interface BaseTimelineElement {
  /** Element ID */
  id: string;
  /** Element name */
  name: string;
  /** Duration on timeline (seconds) */
  duration: number;
  /** Start time on timeline (seconds) */
  startTime: number;
  /** Trim from start (seconds into source) */
  trimStart: number;
  /** Trim from end (seconds from source end) */
  trimEnd: number;
  /** 2D transform (engine has default: identity) */
  transform: Transform;
  /** Opacity (0.0-1.0, engine default: 1.0) */
  opacity: number;
  /** Blend mode (engine default: 'normal') */
  blendMode: BlendModeType;
  /** Applied effects */
  effects: EffectInstance[];
  /** Whether element is muted */
  muted: boolean;
  /** Whether element is hidden */
  hidden: boolean;
  /** Whether element is locked */
  locked: boolean;
  /** Audio properties (for media/audio elements) */
  audio?: AudioProperties;
}

// =============================================================================
// Concrete Element Types — Aligned with Engine's ElementType enum
// =============================================================================

export interface MediaElement extends BaseTimelineElement {
  type: 'media';
  /** Source file path */
  src: string;
  /** Resource ID (deterministic hash) */
  resourceId?: string;
  /** Media type hint (video/image) */
  mediaType?: 'video' | 'image';
  /** Linked audio element ID */
  linkedAudioId?: string;
}

export interface AudioElement extends BaseTimelineElement {
  type: 'audio';
  /** Source file path */
  src: string;
  /** Resource ID */
  resourceId?: string;
  /** Linked video element ID */
  linkedVideoId?: string;
}

export interface TextElement extends BaseTimelineElement {
  type: 'text';
  /** Text content */
  content: string;
  /** Font size in pixels (engine default: 48) */
  fontSize: number;
  /** Font family (engine default: "Arial") */
  fontFamily: string;
  /** Text color hex (engine default: "#ffffff") */
  color: string;
  /** Background color (engine default: "transparent") */
  backgroundColor: string;
  /** Text alignment (engine default: "center") */
  textAlign: 'left' | 'center' | 'right';
  /** Font weight (engine default: "normal") */
  fontWeight: 'normal' | 'bold';
  /** Font style (engine default: "normal") */
  fontStyle: 'normal' | 'italic';
  /** Text decoration — UI extension, not in engine */
  textDecoration?: 'none' | 'underline' | 'line-through';
  /** @deprecated Use transform.x instead */
  x?: number;
  /** @deprecated Use transform.y instead */
  y?: number;
  /** @deprecated Use transform.rotation instead */
  rotation?: number;
  /** Line height multiplier */
  lineHeight?: number;
  /** Letter spacing in pixels */
  letterSpacing?: number;
  /** Text stroke color */
  strokeColor?: string;
  /** Text stroke width */
  strokeWidth?: number;
  /** Drop shadow settings */
  shadow?: {
    color: string;
    offsetX: number;
    offsetY: number;
    blur: number;
  };
}

export interface ShapeElement extends BaseTimelineElement {
  type: 'shape';
  /** Shape type (engine field) */
  shapeType: string;
  /** Fill color (engine field) */
  fill: string;
  /** Stroke color (engine field) */
  stroke: string;
  /** Stroke width (engine field) */
  strokeWidth: number;
}

export interface SubtitleElement extends BaseTimelineElement {
  type: 'subtitle';
  /** Subtitle text (engine field) */
  text: string;
  /** Language code (e.g., 'en', 'zh-CN') — UI extension */
  language?: string;
  /** Whether this is the default subtitle track — UI extension */
  isDefault?: boolean;
}

export type TimelineElement = MediaElement | TextElement | AudioElement | ShapeElement | SubtitleElement;
