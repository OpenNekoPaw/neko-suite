import * as vscode from 'vscode';
import type { FountainDocument } from '@neko-story/types';

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
   * Fires when the index has been updated with the affected URIs.
   */
  readonly onDidUpdateIndex: vscode.Event<vscode.Uri[]>;
}
