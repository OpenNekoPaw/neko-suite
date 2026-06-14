import * as vscode from 'vscode';
import type {
  Action,
  Character,
  Dialogue,
  Directive,
  FountainDocument,
  Note,
  SceneHeading,
} from '@neko-story/types';
import type { CharacterEntry, SceneEntry, ScriptIndex } from './types';

interface MutableSceneDraft {
  sceneId: string;
  heading: string;
  sceneTitle: string;
  intExt: string | null;
  timeOfDay: string | null;
  location: string;
  time: string | null;
  sceneNumber: string | null;
  line_start: number;
  line_end: number;
  actionLines: string[];
  dialogueLines: number;
  characters: Set<string>;
  directives: Directive[];
  explicitDuration: number | undefined;
}

/**
 * Build a structured screenplay index from a parsed Fountain document.
 *
 * The returned scene IDs are derived from semantic content instead of raw line numbers
 * so scene-level status can survive simple insertions above the scene.
 */
export function buildScriptIndex(uri: vscode.Uri, doc: FountainDocument): ScriptIndex {
  const sceneDrafts: MutableSceneDraft[] = [];
  const characterMap = new Map<string, { firstLine: number; sceneIds: Set<string> }>();
  const sceneSignatureCounts = new Map<string, number>();
  let maxLine = 0;

  for (const element of doc.elements) {
    maxLine = Math.max(maxLine, element.range.end.line);

    if (element.type === 'scene_heading') {
      const heading = element as SceneHeading;
      const baseSignature = buildSceneSignature(heading);
      const duplicateIndex = (sceneSignatureCounts.get(baseSignature) ?? 0) + 1;
      sceneSignatureCounts.set(baseSignature, duplicateIndex);

      sceneDrafts.push({
        sceneId: createSceneId(baseSignature, duplicateIndex),
        heading: heading.raw.trim(),
        sceneTitle: heading.raw.trim(),
        intExt: heading.intExt,
        timeOfDay: heading.time,
        location: heading.location,
        time: heading.time,
        sceneNumber: heading.sceneNumber,
        line_start: element.range.start.line,
        line_end: element.range.end.line,
        actionLines: [],
        dialogueLines: 0,
        characters: new Set<string>(),
        directives: [],
        explicitDuration: undefined,
      });
      continue;
    }

    const currentScene = sceneDrafts[sceneDrafts.length - 1];
    if (!currentScene) {
      continue;
    }

    currentScene.line_end = Math.max(currentScene.line_end, element.range.end.line);

    if (element.type === 'character') {
      const character = element as Character;
      const normalizedName = character.name.trim();
      if (!normalizedName) {
        continue;
      }

      currentScene.characters.add(normalizedName);
      let entry = characterMap.get(normalizedName);
      if (!entry) {
        entry = { firstLine: element.range.start.line, sceneIds: new Set<string>() };
        characterMap.set(normalizedName, entry);
      } else if (element.range.start.line < entry.firstLine) {
        entry.firstLine = element.range.start.line;
      }
      entry.sceneIds.add(currentScene.sceneId);
      continue;
    }

    if (element.type === 'action') {
      const action = element as Action;
      const text = normalizeWhitespace(action.text);
      if (text) {
        currentScene.actionLines.push(text);
      }
      continue;
    }

    if (element.type === 'dialogue') {
      const dialogue = element as Dialogue;
      if (normalizeWhitespace(dialogue.text)) {
        currentScene.dialogueLines += 1;
      }
      continue;
    }

    if (element.type === 'note') {
      const note = element as Note;
      if (note.directive) {
        currentScene.directives.push(note.directive);
        if (note.directive.key === 'DURATION') {
          const parsed = parseDurationValue(note.directive.value);
          if (parsed !== undefined) {
            currentScene.explicitDuration = parsed;
          }
        }
      }
    }
  }

  const scenes: SceneEntry[] = sceneDrafts.map((draft) => {
    const actionSummary = draft.actionLines.slice(0, 2).join(' ').slice(0, 200).trim();
    const estimatedDuration =
      draft.explicitDuration ??
      estimateSceneDurationSeconds(
        draft.line_end - draft.line_start + 1,
        draft.dialogueLines,
        draft.actionLines.length,
      );
    return {
      id: draft.sceneId,
      heading: draft.heading,
      sceneId: draft.sceneId,
      sceneTitle: draft.sceneTitle,
      intExt: draft.intExt,
      timeOfDay: draft.timeOfDay,
      location: draft.location,
      time: draft.time,
      sceneNumber: draft.sceneNumber,
      sceneCharacters: Array.from(draft.characters),
      actionSummary,
      estimatedDuration,
      directives: draft.directives,
      line_start: draft.line_start,
      line_end: draft.line_end,
    };
  });

  const characters: CharacterEntry[] = Array.from(characterMap.entries())
    .sort(([, left], [, right]) => left.firstLine - right.firstLine)
    .map(([name, entry]) => ({
      name,
      first_line: entry.firstLine,
      scene_ids: Array.from(entry.sceneIds),
    }));

  return {
    uri: uri.toString(),
    total_lines: maxLine + 1,
    scenes,
    characters,
  };
}

function buildSceneSignature(scene: SceneHeading): string {
  return [
    normalizeWhitespace(scene.sceneNumber ?? ''),
    normalizeWhitespace(scene.raw),
    normalizeWhitespace(scene.location),
    normalizeWhitespace(scene.time ?? ''),
  ].join('|');
}

function createSceneId(baseSignature: string, duplicateIndex: number): string {
  const stableHash = hashString(`${baseSignature}|${duplicateIndex}`);
  return `scene_${stableHash}`;
}

function estimateSceneDurationSeconds(
  lineCount: number,
  dialogueLines: number,
  actionLines: number,
): number {
  const base = Math.max(5, Math.round((lineCount / 55) * 60));
  const dialogueBonus = dialogueLines * 2;
  const actionBonus = actionLines;
  return base + dialogueBonus + actionBonus;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36);
}

function parseDurationValue(raw: string): number | undefined {
  const match = /^(?:(\d+)m)?(?:(\d+)s?)?$/.exec(raw.trim());
  if (!match) return undefined;
  const minutes = parseInt(match[1] ?? '0', 10);
  const seconds = parseInt(match[2] ?? '0', 10);
  const total = minutes * 60 + seconds;
  return total > 0 ? total : undefined;
}
