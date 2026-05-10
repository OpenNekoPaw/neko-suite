// =============================================================================
// OccurrenceIndexService — Tracks entity appearances across canvas, assets,
// and generated media. Script occurrences are handled by IWorkspaceIndex;
// this service covers the remaining cross-modal sources.
//
// See ADR §4.6 for the OccurrenceIndex model.
// =============================================================================

import * as vscode from 'vscode';
import type {
  ArtboardCanvasNode,
  CanvasNode,
  CanvasBlock,
  ContainerSection,
  GalleryCanvasNode,
  GroupCanvasNode,
  SceneGroupCanvasNode,
  ShotCanvasNode,
  TableCanvasNode,
  TextCanvasNode,
} from '@neko/shared';
import type {
  CreativeEntityKind,
  CreativeEntityOccurrence,
  CreativeEntityOccurrenceSource,
  ICharacterWorkspaceIndex,
  IOccurrenceIndex,
} from './types';
import type { CrossModalDataProvider, CrossModalDataSnapshot } from './CrossModalDataProvider';

export interface TextEntityOccurrenceMatch {
  readonly entityKind: CreativeEntityKind;
  readonly entityId: string;
  readonly label: string;
  readonly matchedText: string;
}

export interface EntityTextOccurrenceResolver {
  ensureInitialized?(): Promise<void>;
  resolveText(text: string): readonly TextEntityOccurrenceMatch[];
}

export interface OccurrenceIndexServiceOptions {
  readonly textResolver?: EntityTextOccurrenceResolver;
}

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

  constructor(
    private readonly dataProvider: CrossModalDataProvider,
    private readonly options: OccurrenceIndexServiceOptions = {},
  ) {}

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
    await Promise.all([
      this.dataProvider.ensureInitialized(),
      this.options.textResolver?.ensureInitialized?.(),
    ]);
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
    } else if (node.type === 'scene') {
      const scene = node as SceneGroupCanvasNode;
      const sceneId = scene.data.sceneId;
      if (sceneId) {
        this.addEntry({
          entityKind: 'scene',
          entityId: sceneId,
          source: 'canvas',
          label: scene.data.sceneTitle,
          location: buildVirtualLocation('neko-canvas', `node/${scene.id}`),
          detail: `Scene: ${scene.data.sceneTitle}${scene.data.location ? ` @ ${scene.data.location}` : ''}`,
        });
      }
    }

    this.indexCanvasTextOccurrences(node);
  }

  private addEntry(entry: OccurrenceEntry): void {
    let entries = this.index.get(entry.entityId);
    if (!entries) {
      entries = [];
      this.index.set(entry.entityId, entries);
    }
    entries.push(entry);
  }

  private indexCanvasTextOccurrences(node: CanvasNode): void {
    const resolver = this.options.textResolver;
    if (!resolver) {
      return;
    }

    for (const text of collectCanvasNodeTextSurfaces(node)) {
      const matches = resolver.resolveText(text.content);
      for (const match of matches) {
        this.addEntry({
          entityKind: match.entityKind,
          entityId: match.entityId,
          source: text.source,
          label: match.label,
          location: buildVirtualLocation('neko-canvas', `node/${node.id}`),
          detail: `${text.label}: ${match.matchedText}`,
        });
      }
    }
  }
}

// -- Helpers --

export class CharacterRegistryTextOccurrenceResolver implements EntityTextOccurrenceResolver {
  constructor(private readonly characterIndex: ICharacterWorkspaceIndex) {}

  ensureInitialized(): Promise<void> {
    return this.characterIndex.ensureInitialized();
  }

  resolveText(text: string): readonly TextEntityOccurrenceMatch[] {
    const registry = this.characterIndex.getRegistry();
    if (!registry || text.trim().length === 0) {
      return [];
    }

    const matches: TextEntityOccurrenceMatch[] = [];
    const seen = new Set<string>();

    for (const record of registry.characters) {
      for (const name of collectCharacterMentionNames(record)) {
        if (!textContainsMention(text, name)) {
          continue;
        }

        const key = `${record.id}\n${name}`;
        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        matches.push({
          entityKind: 'character',
          entityId: record.id,
          label: record.displayName ?? record.canonicalName,
          matchedText: name,
        });
      }
    }

    return matches;
  }
}

interface CanvasTextSurface {
  readonly source: Extract<
    CreativeEntityOccurrenceSource,
    'canvas-comment' | 'canvas-container' | 'canvas-text'
  >;
  readonly label: string;
  readonly content: string;
}

function collectCanvasNodeTextSurfaces(node: CanvasNode): readonly CanvasTextSurface[] {
  const surfaces: CanvasTextSurface[] = [];

  if (node.type === 'annotation') {
    pushTextSurface(surfaces, 'canvas-comment', 'Annotation', node.data.content);
  } else if (node.type === 'text') {
    const textNode = node as TextCanvasNode;
    pushTextSurface(surfaces, 'canvas-text', 'Text', textNode.data.content);
  } else if (node.type === 'group') {
    const group = node as GroupCanvasNode;
    pushTextSurface(surfaces, 'canvas-container', 'Group', group.data.label);
  } else if (node.type === 'artboard') {
    const artboard = node as ArtboardCanvasNode;
    pushTextSurface(surfaces, 'canvas-container', 'Artboard', artboard.data.name);
    pushTextSurface(surfaces, 'canvas-container', 'Artboard', artboard.data.description);
  } else if (node.type === 'table') {
    const table = node as TableCanvasNode;
    pushTextSurface(surfaces, 'canvas-container', 'Table', table.data.label);
    for (const column of table.data.columns) {
      pushTextSurface(surfaces, 'canvas-container', 'Table column', column.label);
    }
  }

  collectContainerSectionText(node.content, surfaces);

  return surfaces;
}

function collectContainerSectionText(
  section: ContainerSection | undefined,
  surfaces: CanvasTextSurface[],
): void {
  if (!section) {
    return;
  }

  pushTextSurface(surfaces, 'canvas-container', 'Container section', section.title);
  for (const block of section.blocks ?? []) {
    collectCanvasBlockText(block, surfaces);
  }
  for (const child of section.sections ?? []) {
    collectContainerSectionText(child, surfaces);
  }
}

function collectCanvasBlockText(block: CanvasBlock, surfaces: CanvasTextSurface[]): void {
  pushTextSurface(surfaces, 'canvas-container', 'Container block', block.label);
  for (const child of block.children ?? []) {
    collectCanvasBlockText(child, surfaces);
  }
}

function pushTextSurface(
  surfaces: CanvasTextSurface[],
  source: CanvasTextSurface['source'],
  label: string,
  content: string | undefined,
): void {
  if (typeof content !== 'string' || content.trim().length === 0) {
    return;
  }

  surfaces.push({ source, label, content });
}

function collectCharacterMentionNames(record: {
  readonly canonicalName: string;
  readonly displayName?: string;
  readonly aliases: readonly string[];
  readonly bindings?: { readonly scriptNames?: readonly string[] };
}): readonly string[] {
  const names = [
    record.canonicalName,
    record.displayName,
    ...record.aliases,
    ...(record.bindings?.scriptNames ?? []),
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  const normalized = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const key = name.trim().toLocaleLowerCase();
    if (normalized.has(key)) {
      continue;
    }
    normalized.add(key);
    result.push(name);
  }

  return result;
}

function textContainsMention(text: string, mention: string): boolean {
  const normalizedText = text.toLocaleLowerCase();
  const normalizedMention = mention.trim().toLocaleLowerCase();
  if (!normalizedMention) {
    return false;
  }

  const needsWordBoundary = /[a-z0-9_]/i.test(normalizedMention);
  let index = normalizedText.indexOf(normalizedMention);
  while (index >= 0) {
    if (!needsWordBoundary) {
      return true;
    }

    const before = index > 0 ? normalizedText[index - 1] : '';
    const after = normalizedText[index + normalizedMention.length] ?? '';
    if (!/[a-z0-9_]/i.test(before) && !/[a-z0-9_]/i.test(after)) {
      return true;
    }

    index = normalizedText.indexOf(normalizedMention, index + normalizedMention.length);
  }

  return false;
}

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
