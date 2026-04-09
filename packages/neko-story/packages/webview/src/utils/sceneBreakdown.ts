/**
 * sceneBreakdown — Derive structured SceneBreakdown rows from a FountainDocument.
 * Pure/stateless so it can be unit-tested independently of React.
 */

import type { FountainDocument, AnyFountainElement } from '../types';

// =============================================================================
// Types
// =============================================================================

export interface SceneBreakdown {
  /** 1-based scene index within the document */
  sceneIndex: number;
  /** Explicit [[N]] scene number or null */
  sceneNumber: string | null;
  /** Raw heading text, e.g. "INT. OFFICE - DAY" */
  heading: string;
  intExt: 'INT' | 'EXT' | 'INT/EXT' | 'I/E' | 'EST' | null;
  location: string;
  time: string | null;
  /** Source line (0-based) for navigation */
  line: number;
  /** Character names that speak in this scene */
  characters: string[];
  /** First two action lines as description preview */
  actionPreview: string;
  /** Estimated duration in seconds (1 min per page, 55 lines per page) */
  estimatedDurationSec: number;
}

// =============================================================================
// Builder
// =============================================================================

/**
 * buildSceneBreakdowns — Walk the element list and group by scene heading.
 */
export function buildSceneBreakdowns(doc: FountainDocument): SceneBreakdown[] {
  const result: SceneBreakdown[] = [];
  let current: SceneBreakdown | null = null;
  let actionLines: string[] = [];
  let lineCount = 0;
  let sceneIndex = 0;

  function flushScene() {
    if (!current) return;
    current.actionPreview = actionLines.slice(0, 2).join(' ').trim().slice(0, 160);
    current.estimatedDurationSec = Math.max(5, Math.round((lineCount / 55) * 60));
    result.push(current);
  }

  for (const el of doc.elements) {
    if (el.type === 'scene_heading') {
      flushScene();
      sceneIndex++;
      actionLines = [];
      lineCount = 0;
      const sh = el as Extract<AnyFountainElement, { type: 'scene_heading' }>;
      current = {
        sceneIndex,
        sceneNumber: sh.sceneNumber,
        heading: sh.raw.trim(),
        intExt: sh.intExt,
        location: sh.location,
        time: sh.time,
        line: sh.range.start.line,
        characters: [],
        actionPreview: '',
        estimatedDurationSec: 0,
      };
    } else if (current) {
      lineCount++;
      if (el.type === 'character') {
        const ch = el as Extract<AnyFountainElement, { type: 'character' }>;
        if (!current.characters.includes(ch.name)) {
          current.characters.push(ch.name);
        }
      } else if (el.type === 'action') {
        const ac = el as Extract<AnyFountainElement, { type: 'action' }>;
        if (ac.text.trim()) actionLines.push(ac.text.trim());
      }
    }
  }
  flushScene();
  return result;
}

/**
 * formatDurationShort — "1m 30s" or "45s"
 */
export function formatDurationShort(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m${s > 0 ? ` ${s}s` : ''}` : `${s}s`;
}
