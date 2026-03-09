/**
 * Pure helper functions for timeline tool operations.
 */

import * as path from 'path';
import type { ProjectData, TimelineElement, TimelineTrack } from '@neko/shared';

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
        const elementAny = element as unknown as { src?: unknown };
        if (typeof elementAny.src !== 'string') {
          return element;
        }
        return {
          ...element,
          src: toRelativeIfAbsolute(elementAny.src, baseDir),
        } as TimelineElement;
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
  track: TimelineTrack;
  element: TimelineElement;
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
        track,
        element,
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

export function getLegacyKeyframes(element: TimelineElement): Record<string, LegacyKeyframe[]> {
  const elementAny = element as unknown as { keyframes?: unknown };
  const keyframes = elementAny.keyframes;
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
