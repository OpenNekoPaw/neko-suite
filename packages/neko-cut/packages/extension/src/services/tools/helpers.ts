/**
 * Pure helper functions for timeline tool operations.
 */

import * as path from 'path';
import type { ProjectData, TimelineElement, TimelineTrack } from '@neko/shared';

// =============================================================================
// Tool Element Types
// =============================================================================

/**
 * Runtime element shape as seen by tool handlers.
 *
 * ProjectData from the webview stores EditorElement objects which carry
 * UI extension fields (colorCorrection, masks, keyframes, etc.) alongside
 * engine-aligned TimelineElement fields. This type makes those runtime
 * fields visible to handlers without importing webview-internal types.
 */
export interface ToolElementExtensions {
  /** Color correction settings (UI-only, not engine field) */
  colorCorrection?: Record<string, unknown>;
  /** Mask instances (UI-only, pending engine support) */
  masks?: Array<Record<string, unknown>>;
  /** Legacy keyframe animations (UI-only, pending engine migration) */
  keyframes?: Record<string, unknown>;
  /** Audio keyframe animations (UI-only) */
  audioKeyframes?: Record<string, unknown[]>;
}

/** TimelineElement with optional UI extension fields visible at runtime */
export type ToolElement = TimelineElement & Partial<ToolElementExtensions>;

/**
 * Runtime track shape as seen by tool handlers.
 * Tracks may carry UI extension fields like shapes.
 */
export interface ToolTrackExtensions {
  /** Shape instances on the track (UI-only) */
  shapes?: Array<Record<string, unknown>>;
}

/** TimelineTrack with optional UI extension fields visible at runtime */
export type ToolTrack = TimelineTrack & Partial<ToolTrackExtensions>;

// =============================================================================
// Element Utilities
// =============================================================================

/**
 * Merge updates into an element, returning a TimelineElement.
 * Centralizes the spread+cast pattern that TS requires when updating
 * discriminated union members (spread loses the discriminant tag).
 */
export function mergeElement(base: ToolElement, updates: Record<string, unknown>): TimelineElement {
  return { ...base, ...updates } as TimelineElement;
}

/**
 * Create a TimelineElement from a partial object literal.
 * Used by AddElement where the handler constructs a new element
 * with only the fields relevant to its type.
 */
export function createElement(fields: Record<string, unknown>): TimelineElement {
  return fields as unknown as TimelineElement;
}

export function toRelativeIfAbsolute(filePath: string, baseDir: string): string {
  if (!path.isAbsolute(filePath)) {
    return filePath;
  }

  let relativePath = path.relative(baseDir, filePath);
  relativePath = relativePath.split(path.sep).join('/');
  return relativePath;
}

export function normalizePathsForSave(project: ProjectData, projectFilePath?: string): ProjectData {
  if (!projectFilePath) {
    return project;
  }

  const baseDir = path.dirname(projectFilePath);

  return {
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      elements: track.elements.map((element) => {
        if (
          (element.type === 'media' || element.type === 'audio' || element.type === 'scene3d') &&
          typeof element.src === 'string'
        ) {
          return { ...element, src: toRelativeIfAbsolute(element.src, baseDir) } as TimelineElement;
        }
        return element;
      }),
    })),
  };
}

export function findElement(
  project: ProjectData,
  elementId: string,
): {
  trackIndex: number;
  elementIndex: number;
  track: ToolTrack;
  element: ToolElement;
} | null {
  for (let trackIndex = 0; trackIndex < project.tracks.length; trackIndex++) {
    const track = project.tracks[trackIndex];
    if (!track) continue;
    const elementIndex = track.elements.findIndex((e) => e.id === elementId);
    if (elementIndex !== -1) {
      const element = track.elements[elementIndex];
      if (!element) continue;
      return {
        trackIndex,
        elementIndex,
        track: track as ToolTrack,
        element: element as ToolElement,
      };
    }
  }
  return null;
}

export function updateElementAt(
  project: ProjectData,
  trackIndex: number,
  elementIndex: number,
  updatedElement: TimelineElement,
): ProjectData {
  const track = project.tracks[trackIndex];
  if (!track) throw new Error(`Track index out of bounds: ${trackIndex}`);
  const updatedElements = [...track.elements];
  updatedElements[elementIndex] = updatedElement;
  const updatedTrack: TimelineTrack = { ...track, elements: updatedElements };
  const updatedTracks = [...project.tracks];
  updatedTracks[trackIndex] = updatedTrack;
  return { ...project, tracks: updatedTracks };
}

export function removeElementAt(
  project: ProjectData,
  trackIndex: number,
  elementIndex: number,
): ProjectData {
  const track = project.tracks[trackIndex];
  if (!track) throw new Error(`Track index out of bounds: ${trackIndex}`);
  const updatedElements = [...track.elements];
  updatedElements.splice(elementIndex, 1);
  const updatedTrack: TimelineTrack = { ...track, elements: updatedElements };
  const updatedTracks = [...project.tracks];
  updatedTracks[trackIndex] = updatedTrack;
  return { ...project, tracks: updatedTracks };
}

// Legacy keyframe structure compatible with webview Record format
export type LegacyKeyframe = { id: string; time: number; value: unknown; easing: string };

export function getLegacyKeyframes(element: ToolElement): Record<string, LegacyKeyframe[]> {
  const keyframes = element.keyframes;
  if (!keyframes || typeof keyframes !== 'object' || Array.isArray(keyframes)) {
    return {};
  }
  return keyframes as Record<string, LegacyKeyframe[]>;
}

export function normalizePercent(value: number | undefined, fallback: number): number {
  if (value === undefined || Number.isNaN(value)) {
    return fallback;
  }
  if (value >= 0 && value <= 1) {
    return value * 100;
  }
  return value;
}
