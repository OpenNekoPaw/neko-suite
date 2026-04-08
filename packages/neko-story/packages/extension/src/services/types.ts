import * as vscode from 'vscode';
import type { FountainDocument } from '@neko-story/types';

// -- ScriptIndex types (agent-accessible structured representation) --

/**
 * A scene entry in the ScriptIndex.
 * `line_start` / `line_end` are 0-based line numbers matching the file buffer,
 * enabling `Read(offset=line_start, limit=line_end-line_start+1)` in agent tools.
 */
export interface SceneEntry {
  readonly id: string; // Stable semantic scene ID
  readonly heading: string; // Full heading text, e.g. "INT. COFFEE SHOP - DAY"
  readonly sceneId: string;
  readonly sceneTitle: string;
  readonly intExt: string | null;
  readonly timeOfDay: string | null;
  readonly location: string;
  readonly time: string | null;
  readonly sceneNumber: string | null;
  readonly sceneCharacters: readonly string[];
  readonly actionSummary: string;
  readonly estimatedDuration: number;
  readonly line_start: number;
  readonly line_end: number; // Inclusive; last line before next scene or EOF
}

/**
 * A character entry aggregated across the script.
 * `first_line` is the 0-based line of the first dialogue cue in the file.
 */
export interface CharacterEntry {
  readonly name: string;
  readonly first_line: number;
  readonly scene_ids: readonly string[]; // IDs of scenes where character appears
}

/**
 * Agent-accessible structured representation of a single Fountain file.
 * Returned by `IWorkspaceIndex.getScriptIndex(uri)`.
 *
 * Designed for agent `Read(offset, limit)` access patterns:
 * - Use `SceneEntry.line_start/line_end` to fetch exact scene content.
 * - Use `CharacterEntry.first_line` to jump to first dialogue appearance.
 */
export interface ScriptIndex {
  readonly uri: string;
  readonly total_lines: number;
  readonly scenes: readonly SceneEntry[];
  readonly characters: readonly CharacterEntry[];
}

/**
 * Represents a symbol location found in the workspace index.
 * Immutable value object — all fields are readonly.
 */
export interface SymbolLocation {
  readonly uri: vscode.Uri;
  readonly name: string;
  readonly kind: 'character' | 'scene' | 'section';
  readonly range: vscode.Range;
  readonly detail?: string;
}

/**
 * Workspace-wide index for Fountain documents.
 *
 * Provides cross-file symbol lookup, character/scene/section indexing,
 * and incremental update on file changes.
 *
 * Dependency direction: Providers → IWorkspaceIndex (interface)
 *                       WorkspaceIndexService → IWorkspaceIndex (implementation)
 */
export interface IWorkspaceIndex extends vscode.Disposable {
  /**
   * Ensures the index is fully built before querying.
   * Lazy-initialized on first call; subsequent calls are no-ops.
   */
  ensureInitialized(): Promise<void>;

  /**
   * Returns the cached parsed document for a given URI, or undefined if not indexed.
   * Prefers live editor buffer over disk content.
   */
  getDocument(uri: vscode.Uri): FountainDocument | undefined;

  /**
   * Finds all locations where a character name appears across the workspace.
   * Results are sorted with `currentUri` matches first.
   */
  findCharacterLocations(name: string, currentUri?: vscode.Uri): readonly SymbolLocation[];

  /**
   * Finds the first (definition) location of a character across the workspace.
   * Prefers the earliest occurrence in `currentUri`, then other files.
   */
  findCharacterDefinition(name: string, currentUri?: vscode.Uri): SymbolLocation | undefined;

  /**
   * Finds all locations of a scene heading by location name (e.g. "COFFEE SHOP").
   */
  findSceneLocations(location: string, currentUri?: vscode.Uri): readonly SymbolLocation[];

  /**
   * Finds all locations of a section by text (e.g. "Act One").
   */
  findSectionLocations(text: string, currentUri?: vscode.Uri): readonly SymbolLocation[];

  /**
   * Searches all indexed symbols by a fuzzy query string.
   * Used by WorkspaceSymbolProvider (Ctrl+T).
   */
  searchSymbols(query: string): readonly SymbolLocation[];

  /**
   * Returns all unique character names across the workspace.
   */
  getAllCharacterNames(): readonly string[];

  /**
   * Returns all unique scene location names across the workspace.
   */
  getAllSceneLocations(): readonly string[];

  /**
   * Returns a structured ScriptIndex for the given URI, suitable for agent tools.
   * Returns undefined if the file has not been indexed yet.
   */
  getScriptIndex(uri: vscode.Uri): ScriptIndex | undefined;

  /**
   * Fires when the index has been updated with the affected URIs.
   */
  readonly onDidUpdateIndex: vscode.Event<vscode.Uri[]>;
}
