import * as vscode from 'vscode';
import type { Character } from '@neko-story/types';
import type { IWorkspaceIndex } from '../services/types';

const ENGLISH_CHARACTER_RE = /[A-Z][A-Z0-9 ._\-']+/;
const CJK_CHARACTER_RE = /[一-鿿㐀-䶿·]+/;

export interface CharacterWordMatch {
  readonly range: vscode.Range;
  readonly name: string;
}

/**
 * CJK-aware character word range detection.
 *
 * 1. Try English ALL-CAPS regex (existing behavior).
 * 2. If that misses, try CJK regex — but only trust it when the parsed AST
 *    confirms the line is a character element (prevents matching CJK action text).
 */
export function getCharacterWordRange(
  document: vscode.TextDocument,
  position: vscode.Position,
  index: IWorkspaceIndex,
): CharacterWordMatch | null {
  const englishRange = document.getWordRangeAtPosition(position, ENGLISH_CHARACTER_RE);
  if (englishRange) {
    return { range: englishRange, name: document.getText(englishRange).trim() };
  }

  const cjkRange = document.getWordRangeAtPosition(position, CJK_CHARACTER_RE);
  if (!cjkRange) return null;

  const fountainDoc = index.getDocument(document.uri);
  if (!fountainDoc) return null;

  const charElement = fountainDoc.elements.find(
    (el): el is Character => el.type === 'character' && el.range.start.line === position.line,
  );
  if (!charElement) return null;

  return {
    range: new vscode.Range(
      charElement.range.start.line,
      charElement.range.start.character,
      charElement.range.end.line,
      charElement.name.length,
    ),
    name: charElement.name,
  };
}
