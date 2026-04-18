/**
 * AssetLibrary — the horizontal knowledge-graph facade.
 *
 * Phase 1 semantics (read-first):
 *   - CharacterRegistry is authoritative for character entities (read-only).
 *   - CreativeEntityGraph supplies scene/action/prop/style entities + relations.
 *   - AssetManifest supplies physical asset paths and metadata.
 *   - BindingHistory is the only writer (append-only with LRU trim).
 *
 * See docs/architecture/asset-knowledge-graph.md.
 */

import type {
  Asset,
  AssetKind,
  AssetLibrary,
  AssetLibraryDeps,
  Binding,
  BindingQuery,
  Entity,
  EntityKind,
  FileIOAdapter,
  Relation,
  RelationKind,
} from './types';

import { BindingHistory, createMemoryFileIO, createNodeFileIO } from './binding-history';
import {
  indexCharacterRegistry,
  lookupEntityByName,
  type CharacterIndex,
} from './character-adapter';
import { indexEntityGraph, type EntityGraphIndex } from './entity-graph-adapter';
import { indexManifest } from './manifest-adapter';

// =============================================================================
// Factory
// =============================================================================

export interface CreateAssetLibraryOptions {
  /** Override the bindings.json path; default is `<workDir>/.neko/.cache/bindings.json`. */
  bindingHistoryPath?: string;
}

export async function createAssetLibrary(
  deps: AssetLibraryDeps,
  options: CreateAssetLibraryOptions = {},
): Promise<AssetLibrary> {
  const fileIO = deps.fileIO ?? (await createNodeFileIO());
  const filePath =
    options.bindingHistoryPath ?? joinPath(deps.workDir, '.neko', '.cache', 'bindings.json');

  const history = new BindingHistory({ filePath, fileIO });
  await history.load();

  const state: LibraryState = await loadState(deps);

  return new AssetLibraryImpl(deps, state, history);
}

// =============================================================================
// Internal state
// =============================================================================

interface LibraryState {
  characterIndex: CharacterIndex;
  graphIndex: EntityGraphIndex;
  manifestAssets: ReadonlyMap<string, Asset>;
  /** Unified asset map (manifest + graph assets, manifest wins on id collision) */
  mergedAssets: ReadonlyMap<string, Asset>;
  /** Reverse index: entityId → asset ids */
  assetsByEntity: ReadonlyMap<string, ReadonlyArray<string>>;
}

async function loadState(deps: AssetLibraryDeps): Promise<LibraryState> {
  const [registry, graphSnapshot, manifestEntries] = await Promise.all([
    deps.loadCharacterRegistry(),
    deps.loadEntityGraph(),
    deps.loadAssetManifests(),
  ]);

  const characterIndex = indexCharacterRegistry(registry);
  const graphIndex = indexEntityGraph(graphSnapshot);
  const manifestAssets = indexManifest(manifestEntries);

  // Merge: manifest entries win on collision
  const merged = new Map<string, Asset>();
  for (const asset of graphIndex.graphAssets) merged.set(asset.id, asset);
  for (const [id, asset] of manifestAssets) merged.set(id, asset);

  // Build entity → asset reverse index
  const byEntity = new Map<string, string[]>();
  for (const asset of merged.values()) {
    if (!asset.entityId) continue;
    const list = byEntity.get(asset.entityId) ?? [];
    list.push(asset.id);
    byEntity.set(asset.entityId, list);
  }

  return {
    characterIndex,
    graphIndex,
    manifestAssets,
    mergedAssets: merged,
    assetsByEntity: byEntity,
  };
}

// =============================================================================
// Facade implementation
// =============================================================================

class AssetLibraryImpl implements AssetLibrary {
  constructor(
    private readonly deps: AssetLibraryDeps,
    private state: LibraryState,
    private readonly history: BindingHistory,
  ) {}

  // --- Entities ----------------------------------------------------------

  listEntities(kind?: EntityKind): Entity[] {
    const result: Entity[] = [];
    for (const entity of this.state.characterIndex.byId.values()) {
      if (kind === undefined || entity.kind === kind) result.push(entity);
    }
    for (const entity of this.state.graphIndex.extraEntities) {
      if (kind === undefined || entity.kind === kind) result.push(entity);
    }
    return result;
  }

  getEntity(id: string): Entity | undefined {
    return (
      this.state.characterIndex.byId.get(id) ??
      this.state.graphIndex.extraEntities.find((e) => e.id === id)
    );
  }

  resolveEntityByName(name: string, kind?: EntityKind): Entity | undefined {
    // Primary: character lookup (most queries are character-dominated)
    if (kind === undefined || kind === 'character') {
      const viaChar = lookupEntityByName(this.state.characterIndex, name);
      if (viaChar) return viaChar;
    }

    // Fallback: scan non-character entities by canonical/alias fuzzy equality
    const normalized = name.trim().toLowerCase();
    if (!normalized) return undefined;

    for (const entity of this.state.graphIndex.extraEntities) {
      if (kind !== undefined && entity.kind !== kind) continue;
      if (
        entity.canonicalName.toLowerCase() === normalized ||
        entity.aliases.some((a) => a.toLowerCase() === normalized)
      ) {
        return entity;
      }
    }
    return undefined;
  }

  // --- Assets ------------------------------------------------------------

  listAssets(filter?: { kind?: AssetKind; entityId?: string }): Asset[] {
    const result: Asset[] = [];
    for (const asset of this.state.mergedAssets.values()) {
      if (filter?.kind !== undefined && asset.kind !== filter.kind) continue;
      if (filter?.entityId !== undefined && asset.entityId !== filter.entityId) continue;
      result.push(asset);
    }
    return result;
  }

  getAsset(id: string): Asset | undefined {
    return this.state.mergedAssets.get(id);
  }

  findAssetsForEntity(entityId: string, opts: { kind?: AssetKind; limit?: number } = {}): Asset[] {
    const ids = this.state.assetsByEntity.get(entityId) ?? [];
    const assets: Asset[] = [];
    for (const id of ids) {
      const asset = this.state.mergedAssets.get(id);
      if (!asset) continue;
      if (opts.kind !== undefined && asset.kind !== opts.kind) continue;
      assets.push(asset);
      if (opts.limit !== undefined && assets.length >= opts.limit) break;
    }
    return assets;
  }

  // --- Relations ---------------------------------------------------------

  listRelations(filter?: { from?: string; to?: string; kind?: RelationKind }): Relation[] {
    return this.state.graphIndex.relations.filter((r) => {
      if (filter?.from !== undefined && r.from !== filter.from) return false;
      if (filter?.to !== undefined && r.to !== filter.to) return false;
      if (filter?.kind !== undefined && r.kind !== filter.kind) return false;
      return true;
    });
  }

  // --- Bindings ----------------------------------------------------------

  findBindings(query: BindingQuery): Binding[] {
    return this.history.find(query);
  }

  findSiblingShotBindings(shotId: string): Binding[] {
    return this.history.findSiblings(shotId);
  }

  async upsertBinding(input: Parameters<AssetLibrary['upsertBinding']>[0]): Promise<Binding> {
    return this.history.upsert(input);
  }

  // --- Lifecycle ---------------------------------------------------------

  async refresh(): Promise<void> {
    this.state = await loadState(this.deps);
  }

  dispose(): void {
    this.history.dispose();
  }
}

// =============================================================================
// Helpers
// =============================================================================

function joinPath(...parts: string[]): string {
  return parts
    .filter((p) => p.length > 0)
    .map((p) => p.replace(/[/\\]+$/, ''))
    .join('/');
}

// =============================================================================
// Re-exports
// =============================================================================

export type {
  Asset,
  AssetKind,
  AssetLibrary,
  AssetLibraryDeps,
  Binding,
  BindingQuery,
  BindingProvenance,
  BindingSlot,
  Entity,
  EntityKind,
  FileIOAdapter,
  RawAssetManifestEntry,
  Relation,
  RelationKind,
} from './types';

export { BindingHistory, createMemoryFileIO, createNodeFileIO } from './binding-history';
