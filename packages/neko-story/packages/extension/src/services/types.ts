import * as vscode from 'vscode';
import type {
  AssetEntity,
  CharacterRecord,
  CharacterRegistryFile,
  CreativeGraphNodeKind,
  CreativeRelationEdge,
  CreativeGraphNode,
} from '@neko/shared';
import type { AssetReference, FountainDocument } from '@neko-story/types';

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
  readonly directives: readonly import('@neko-story/types').Directive[];
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

export type CharacterMatchSource = 'canonicalName' | 'displayName' | 'alias' | 'scriptName';

export interface ResolvedCharacterMatch {
  readonly record: CharacterRecord;
  readonly matchedName: string;
  readonly matchSource: CharacterMatchSource;
}

export interface CharacterRegistrySymbol {
  readonly record: CharacterRecord;
  readonly label: string;
  readonly detail?: string;
  readonly location: vscode.Location;
}

export type AssetLinkMatchSource = 'registryId' | 'name' | 'alias' | 'tag';

export interface AssetLinkMatch {
  readonly entity: AssetEntity;
  readonly reference: AssetReference;
  readonly matchedBy: AssetLinkMatchSource;
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
   * Returns structured ScriptIndex for every indexed Fountain file in the workspace.
   */
  getAllScriptIndices?(): readonly ScriptIndex[];

  /**
   * Fires when the index has been updated with the affected URIs.
   */
  readonly onDidUpdateIndex: vscode.Event<vscode.Uri[]>;
}

/**
 * Workspace-aware character registry index backed by project-level characters.json.
 *
 * Keeps registry identity separate from the Fountain occurrence index so both can
 * evolve independently and be composed by LSP providers.
 */
export interface ICharacterWorkspaceIndex extends vscode.Disposable {
  /**
   * Ensures characters.json state has been loaded for all current workspace folders.
   */
  ensureInitialized(): Promise<void>;

  /**
   * Returns the current workspace folder's registry snapshot.
   */
  getRegistry(currentUri?: vscode.Uri): CharacterRegistryFile | undefined;

  /**
   * Resolves a character name / alias / script binding to a registry record.
   */
  resolveCharacter(name: string, currentUri?: vscode.Uri): ResolvedCharacterMatch | undefined;

  /**
   * Returns the registry definition location for a character, if present.
   */
  getDefinition(name: string, currentUri?: vscode.Uri): vscode.Location | undefined;

  /**
   * Returns all script-facing names that should be treated as references to the same character.
   */
  getReferenceNames(name: string, currentUri?: vscode.Uri): readonly string[];

  /**
   * Returns all registry-driven completion labels for the current workspace folder.
   */
  getAllCompletionNames(currentUri?: vscode.Uri): readonly string[];

  /**
   * Searches registry-backed character symbols for workspace-wide symbol UI.
   */
  searchCharacters(query: string, currentUri?: vscode.Uri): readonly CharacterRegistrySymbol[];
}

export type CreativeEntityKind = 'character' | 'scene' | 'object' | 'location' | 'action';
export type CreativeEntityOccurrenceSource =
  | 'registry'
  | 'script'
  | 'canvas'
  | 'canvas-comment'
  | 'canvas-container'
  | 'canvas-text'
  | 'asset'
  | 'generated-asset';
export type CreativeEntityOccurrenceRole = 'definition' | 'reference';

export interface CreativeEntityOccurrence {
  readonly entityKind: CreativeEntityKind;
  readonly entityId?: string;
  readonly source: CreativeEntityOccurrenceSource;
  readonly role: CreativeEntityOccurrenceRole;
  readonly label: string;
  readonly location: vscode.Location;
  readonly detail?: string;
}

export interface CharacterEntityStats {
  readonly totalScriptReferences: number;
  readonly fileCount: number;
  readonly canvasNodeCount?: number;
  readonly assetCount?: number;
  readonly generatedAssetCount?: number;
}

export interface CandidateEntityAssetRequirementView {
  readonly entityKind: 'character';
  readonly source: 'story';
  readonly sourceRef: string;
  readonly requiredKinds: readonly ('portrait' | 'reference')[];
  readonly suggestedActions: readonly ('generate' | 'import' | 'bind-existing' | 'dismiss')[];
}

export interface CharacterEntityQuery {
  readonly kind: 'character';
  readonly query: string;
  readonly candidate?: boolean;
  readonly resolved?: ResolvedCharacterMatch;
  readonly referenceNames: readonly string[];
  readonly registryDefinition?: vscode.Location;
  readonly scriptDefinition?: vscode.Location;
  readonly scriptReferences: readonly vscode.Location[];
  readonly occurrences: readonly CreativeEntityOccurrence[];
  readonly missingRequirements?: readonly CandidateEntityAssetRequirementView[];
  readonly stats: CharacterEntityStats;
}

// -- Scene entity types (Phase 4: script-backed, no separate registry) --

export interface ResolvedSceneMatch {
  readonly entry: SceneEntry;
  readonly scriptUri: vscode.Uri;
  readonly matchedBy: 'sceneId' | 'location' | 'heading';
}

export interface SceneCanvasBinding {
  readonly canvasSceneNodeId: string;
  readonly shotIds: readonly string[];
}

export interface SceneEntityStats {
  readonly totalScriptOccurrences: number;
  readonly fileCount: number;
  readonly canvasNodeCount?: number;
  readonly shotCount?: number;
  readonly characterCount: number;
  readonly estimatedDuration: number;
}

export interface SceneEntityQuery {
  readonly kind: 'scene';
  readonly query: string;
  readonly sceneId: string;
  readonly heading: string;
  readonly location: string;
  readonly intExt: string | null;
  readonly timeOfDay: string | null;
  readonly sceneCharacters: readonly string[];
  readonly scriptDefinition: vscode.Location;
  readonly scriptReferences: readonly vscode.Location[];
  readonly occurrences: readonly CreativeEntityOccurrence[];
  readonly canvasSceneNodeId?: string;
  readonly stats: SceneEntityStats;
}

/**
 * Workspace-aware scene index backed by script files.
 *
 * Unlike ICharacterWorkspaceIndex (backed by characters.json), this service
 * derives scene identity from the script source via IWorkspaceIndex.
 */
export interface ISceneWorkspaceIndex extends vscode.Disposable {
  ensureInitialized(): Promise<void>;

  /** Resolve a scene by sceneId, location name, or heading text. */
  resolveScene(query: string, currentUri?: vscode.Uri): ResolvedSceneMatch | undefined;

  /** Get the script-file location where this scene is defined. */
  getDefinition(sceneId: string, currentUri?: vscode.Uri): vscode.Location | undefined;

  /** Get all script-file locations sharing the same location name. */
  getLocationReferences(location: string, currentUri?: vscode.Uri): readonly vscode.Location[];

  /** Get the canvas binding for a scene, if any. */
  getCanvasBinding(sceneId: string, documentUri?: vscode.Uri): SceneCanvasBinding | undefined;

  /** List all indexed scene IDs for the workspace. */
  getAllSceneIds(currentUri?: vscode.Uri): readonly string[];

  /** Get all scene entries sharing a given location name. */
  getScenesByLocation(location: string): readonly SceneEntry[];
}

// -- Location entity types (Phase 4: derived from scene locations + environment assets) --

export interface LocationEntityQuery {
  readonly kind: 'location';
  readonly query: string;
  readonly location: string;
  readonly scenes: readonly SceneEntry[];
  readonly scriptReferences: readonly vscode.Location[];
  readonly linkedAsset?: AssetLinkMatch;
  readonly stats: {
    readonly sceneCount: number;
    readonly fileCount: number;
  };
}

// -- Object entity types (Phase 4: backed by AssetLibrary object category) --

export interface ObjectEntityQuery {
  readonly kind: 'object';
  readonly query: string;
  readonly entity: AssetEntity;
  readonly linkedAsset: AssetLinkMatch;
}

/**
 * Unified creative-entity query facade.
 *
 * Composes registry, script index, occurrence index, relationship graph,
 * and scene index into a single query surface for LSP providers.
 */
export interface ICreativeEntityWorkspaceIndex extends vscode.Disposable {
  ensureInitialized(): Promise<void>;

  /** Resolves a character query into registry identity, definitions, and cross-modal occurrences. */
  queryCharacter(name: string, currentUri?: vscode.Uri): CharacterEntityQuery | undefined;

  /** Resolves a scene query into script definition, cross-file references, and cross-modal occurrences. */
  queryScene(query: string, currentUri?: vscode.Uri): SceneEntityQuery | undefined;

  /** Aggregates all scenes sharing a location name and links to environment assets. */
  queryLocation(query: string, currentUri?: vscode.Uri): Promise<LocationEntityQuery | undefined>;

  /** Finds an object asset entity by name/alias/tag matching. */
  queryObject(query: string): Promise<ObjectEntityQuery | undefined>;
}

/**
 * Cross-modal occurrence index tracking entity appearances across
 * script, canvas, assets, and generated media.
 *
 * Answers "where does this entity appear?" across all modalities.
 * See ADR §4.6 for the full OccurrenceIndex model.
 */
export interface IOccurrenceIndex extends vscode.Disposable {
  ensureInitialized(): Promise<void>;

  /**
   * Returns all cross-modal occurrences for a given entity.
   * Script occurrences are handled by IWorkspaceIndex; this covers
   * canvas nodes, asset entities, and generated assets.
   */
  queryOccurrences(
    entityKind: CreativeEntityKind,
    entityId: string,
    options?: { readonly sources?: readonly CreativeEntityOccurrenceSource[] },
  ): readonly CreativeEntityOccurrence[];

  /**
   * Returns occurrence counts grouped by source for a given entity.
   */
  countBySource(entityKind: CreativeEntityKind, entityId: string): Readonly<Record<string, number>>;

  readonly onDidUpdate: vscode.Event<void>;
}

/**
 * Cross-modal relationship graph tracking connections between creative
 * entities and their representations across modalities.
 *
 * Answers "how are these entities connected?" with strength and provenance.
 * See ADR §4.5 for the full CreativeEntityGraph model.
 */
export interface ICreativeEntityGraph extends vscode.Disposable {
  ensureInitialized(): Promise<void>;

  /** Get all relationship edges involving a given entity ID */
  getEdgesForEntity(entityId: string): readonly CreativeRelationEdge[];

  /** Get all graph nodes of a given kind */
  getNodesByKind(kind: CreativeGraphNodeKind): readonly CreativeGraphNode[];

  readonly onDidUpdate: vscode.Event<void>;
}

export interface IAssetLinker {
  /**
   * Finds the best linked character asset using registryId first, then exact name/alias fallback.
   */
  linkCharacter(
    name: string,
    options?: {
      characterId?: string;
      aliases?: readonly string[];
    },
  ): Promise<AssetLinkMatch | null>;

  /**
   * Finds the best linked environment asset for a story location label.
   */
  linkLocation(location: string): Promise<AssetLinkMatch | null>;

  /**
   * Finds the best linked object asset for a name/alias/tag match.
   */
  linkObject(name: string): Promise<AssetLinkMatch | null>;
}
