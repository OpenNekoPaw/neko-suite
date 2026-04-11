// =============================================================================
// OccurrenceIndexService — Tracks entity appearances across canvas, assets,
// and generated media. Script occurrences are handled by IWorkspaceIndex;
// this service covers the remaining cross-modal sources.
//
// See ADR §4.6 for the OccurrenceIndex model.
// =============================================================================

import * as vscode from 'vscode';
import type { CanvasNode, GalleryCanvasNode, ShotCanvasNode } from '@neko/shared';
import type {
  CreativeEntityKind,
  CreativeEntityOccurrence,
  CreativeEntityOccurrenceSource,
  IOccurrenceIndex,
} from './types';
import type { CrossModalDataProvider, CrossModalDataSnapshot } from './CrossModalDataProvider';

interface OccurrenceEntry {
  readonly entityKind: CreativeEntityKind;
  readonly entityId: string;
  readonly source: CreativeEntityOccurrenceSource;
  readonly label: string;
  readonly location: vscode.Location;
  readonly detail?: string;
}

export class OccurrenceIndexService implements IOccurrenceIndex {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly onDidUpdateEmitter = new vscode.EventEmitter<void>();
  readonly onDidUpdate = this.onDidUpdateEmitter.event;

  /** entityId → OccurrenceEntry[] */
  private readonly index = new Map<string, OccurrenceEntry[]>();

  private initPromise: Promise<void> | undefined;

  constructor(private readonly dataProvider: CrossModalDataProvider) {}

  async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }
    return this.initPromise;
  }

  queryOccurrences(
    entityKind: CreativeEntityKind,
    entityId: string,
    options?: { readonly sources?: readonly CreativeEntityOccurrenceSource[] },
  ): readonly CreativeEntityOccurrence[] {
    const entries = this.index.get(entityId);
    if (!entries) {
      return [];
    }

    const allowedSources = options?.sources;
    const filtered = allowedSources
      ? entries.filter((e) => e.entityKind === entityKind && allowedSources.includes(e.source))
      : entries.filter((e) => e.entityKind === entityKind);

    return filtered.map(toCreativeEntityOccurrence);
  }

  countBySource(
    entityKind: CreativeEntityKind,
    entityId: string,
  ): Readonly<Record<string, number>> {
    const entries = this.index.get(entityId);
    if (!entries) {
      return {};
    }

    const counts: Record<string, number> = {};
    for (const entry of entries) {
      if (entry.entityKind === entityKind) {
        counts[entry.source] = (counts[entry.source] ?? 0) + 1;
      }
    }
    return counts;
  }

  dispose(): void {
    this.onDidUpdateEmitter.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async initialize(): Promise<void> {
    await this.dataProvider.ensureInitialized();
    this.rebuild(this.dataProvider.getSnapshot());
    this.disposables.push(
      this.dataProvider.onDidUpdate(() => {
        this.rebuild(this.dataProvider.getSnapshot());
      }),
    );
  }

  private rebuild(snapshot: CrossModalDataSnapshot): void {
    this.index.clear();

    for (const node of snapshot.canvasNodes) {
      this.indexCanvasNode(node);
    }

    for (const entity of snapshot.assetEntities) {
      const registryId = entity.metadata.character?.registryId;
      if (registryId) {
        this.addEntry({
          entityKind: 'character',
          entityId: registryId,
          source: 'asset',
          label: entity.name,
          location: buildVirtualLocation('neko-asset', `entity/${entity.id}`),
          detail: `Asset: ${entity.name} (${entity.category})`,
        });
      }
    }

    for (const asset of snapshot.generatedAssets) {
      if (asset.characterIds) {
        for (const characterId of asset.characterIds) {
          this.addEntry({
            entityKind: 'character',
            entityId: characterId,
            source: 'generated-asset',
            label: asset.prompt ?? asset.id,
            location: asset.path
              ? new vscode.Location(vscode.Uri.file(asset.path), new vscode.Position(0, 0))
              : buildVirtualLocation('neko-generated', `asset/${asset.id}`),
            detail: `Generated ${asset.type}: ${asset.model ?? 'unknown'}`,
          });
        }
      }
    }

    this.onDidUpdateEmitter.fire();
  }

  private indexCanvasNode(node: CanvasNode): void {
    if (node.type === 'gallery') {
      const gallery = node as GalleryCanvasNode;
      const characterId = gallery.data.characterId;
      if (characterId) {
        this.addEntry({
          entityKind: 'character',
          entityId: characterId,
          source: 'canvas',
          label: gallery.data.characterName ?? gallery.data.preset,
          location: buildVirtualLocation('neko-canvas', `node/${gallery.id}`),
          detail: `Gallery: ${gallery.data.characterName ?? gallery.data.preset}`,
        });
      }
    } else if (node.type === 'shot') {
      const shot = node as ShotCanvasNode;
      if (shot.data.characters) {
        for (const character of shot.data.characters) {
          if (character.characterId) {
            this.addEntry({
              entityKind: 'character',
              entityId: character.characterId,
              source: 'canvas',
              label: character.characterName,
              location: buildVirtualLocation('neko-canvas', `node/${shot.id}`),
              detail: `Shot #${shot.data.shotNumber}: ${character.characterName}${character.emotion ? ` (${character.emotion})` : ''}`,
            });
          }
        }
      }
    }
  }

  private addEntry(entry: OccurrenceEntry): void {
    let entries = this.index.get(entry.entityId);
    if (!entries) {
      entries = [];
      this.index.set(entry.entityId, entries);
    }
    entries.push(entry);
  }
}

// -- Helpers --

function buildVirtualLocation(scheme: string, path: string): vscode.Location {
  return new vscode.Location(vscode.Uri.parse(`${scheme}://${path}`), new vscode.Position(0, 0));
}

function toCreativeEntityOccurrence(entry: OccurrenceEntry): CreativeEntityOccurrence {
  return {
    entityKind: entry.entityKind,
    entityId: entry.entityId,
    source: entry.source,
    role: 'reference',
    label: entry.label,
    location: entry.location,
    detail: entry.detail,
  };
}
