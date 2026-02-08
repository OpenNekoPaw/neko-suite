/**
 * Editor Types — Webview-local extended types
 *
 * These types extend the engine-aligned @neko/shared types with UI-only fields
 * that the editor needs but the engine doesn't recognize.
 *
 * Architecture:
 *   @neko/shared (engine-aligned)     →  TimelineElement (12 fields)
 *   webview/editor-types.ts (this)    →  EditorElement = TimelineElement & ElementEditState
 *
 * The editor stores EditorElement objects in project.tracks[].elements[].
 * When sending to the engine, only the base TimelineElement fields are extracted.
 * The UI-only fields (animTransform, colorCorrection, masks, etc.) are stripped.
 *
 * This approach avoids a massive refactor of the Store while keeping
 * @neko/shared types clean and engine-aligned.
 */

import type {
  TimelineElement,
  MediaElement,
  AudioElement,
  TextElement,
  ShapeElement,
  SubtitleElement,
  TimelineTrack,
  ElementEditState,
  TrackUIState,
} from '@neko/shared';

// =============================================================================
// Extended Element Types (Engine fields + UI fields)
// =============================================================================

/**
 * Editor element — TimelineElement with optional UI edit state fields.
 *
 * Used throughout the webview Store and components.
 * The UI fields are stored directly on the element for convenience,
 * but are NOT sent to the engine.
 */
export type EditorElement = TimelineElement & Partial<ElementEditState>;

/** Editor media element */
export type EditorMediaElement = MediaElement & Partial<ElementEditState>;

/** Editor audio element */
export type EditorAudioElement = AudioElement & Partial<ElementEditState>;

/** Editor text element */
export type EditorTextElement = TextElement & Partial<ElementEditState>;

/** Editor shape element */
export type EditorShapeElement = ShapeElement & Partial<ElementEditState>;

/** Editor subtitle element */
export type EditorSubtitleElement = SubtitleElement & Partial<ElementEditState>;

// =============================================================================
// Extended Track Type (Engine fields + UI fields)
// =============================================================================

/**
 * Editor track — TimelineTrack with optional UI state fields.
 *
 * Used throughout the webview Store and components.
 * The UI fields (solo, color, height, etc.) are stored directly on the track
 * for convenience, but are NOT sent to the engine.
 */
export type EditorTrack = TimelineTrack & Partial<TrackUIState>;

// =============================================================================
// Utility: Strip UI fields for engine communication
// =============================================================================

/**
 * Strip UI-only fields from an editor element, returning engine-compatible data.
 * Used when sending element data to the engine.
 */
export function toEngineElement(element: EditorElement): TimelineElement {
  const {
    // Strip UI-only fields
    animTransform: _animTransform,
    colorCorrection: _colorCorrection,
    masks: _masks,
    keyframes: _keyframes,
    transitionIn: _transitionIn,
    transitionOut: _transitionOut,
    speed: _speed,
    // Keep everything else
    ...engineFields
  } = element;
  return engineFields as TimelineElement;
}

/**
 * Strip UI-only fields from an editor track, returning engine-compatible data.
 * Used when sending track data to the engine.
 */
export function toEngineTrack(track: EditorTrack): TimelineTrack {
  const {
    // Strip UI-only fields
    solo: _solo,
    color: _color,
    height: _height,
    collapsed: _collapsed,
    opacity: _opacity,
    blendMode: _blendMode,
    transitions: _transitions,
    // Keep everything else
    ...engineFields
  } = track;
  return engineFields as TimelineTrack;
}
