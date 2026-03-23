// =============================================================================
// TimelineConverter — Fountain document → neko-cut ProjectData
//
// Converts a parsed Fountain script into a two-track ProjectData structure:
//   Track 0 (text):     one TextElement per scene heading (scene markers)
//   Track 1 (subtitle): one SubtitleElement per dialogue line
//
// Duration estimation:
//   - Dialogue line:  1.5 s
//   - Action paragraph: 2.0 s
//   - Minimum scene:  3.0 s
// =============================================================================

import type {
  ProjectData,
  TimelineTrack,
  TextElement,
  SubtitleElement,
  MediaElement,
} from '@neko/shared';
import { generateId, ENGINE_DEFAULT_TRANSFORM, CENTERED_TRANSFORM } from '@neko/shared';
import type { FountainDocument, AnyFountainElement, AssetReference } from '@neko-story/types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ConversionResult {
  /** The generated ProjectData ready for neko-cut */
  project: ProjectData;
  /** Number of scenes found in the script */
  sceneCount: number;
  /** Total estimated duration in seconds */
  totalDurationSec: number;
  /** Deduplicated list of character names (upper-case) */
  characterNames: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DIALOGUE_LINE_SEC = 1.5;
const ACTION_PARA_SEC = 2.0;
const MIN_SCENE_SEC = 3.0;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Group flat element list into scenes.
 * Each scene starts at a scene_heading element.
 */
function groupByScene(elements: AnyFountainElement[]): AnyFountainElement[][] {
  const scenes: AnyFountainElement[][] = [];
  let current: AnyFountainElement[] | null = null;

  for (const el of elements) {
    if (el.type === 'scene_heading') {
      current = [el];
      scenes.push(current);
    } else if (current !== null) {
      current.push(el);
    }
    // Elements before the first scene_heading are ignored
  }

  return scenes;
}

/**
 * Estimate scene duration based on its element composition.
 * Minimum is MIN_SCENE_SEC.
 */
function estimateSceneDuration(sceneElements: AnyFountainElement[]): number {
  let sec = 0;

  for (const el of sceneElements) {
    if (el.type === 'dialogue') {
      sec += DIALOGUE_LINE_SEC;
    } else if (el.type === 'action') {
      sec += ACTION_PARA_SEC;
    }
  }

  return Math.max(sec, MIN_SCENE_SEC);
}

/**
 * Extract the title from a Fountain title page.
 * The title page entries are key-value pairs; the "title" key holds the name.
 */
function extractTitle(doc: FountainDocument): string | null {
  if (!doc.titlePage) return null;

  const entry = doc.titlePage.entries.find((e) => e.key.toLowerCase() === 'title');
  return entry?.value ?? null;
}

/**
 * Collect deduplicated character names from the document.
 */
function collectCharacterNames(elements: AnyFountainElement[]): string[] {
  const names = new Set<string>();

  for (const el of elements) {
    if (el.type === 'character') {
      names.add(el.name);
    }
  }

  return [...names];
}

// ---------------------------------------------------------------------------
// Default element factories
// ---------------------------------------------------------------------------

function makeTextElement(
  content: string,
  startTime: number,
  duration: number,
  name: string,
): TextElement {
  return {
    id: generateId(),
    type: 'text',
    name,
    content,
    duration,
    startTime,
    trimStart: 0,
    trimEnd: 0,
    transform: { ...CENTERED_TRANSFORM },
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    muted: false,
    hidden: false,
    locked: false,
    fontSize: 36,
    fontFamily: 'Arial',
    color: '#ffffff',
    backgroundColor: 'rgba(0,0,0,0.5)',
    textAlign: 'center',
    fontWeight: 'normal',
    fontStyle: 'normal',
  };
}

function makeSubtitleElement(
  text: string,
  startTime: number,
  duration: number,
  name: string,
): SubtitleElement {
  return {
    id: generateId(),
    type: 'subtitle',
    name,
    text,
    duration,
    startTime,
    trimStart: 0,
    trimEnd: 0,
    transform: { ...ENGINE_DEFAULT_TRANSFORM },
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    muted: false,
    hidden: false,
    locked: false,
    fontSize: 48,
    color: '#ffffff',
    fontFamily: 'Arial',
    backgroundColor: 'transparent',
    textAlign: 'center',
    strokeColor: 'transparent',
    strokeWidth: 0,
  };
}

function makeMediaElement(
  assetRef: AssetReference,
  startTime: number,
  duration: number,
  name: string,
): MediaElement {
  return {
    id: generateId(),
    type: 'media',
    name,
    src: assetRef.path,
    mediaType: assetRef.type === 'video' ? 'video' : 'image',
    duration,
    startTime,
    trimStart: 0,
    trimEnd: 0,
    transform: { ...ENGINE_DEFAULT_TRANSFORM },
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    muted: assetRef.type === 'video' ? false : true,
    hidden: false,
    locked: false,
  };
}

// ---------------------------------------------------------------------------
// TimelineConverter
// ---------------------------------------------------------------------------

/**
 * Converts a parsed Fountain document into a neko-cut ProjectData.
 *
 * Output structure:
 *   Track 0 — type:'text'     — one TextElement per scene heading
 *   Track 1 — type:'subtitle' — one SubtitleElement per dialogue line
 */
export class TimelineConverter {
  convert(doc: FountainDocument, fallbackName: string): ConversionResult {
    const projectName = extractTitle(doc) ?? fallbackName;
    const characterNames = collectCharacterNames(doc.elements);
    const scenes = groupByScene(doc.elements);

    // Build scene track (TextElements), subtitle track (SubtitleElements),
    // and media track (MediaElements from asset references)
    const sceneElements: TextElement[] = [];
    const subtitleElements: SubtitleElement[] = [];
    const mediaElements: MediaElement[] = [];

    let cursor = 0; // absolute timeline position (seconds)
    let subtitleCursor = 0; // subtitle cursor advances with dialogue

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      if (!scene || scene.length === 0) continue;

      const heading = scene[0];
      if (!heading || heading.type !== 'scene_heading') continue;

      const sceneDuration = estimateSceneDuration(scene);
      const sceneLabel = heading.type === 'scene_heading' ? heading.raw.trim() : `Scene ${i + 1}`;

      // Scene marker on text track
      sceneElements.push(makeTextElement(sceneLabel, cursor, sceneDuration, `Scene ${i + 1}`));

      // Subtitle elements and media elements — placed within scene boundaries
      subtitleCursor = cursor;

      for (const el of scene) {
        if (el.type === 'dialogue') {
          subtitleElements.push(
            makeSubtitleElement(
              el.text,
              subtitleCursor,
              DIALOGUE_LINE_SEC,
              `Dialogue ${subtitleElements.length + 1}`,
            ),
          );
          subtitleCursor += DIALOGUE_LINE_SEC;
        } else if (el.type === 'note' && el.assetRef) {
          // Asset reference from note — create media element
          const assetDuration = el.assetRef.type === 'video' ? MIN_SCENE_SEC : sceneDuration;
          mediaElements.push(
            makeMediaElement(
              el.assetRef,
              cursor,
              assetDuration,
              `Asset ${mediaElements.length + 1}`,
            ),
          );
        }
      }

      cursor += sceneDuration;
    }

    const totalDurationSec = cursor;

    const sceneTrack: TimelineTrack = {
      id: generateId(),
      name: 'Scenes',
      type: 'text',
      elements: sceneElements,
      muted: false,
      locked: false,
      hidden: false,
      isMain: false,
    };

    const subtitleTrack: TimelineTrack = {
      id: generateId(),
      name: 'Dialogue',
      type: 'subtitle',
      elements: subtitleElements,
      muted: false,
      locked: false,
      hidden: false,
      isMain: false,
    };

    const mediaTrack: TimelineTrack = {
      id: generateId(),
      name: 'Assets',
      type: 'media',
      elements: mediaElements,
      muted: false,
      locked: false,
      hidden: false,
      isMain: true,
    };

    const tracks: TimelineTrack[] = [sceneTrack, subtitleTrack];
    if (mediaElements.length > 0) {
      tracks.unshift(mediaTrack); // Media track as first track
    }

    const project: ProjectData = {
      version: '2.0',
      name: projectName,
      resolution: { width: 1920, height: 1080 },
      fps: 24,
      tracks,
    };

    return {
      project,
      sceneCount: scenes.length,
      totalDurationSec,
      characterNames,
    };
  }
}

// ---------------------------------------------------------------------------
// Utility: human-readable duration string
// ---------------------------------------------------------------------------

/**
 * Format a duration in seconds as a Chinese locale string.
 * e.g. 90 → "1分30秒"
 */
export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}
