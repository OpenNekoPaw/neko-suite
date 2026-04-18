/**
 * AssetLibrary Types — see docs/architecture/asset-knowledge-graph.md
 *
 * Layer: Horizontal subsystem (consumed by Plan/Matching/Consistency)
 *
 * Design philosophy: a read-first facade aggregating CharacterRegistry,
 * CreativeEntityGraph, AssetManifest, and BindingHistory.
 */

// =============================================================================
// Entity
// =============================================================================

export type EntityKind = 'character' | 'scene' | 'action' | 'prop' | 'style';

export interface Entity {
  readonly id: string;
  readonly kind: EntityKind;
  readonly canonicalName: string;
  readonly aliases: readonly string[];
  readonly attributes?: Readonly<Record<string, string | number | boolean>>;
}

// =============================================================================
// Asset
// =============================================================================

/**
 * Broad MIME-like categorisation — aligned with AssetManifest types in
 * @neko/shared but kept separate here so the workflow module doesn't pull
 * manifest internals into its public contract.
 */
export type AssetKind =
  | 'image'
  | 'video'
  | 'puppet-2d'
  | 'model-3d'
  | 'motion'
  | 'audio'
  | 'document'
  | 'sequence'
  | 'other';

export interface Asset {
  readonly id: string;
  /** Entity this asset represents (may be undefined when un-assigned) */
  readonly entityId?: string;
  readonly kind: AssetKind;
  readonly path: string;
  readonly name?: string;
  readonly variants?: Readonly<Record<string, string | number | boolean>>;
  /** Source of the asset (local / git-lfs / registry / ai-generated / remote) */
  readonly source?: string;
  /** Optional CLIP embedding (populated when runtime-ml is wired — Phase 4) */
  readonly embeddings?: {
    readonly clip?: Float32Array;
  };
}

// =============================================================================
// Relation
// =============================================================================

export type RelationKind =
  | 'wears'
  | 'contains'
  | 'interacts-with'
  | 'alias-of'
  | 'default-visual-for'
  | 'performs-action'
  | 'voices-character';

export interface Relation {
  readonly from: string;
  readonly to: string;
  readonly kind: RelationKind;
  readonly confidence?: number;
}

// =============================================================================
// Binding (shot → asset assignment, written by PlanBuilder / MatchingEngine)
// =============================================================================

export type BindingSlot = 'character' | 'scene' | 'action' | 'prop' | 'style';

export type BindingProvenance = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'user';

export interface Binding {
  readonly id: string;
  readonly shotId: string;
  readonly slot: BindingSlot;
  readonly entityId: string;
  readonly assetId: string;
  readonly provenance: BindingProvenance;
  readonly confidence: number;
  readonly userConfirmed: boolean;
  readonly timestamp: number;
  /** Optional scene group reference for continuity queries */
  readonly sceneGroupId?: string;
  /** Optional Plan id (set when produced by a Plan's lifecycle) */
  readonly planId?: string;
}

// =============================================================================
// Binding query helpers
// =============================================================================

export interface BindingQuery {
  entityId?: string;
  slot?: BindingSlot;
  sceneGroupId?: string;
  planId?: string;
  /** Return at most N most recent matches */
  limit?: number;
}

// =============================================================================
// AssetLibrary public interface (facade)
// =============================================================================

export interface AssetLibrary {
  // ---- Entity queries ----
  listEntities(kind?: EntityKind): Entity[];
  getEntity(id: string): Entity | undefined;
  /** Resolve an entity by name (canonical or alias, case-insensitive). */
  resolveEntityByName(name: string, kind?: EntityKind): Entity | undefined;

  // ---- Asset queries ----
  listAssets(filter?: { kind?: AssetKind; entityId?: string }): Asset[];
  getAsset(id: string): Asset | undefined;
  findAssetsForEntity(
    entityId: string,
    opts?: {
      kind?: AssetKind;
      limit?: number;
    },
  ): Asset[];

  // ---- Relation queries ----
  listRelations(filter?: { from?: string; to?: string; kind?: RelationKind }): Relation[];

  // ---- Binding queries ----
  findBindings(query: BindingQuery): Binding[];
  findSiblingShotBindings(shotId: string): Binding[];

  // ---- Write (only to BindingHistory) ----
  upsertBinding(
    binding: Omit<Binding, 'id' | 'timestamp'> & { id?: string; timestamp?: number },
  ): Promise<Binding>;

  // ---- Lifecycle ----
  refresh(): Promise<void>;
  dispose(): void;
}

// =============================================================================
// Dependencies (injected by createAssetLibrary)
// =============================================================================

import type { CharacterRegistryFile } from '@neko/shared';
import type { CreativeEntityGraphSnapshot } from '@neko/shared';

export interface AssetLibraryDeps {
  /** Working directory (for resolving .neko/.cache/bindings.json etc) */
  workDir: string;
  /** Loader for the character registry (`.neko/characters.json`) */
  loadCharacterRegistry: () => Promise<CharacterRegistryFile | undefined>;
  /** Loader for the entity graph snapshot (`.neko/.cache/asset-graph.json`) */
  loadEntityGraph: () => Promise<CreativeEntityGraphSnapshot | undefined>;
  /**
   * Loader for asset manifests. Returns an iterable of raw manifest entries.
   * The facade converts them to the workflow-module's Asset shape.
   */
  loadAssetManifests: () => Promise<readonly RawAssetManifestEntry[]>;
  /** File IO for BindingHistory (injected for testability) */
  fileIO?: FileIOAdapter;
}

export interface RawAssetManifestEntry {
  readonly id: string;
  readonly type: string;
  readonly path: string;
  readonly name?: string;
  readonly source?: string;
  readonly entityId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Minimal fs contract for BindingHistory, injectable for tests.
 * Default implementation uses Node's fs/promises.
 */
export interface FileIOAdapter {
  read(path: string): Promise<string | undefined>;
  write(path: string, content: string): Promise<void>;
  mkdirp(dir: string): Promise<void>;
  /**
   * List file names in a directory (non-recursive).  Returns undefined when
   * the directory does not exist, an empty array when it exists but is
   * empty.  Optional because early consumers (BindingHistory) never needed
   * directory enumeration — PlanStore.listPlans uses it.
   */
  readdir?(dir: string): Promise<string[] | undefined>;
}
