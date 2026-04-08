/**
 * Pure helper functions for timeline tool operations.
 */

import * as path from 'path';
import * as vscode from 'vscode';
import {
  PathResolver,
  type ProjectData,
  type TimelineElement,
  type TimelineTrack,
} from '@neko/shared';

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

// =============================================================================
// Portable Path Utilities (PathVariable integration)
// =============================================================================

/**
 * Contract an absolute path to a portable path for storage.
 *
 * Priority:
 * 1. PathVariable: /Volumes/NAS/footage/clip.mp4 → ${FOOTAGE}/clip.mp4
 * 2. Relative to project dir: /project/assets/clip.mp4 → assets/clip.mp4
 */
async function contractPath(absolutePath: string, baseDir: string): Promise<string> {
  try {
    const contracted = await vscode.commands.executeCommand<string>(
      'neko.assets.contractPath',
      absolutePath,
    );
    if (contracted && contracted.startsWith('${')) return contracted;
  } catch {
    // neko-assets not active, fallback to relative
  }

  let relativePath = path.relative(baseDir, absolutePath);
  relativePath = relativePath.split(path.sep).join('/');
  return relativePath;
}

/**
 * Resolve a stored path (PathVariable or relative) to an absolute path.
 *
 * Uses @neko/shared PathResolver for variable expansion when a resolver
 * is available, otherwise falls back to neko.assets VSCode command.
 */
export async function resolveMediaPath(
  storedPath: string,
  baseDir: string,
  resolver?: PathResolver,
): Promise<string> {
  // If resolver is provided, use it directly (no async VSCode command needed)
  if (resolver) {
    const result = resolver.resolveSource(storedPath, baseDir);
    return result.type === 'local' ? result.path : storedPath;
  }

  // PathVariable: ${VAR}/rest → absolute (via neko-assets command)
  if (storedPath.startsWith('${')) {
    try {
      const resolved = await vscode.commands.executeCommand<string>(
        'neko.assets.resolvePath',
        storedPath,
      );
      if (resolved) return resolved;
    } catch {
      // neko-assets not active
    }
    return storedPath;
  }

  // Absolute path: return as-is
  if (path.isAbsolute(storedPath)) return storedPath;

  // Relative path: resolve against base dir with traversal protection
  const resolved = path.resolve(baseDir, storedPath);
  const normalized = path.normalize(resolved);
  if (
    !normalized.startsWith(path.normalize(baseDir) + path.sep) &&
    normalized !== path.normalize(baseDir)
  ) {
    throw new Error(`Path traversal blocked: "${storedPath}" resolves outside project directory`);
  }
  return normalized;
}

/**
 * Normalize all element paths in a project for saving.
 *
 * Converts absolute paths to portable paths:
 * - External paths → ${VAR}/rest (via PathResolver)
 * - Project-internal paths → relative to project dir
 */
export async function normalizePathsForSave(
  project: ProjectData,
  projectFilePath?: string,
): Promise<ProjectData> {
  if (!projectFilePath) return project;

  const baseDir = path.dirname(projectFilePath);

  const tracks = await Promise.all(
    project.tracks.map(async (track) => ({
      ...track,
      elements: await Promise.all(
        track.elements.map(async (element) => {
          if (
            (element.type === 'media' || element.type === 'audio' || element.type === 'scene3d') &&
            typeof element.src === 'string' &&
            path.isAbsolute(element.src)
          ) {
            const portable = await contractPath(element.src, baseDir);
            return { ...element, src: portable } as TimelineElement;
          }
          return element;
        }),
      ),
    })),
  );

  return { ...project, tracks };
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
