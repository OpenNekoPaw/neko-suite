import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  detectMediaType,
  isDocumentFile,
  isMediaFile,
  resolveStorageLayout,
  type AssetMediaType,
  type GeneratedAsset,
  type NekoStoryAPI,
  type ProjectIndexFreshness,
  type ProjectIndexPartitionStatus,
  type ProjectSearchAdapter,
  type ProjectSearchAdapterRefreshOptions,
  type ProjectSearchItem,
  type ProjectSearchPartitionKind,
  type ProjectSearchPartitionStatusSnapshot,
  type ProjectSearchQuery,
  type ProjectSearchQueryContext,
} from '@neko/shared';
import { buildProjectSearchText, matchesProjectSearchItem } from '../core/normalization';
import type { ProjectSearchLogger } from '../core/ports';

const STORY_GLOB = '**/*.{fountain,nks,story}';

export interface JsonReader {
  read<T>(filePath: string): Promise<T | null>;
}

export interface WorkspaceFileFinder {
  findFiles(include: string, exclude?: string): Promise<readonly vscode.Uri[]>;
}

interface AssetLibraryData {
  readonly entities?: readonly AssetLibraryEntity[];
}

interface AssetLibraryEntity {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly category?: unknown;
  readonly description?: unknown;
  readonly tags?: unknown;
  readonly aliases?: unknown;
  readonly variants?: unknown;
}

interface AssetVariantRecord {
  readonly id?: string;
  readonly name?: string;
  readonly thumbnailPath?: string;
  readonly files: readonly AssetFileRecord[];
}

interface AssetFileRecord {
  readonly id?: string;
  readonly name?: string;
  readonly path?: string;
  readonly mediaType?: string;
  readonly purpose?: string;
  readonly characterAsset?: CharacterAssetRecord;
}

interface CharacterAssetRecord {
  readonly assetDimension?: string;
  readonly mediaKind?: string;
  readonly storageMode?: string;
  readonly bundleLocator?: {
    readonly bundlePath?: string;
    readonly entryPath?: string;
    readonly fragmentRef?: string;
  };
  readonly sourceOrigin?: string;
  readonly sourceHash?: string;
}

interface MediaSearchIndexData {
  readonly entries?: readonly MediaSearchIndexEntry[];
}

interface MediaSearchIndexEntry {
  readonly filePath?: unknown;
  readonly fileName?: unknown;
  readonly libraryName?: unknown;
  readonly mediaType?: unknown;
}

interface MediaMetadataCacheData {
  readonly entries?: Record<string, unknown>;
}

interface CreativeGraphData {
  readonly nodes?: readonly CreativeGraphNodeRecord[];
}

interface CreativeGraphNodeRecord {
  readonly id?: unknown;
  readonly kind?: unknown;
  readonly refId?: unknown;
  readonly label?: unknown;
}

interface CharacterRegistryData {
  readonly characters?: readonly CharacterRecord[];
}

interface CharacterRecord {
  readonly id?: unknown;
  readonly canonicalName?: unknown;
  readonly displayName?: unknown;
  readonly aliases?: unknown;
  readonly metadata?: unknown;
}

interface EntityAssetRequirementData {
  readonly requirements?: readonly EntityAssetRequirementRecord[];
}

interface EntityAssetRequirementRecord {
  readonly id?: unknown;
  readonly entityId?: unknown;
  readonly entityKind?: unknown;
  readonly source?: unknown;
  readonly sourceRef?: unknown;
  readonly requiredKinds?: unknown;
  readonly status?: unknown;
}

interface GeneratedAssetIndexData {
  readonly assets?: readonly GeneratedAssetRecord[];
}

type GeneratedAssetRecord = Partial<GeneratedAsset> & {
  readonly id?: unknown;
  readonly type?: unknown;
  readonly path?: unknown;
  readonly mimeType?: unknown;
  readonly prompt?: unknown;
  readonly model?: unknown;
  readonly generatedAt?: unknown;
};

export interface CompatibilityProjectSearchAdaptersOptions {
  readonly jsonReader?: JsonReader;
  readonly workspaceFileFinder?: WorkspaceFileFinder;
  readonly resolveThumbnailUri?: (filePath: string) => string | undefined;
  readonly logger?: ProjectSearchLogger;
}

export function createCompatibilityProjectSearchAdapters(
  options: CompatibilityProjectSearchAdaptersOptions = {},
): readonly ProjectSearchAdapter[] {
  const jsonReader = options.jsonReader ?? new VscodeJsonReader(options.logger);
  return [
    new StorySymbolProjectSearchAdapter(
      options.workspaceFileFinder ?? new VscodeWorkspaceFileFinder(),
    ),
    new AssetLibraryProjectSearchAdapter(jsonReader, options.resolveThumbnailUri),
    new MediaLibraryProjectSearchAdapter(jsonReader),
    new CreativeEntityProjectSearchAdapter(jsonReader),
    new GeneratedAssetProjectSearchAdapter(jsonReader, options.resolveThumbnailUri),
  ];
}

abstract class BaseProjectSearchAdapter implements ProjectSearchAdapter {
  private readonly statusByProject = new Map<string, ProjectSearchPartitionStatusSnapshot>();

  protected constructor(readonly partition: ProjectSearchPartitionKind) {}

  async ensureInitialized(projectRoot: string): Promise<void> {
    await this.refresh({ projectRoot, reason: 'project-open' });
  }

  abstract query(
    query: ProjectSearchQuery,
    context: ProjectSearchQueryContext,
  ): Promise<readonly ProjectSearchItem[]>;

  async refresh(options: ProjectSearchAdapterRefreshOptions): Promise<void> {
    this.setStatus(options.projectRoot, 'ready', 'fresh');
  }

  getStatus(projectRoot: string): ProjectSearchPartitionStatusSnapshot {
    return (
      this.statusByProject.get(projectRoot) ?? {
        partition: this.partition,
        status: 'idle',
        freshness: 'stale',
      }
    );
  }

  protected setStatus(
    projectRoot: string,
    status: ProjectIndexPartitionStatus,
    freshness: ProjectIndexFreshness,
    itemCount?: number,
    error?: string,
  ): void {
    this.statusByProject.set(projectRoot, {
      partition: this.partition,
      status,
      freshness,
      ...(itemCount !== undefined ? { itemCount } : {}),
      updatedAt: new Date().toISOString(),
      ...(error ? { error } : {}),
    });
  }
}

class StorySymbolProjectSearchAdapter extends BaseProjectSearchAdapter {
  private itemsByProject = new Map<string, readonly ProjectSearchItem[]>();

  constructor(private readonly workspaceFileFinder: WorkspaceFileFinder) {
    super('story-symbols');
  }

  override async refresh(options: ProjectSearchAdapterRefreshOptions): Promise<void> {
    const items = await this.buildItems(options.projectRoot);
    this.itemsByProject.set(options.projectRoot, items);
    this.setStatus(options.projectRoot, 'ready', 'fresh', items.length);
  }

  override async query(
    query: ProjectSearchQuery,
    context: ProjectSearchQueryContext,
  ): Promise<readonly ProjectSearchItem[]> {
    const projectRoot = context.projectRoot;
    if (!projectRoot) return [];
    if (!this.itemsByProject.has(projectRoot)) {
      await this.refresh({ projectRoot, reason: 'cache-load' });
    }
    return (this.itemsByProject.get(projectRoot) ?? []).filter((item) =>
      matchesProjectSearchItem(item, query),
    );
  }

  private async buildItems(projectRoot: string): Promise<readonly ProjectSearchItem[]> {
    const files = await this.workspaceFileFinder.findFiles(STORY_GLOB, '**/node_modules/**');
    const storyApi = getStoryApi();
    const items: ProjectSearchItem[] = [];

    for (const uri of files) {
      const filePath = uri.fsPath;
      if (!isPathInside(filePath, projectRoot)) continue;

      const scriptIndex = storyApi?.getScriptIndex?.(filePath);
      if (scriptIndex) {
        for (const character of scriptIndex.characters) {
          items.push(
            createStoryItem(projectRoot, filePath, 'script-role', character.name, {
              id: `script-role:${filePath}:${character.name}`,
              description: 'Script role',
              navigationData: {
                filePath,
                line: character.first_line,
                sceneIds: character.scene_ids.join(','),
              },
              searchText: buildProjectSearchText([
                character.name,
                filePath,
                character.scene_ids,
                'script role character',
              ]),
            }),
          );
        }

        for (const scene of scriptIndex.scenes) {
          items.push(
            createStoryItem(projectRoot, filePath, 'story-scene', scene.sceneTitle, {
              id: `story-scene:${filePath}:${scene.sceneId}`,
              description: scene.heading,
              navigationData: {
                filePath,
                sceneId: scene.sceneId,
                lineStart: scene.line_start,
                lineEnd: scene.line_end,
              },
              searchText: buildProjectSearchText([
                scene.sceneTitle,
                scene.heading,
                scene.location,
                scene.sceneCharacters,
                filePath,
                'story scene',
              ]),
            }),
          );
        }
        continue;
      }

      const parsed = storyApi?.parseScript(await readWorkspaceText(filePath));
      if (!parsed) continue;
      for (const element of parsed.elements) {
        if (element.type === 'character') {
          const name = optionalString(element['name']) ?? element.text;
          if (name) {
            items.push(
              createStoryItem(projectRoot, filePath, 'script-role', name, {
                id: `script-role:${filePath}:${name}`,
                description: 'Script role',
                navigationData: { filePath },
                searchText: buildProjectSearchText([name, filePath, 'script role character']),
              }),
            );
          }
        }
        if (element.type === 'scene_heading') {
          const label = optionalString(element['raw']) ?? element.text;
          if (label) {
            items.push(
              createStoryItem(projectRoot, filePath, 'story-scene', label, {
                id: `story-scene:${filePath}:${label}`,
                description: 'Story scene',
                navigationData: { filePath },
                searchText: buildProjectSearchText([label, filePath, 'story scene']),
              }),
            );
          }
        }
        if (element.type === 'section') {
          const label = optionalString(element['text']) ?? element.text;
          if (label) {
            items.push(
              createStoryItem(projectRoot, filePath, 'story-section', label, {
                id: `story-section:${filePath}:${label}`,
                description: 'Story section',
                navigationData: { filePath },
                searchText: buildProjectSearchText([label, filePath, 'story section']),
              }),
            );
          }
        }
      }
    }

    return dedupeById(items);
  }
}

class AssetLibraryProjectSearchAdapter extends BaseProjectSearchAdapter {
  constructor(
    private readonly jsonReader: JsonReader,
    private readonly resolveThumbnailUri: ((filePath: string) => string | undefined) | undefined,
  ) {
    super('asset-library');
  }

  override async query(
    query: ProjectSearchQuery,
    context: ProjectSearchQueryContext,
  ): Promise<readonly ProjectSearchItem[]> {
    const projectRoot = context.projectRoot;
    if (!projectRoot) return [];
    const layout = resolveStorageLayout(projectRoot, os.homedir());
    const data = await this.jsonReader.read<AssetLibraryData>(layout.project.facts.assetLibrary);
    const entities = Array.isArray(data?.entities) ? data.entities : [];
    const items: ProjectSearchItem[] = [];

    for (const entity of entities) {
      const id = optionalString(entity.id);
      const name = optionalString(entity.name);
      if (!id || !name) continue;

      const category = optionalString(entity.category);
      const description = optionalString(entity.description);
      const tags = readStringArray(entity.tags);
      const aliases = readStringArray(entity.aliases);
      const variants = readVariants(entity.variants);
      const defaultVariant = variants[0];
      const primaryFile = defaultVariant?.files[0];
      const characterAsset = primaryFile?.characterAsset;
      const mediaType =
        readAssetMediaType(primaryFile?.mediaType) ?? detectMediaTypeSafe(primaryFile?.path);
      const thumbnailUri = defaultVariant?.thumbnailPath
        ? this.resolveThumbnailUri?.(defaultVariant.thumbnailPath)
        : undefined;
      const item: ProjectSearchItem = {
        id: `asset:${id}`,
        kind: category === 'document' || mediaType === 'document' ? 'document' : 'asset',
        label: name,
        ...(description ? { description } : {}),
        icon: iconForAssetCategory(category, mediaType),
        source: {
          partition: 'asset-library',
          sourceId: id,
          sourceKind: category,
          filePath: layout.project.facts.assetLibrary,
        },
        projectRoot,
        ...(primaryFile?.path ? { filePath: primaryFile.path } : {}),
        canonicalName: name,
        aliases,
        searchText: buildProjectSearchText([
          name,
          category,
          description,
          tags,
          aliases,
          variants.map((variant) => variant.name ?? ''),
          variants.flatMap((variant) => variant.files.map((file) => file.name ?? file.path ?? '')),
          variants.flatMap((variant) =>
            variant.files.flatMap((file) =>
              compactStrings([
                file.characterAsset?.assetDimension,
                file.characterAsset?.mediaKind,
                file.characterAsset?.storageMode,
                file.characterAsset?.bundleLocator?.fragmentRef,
              ]),
            ),
          ),
        ]),
        navigationData: {
          assetId: id,
          ...(category ? { category } : {}),
          ...(primaryFile?.id ? { fileId: primaryFile.id } : {}),
          ...(defaultVariant?.id ? { variantId: defaultVariant.id } : {}),
          ...(characterAsset?.assetDimension
            ? { assetDimension: characterAsset.assetDimension }
            : {}),
          ...(characterAsset?.mediaKind ? { mediaKind: characterAsset.mediaKind } : {}),
          ...(characterAsset?.storageMode ? { storageMode: characterAsset.storageMode } : {}),
          ...(characterAsset?.bundleLocator ? { bundleLocator: characterAsset.bundleLocator } : {}),
        },
        ...(thumbnailUri ? { thumbnailUri } : {}),
        freshness: 'fresh',
        metadata: {
          ...(mediaType ? { mediaType } : {}),
          ...(category ? { category } : {}),
          ...(characterAsset?.assetDimension
            ? { assetDimension: characterAsset.assetDimension }
            : {}),
          ...(characterAsset?.mediaKind ? { mediaKind: characterAsset.mediaKind } : {}),
          ...(characterAsset?.storageMode ? { storageMode: characterAsset.storageMode } : {}),
          ...(characterAsset?.bundleLocator ? { bundleLocator: characterAsset.bundleLocator } : {}),
          ...(characterAsset?.sourceOrigin ? { sourceOrigin: characterAsset.sourceOrigin } : {}),
          ...(characterAsset?.sourceHash ? { sourceHash: characterAsset.sourceHash } : {}),
        },
      };
      if (matchesProjectSearchItem(item, query)) {
        items.push(item);
      }
    }

    this.setStatus(projectRoot, 'ready', 'fresh', items.length);
    return items;
  }
}

class MediaLibraryProjectSearchAdapter extends BaseProjectSearchAdapter {
  constructor(private readonly jsonReader: JsonReader) {
    super('media-library');
  }

  override async query(
    query: ProjectSearchQuery,
    context: ProjectSearchQueryContext,
  ): Promise<readonly ProjectSearchItem[]> {
    const projectRoot = context.projectRoot;
    if (!projectRoot) return [];
    const layout = resolveStorageLayout(projectRoot, os.homedir());
    const fromIndex = await this.readMediaSearchIndex(
      projectRoot,
      layout.project.local.cache.searchIndex,
      query,
    );
    if (fromIndex.length > 0) {
      this.setStatus(projectRoot, 'ready', 'fresh', fromIndex.length);
      return fromIndex;
    }
    const fromMetadata = await this.readMediaMetadata(
      projectRoot,
      layout.project.local.cache.mediaMetadata,
      query,
    );
    this.setStatus(
      projectRoot,
      'ready',
      fromMetadata.length > 0 ? 'stale' : 'fresh',
      fromMetadata.length,
    );
    return fromMetadata;
  }

  private async readMediaSearchIndex(
    projectRoot: string,
    searchIndexPath: string,
    query: ProjectSearchQuery,
  ): Promise<readonly ProjectSearchItem[]> {
    const data = await this.jsonReader.read<MediaSearchIndexData>(searchIndexPath);
    const entries = Array.isArray(data?.entries) ? data.entries : [];
    const items: ProjectSearchItem[] = [];

    for (const entry of entries) {
      const filePath = optionalString(entry.filePath);
      const fileName =
        optionalString(entry.fileName) ?? (filePath ? path.basename(filePath) : undefined);
      if (!filePath || !fileName) continue;
      const mediaType = readAssetMediaType(entry.mediaType) ?? detectMediaTypeSafe(filePath);
      const item = createMediaItem(projectRoot, filePath, fileName, 'fresh', {
        libraryName: optionalString(entry.libraryName),
        mediaType,
      });
      if (matchesProjectSearchItem(item, query)) {
        items.push(item);
      }
    }

    return items;
  }

  private async readMediaMetadata(
    projectRoot: string,
    metadataCachePath: string,
    query: ProjectSearchQuery,
  ): Promise<readonly ProjectSearchItem[]> {
    const data = await this.jsonReader.read<MediaMetadataCacheData>(metadataCachePath);
    const filePaths =
      data?.entries && typeof data.entries === 'object' ? Object.keys(data.entries) : [];
    const items: ProjectSearchItem[] = [];

    for (const filePath of filePaths) {
      const fileName = path.basename(filePath);
      const item = createMediaItem(projectRoot, filePath, fileName, 'stale', {
        mediaType: detectMediaTypeSafe(filePath),
      });
      if (matchesProjectSearchItem(item, query)) {
        items.push(item);
      }
    }

    return items;
  }
}

class CreativeEntityProjectSearchAdapter extends BaseProjectSearchAdapter {
  constructor(private readonly jsonReader: JsonReader) {
    super('creative-entities');
  }

  override async query(
    query: ProjectSearchQuery,
    context: ProjectSearchQueryContext,
  ): Promise<readonly ProjectSearchItem[]> {
    const projectRoot = context.projectRoot;
    if (!projectRoot) return [];
    const layout = resolveStorageLayout(projectRoot, os.homedir());
    const [graph, registry, requirements] = await Promise.all([
      this.jsonReader.read<CreativeGraphData>(layout.project.local.cache.assetGraph),
      this.jsonReader.read<CharacterRegistryData>(path.join(projectRoot, 'characters.json')),
      this.jsonReader.read<EntityAssetRequirementData>(
        layout.project.facts.entityAssetRequirements,
      ),
    ]);
    const items = [
      ...this.graphItems(projectRoot, graph),
      ...this.registryItems(projectRoot, registry),
      ...this.requirementItems(projectRoot, requirements),
    ].filter((item) => matchesProjectSearchItem(item, query));
    this.setStatus(projectRoot, 'ready', 'fresh', items.length);
    return dedupeById(items);
  }

  private graphItems(projectRoot: string, data: CreativeGraphData | null): ProjectSearchItem[] {
    const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
    return nodes.flatMap((node) => {
      const id = optionalString(node.id);
      const label = optionalString(node.label);
      const kind = optionalString(node.kind);
      const refId = optionalString(node.refId);
      if (!id || !label || !kind) return [];
      return [
        {
          id: `entity-graph:${id}`,
          kind: kind === 'generated-asset' ? 'generated-asset' : 'creative-entity',
          label,
          description: `Entity: ${kind}`,
          icon: iconForGraphKind(kind),
          source: {
            partition: kind === 'generated-asset' ? 'generated-assets' : 'creative-entities',
            sourceId: id,
            sourceKind: kind,
            refId,
          },
          projectRoot,
          canonicalName: label,
          searchText: buildProjectSearchText([label, kind, refId]),
          navigationData: {
            nodeId: id,
            kind,
            ...(refId ? { refId } : {}),
          },
          freshness: 'fresh',
          metadata: { entityType: kind },
        } satisfies ProjectSearchItem,
      ];
    });
  }

  private registryItems(
    projectRoot: string,
    data: CharacterRegistryData | null,
  ): ProjectSearchItem[] {
    const characters = Array.isArray(data?.characters) ? data.characters : [];
    return characters.flatMap((character) => {
      const id = optionalString(character.id);
      const canonicalName = optionalString(character.canonicalName);
      if (!id || !canonicalName) return [];
      const displayName = optionalString(character.displayName);
      const aliases = readStringArray(character.aliases);
      return [
        {
          id: `creative-entity:${id}`,
          kind: 'creative-entity',
          label: displayName ?? canonicalName,
          description: 'Character',
          icon: '◇',
          source: {
            partition: 'creative-entities',
            sourceId: id,
            sourceKind: 'character',
          },
          projectRoot,
          canonicalName,
          aliases,
          searchText: buildProjectSearchText([canonicalName, displayName, aliases, 'character']),
          navigationData: { entityId: id, kind: 'character' },
          freshness: 'fresh',
          metadata: { entityType: 'character' },
        } satisfies ProjectSearchItem,
      ];
    });
  }

  private requirementItems(
    projectRoot: string,
    data: EntityAssetRequirementData | null,
  ): ProjectSearchItem[] {
    const requirements = Array.isArray(data?.requirements) ? data.requirements : [];
    return requirements.flatMap((requirement) => {
      const id = optionalString(requirement.id);
      const entityId = optionalString(requirement.entityId);
      const entityKind = optionalString(requirement.entityKind);
      if (!id || !entityId || !entityKind) return [];
      const requiredKinds = readStringArray(requirement.requiredKinds);
      return [
        {
          id: `entity-requirement:${id}`,
          kind: 'entity-candidate',
          label: entityId,
          description: `Missing ${requiredKinds.join(', ') || 'representation'}`,
          icon: '◇',
          source: {
            partition: 'creative-entities',
            sourceId: id,
            sourceKind: 'entity-asset-requirement',
            refId: entityId,
          },
          projectRoot,
          canonicalName: entityId,
          searchText: buildProjectSearchText([
            entityId,
            entityKind,
            requiredKinds,
            'missing representation',
          ]),
          navigationData: {
            requirementId: id,
            entityId,
            entityKind,
          },
          freshness: 'fresh',
          metadata: {
            entityType: entityKind,
            requiredKinds,
            status: optionalString(requirement.status),
            sourceRef: optionalString(requirement.sourceRef),
          },
        } satisfies ProjectSearchItem,
      ];
    });
  }
}

class GeneratedAssetProjectSearchAdapter extends BaseProjectSearchAdapter {
  constructor(
    private readonly jsonReader: JsonReader,
    private readonly resolveThumbnailUri: ((filePath: string) => string | undefined) | undefined,
  ) {
    super('generated-assets');
  }

  override async query(
    query: ProjectSearchQuery,
    context: ProjectSearchQueryContext,
  ): Promise<readonly ProjectSearchItem[]> {
    const projectRoot = context.projectRoot;
    if (!projectRoot) return [];
    const indexPath = path.join(projectRoot, '.neko', '.cache', 'generated', 'index.json');
    const data = await this.jsonReader.read<GeneratedAssetIndexData>(indexPath);
    const assets = Array.isArray(data?.assets) ? data.assets : [];
    const items = assets
      .flatMap((asset) => this.toItem(projectRoot, indexPath, asset))
      .filter((item) => matchesProjectSearchItem(item, query));
    this.setStatus(projectRoot, 'ready', 'fresh', items.length);
    return items;
  }

  private toItem(
    projectRoot: string,
    indexPath: string,
    asset: GeneratedAssetRecord,
  ): readonly ProjectSearchItem[] {
    const id = optionalString(asset.id);
    const type = optionalString(asset.type);
    const filePath = optionalString(asset.path);
    if (!id || !type || !filePath) return [];

    const prompt = optionalString(asset.prompt);
    const model = optionalString(asset.model);
    const mimeType = optionalString(asset.mimeType);
    const generatedAt = optionalString(asset.generatedAt);
    const fileName = path.basename(filePath);
    const mediaType = generatedAssetMediaType(type, mimeType, filePath);
    const thumbnailUri = mediaType === 'image' ? this.resolveThumbnailUri?.(filePath) : undefined;

    return [
      {
        id: `generated-asset:${id}`,
        kind: 'generated-asset',
        label: prompt ? `${fileName} · ${prompt}` : fileName,
        description: model ? `Generated asset: ${model}` : 'Generated asset',
        icon: iconForGraphKind('generated-asset'),
        source: {
          partition: 'generated-assets',
          sourceId: id,
          sourceKind: type,
          filePath: indexPath,
          refId: filePath,
        },
        projectRoot,
        filePath,
        canonicalName: fileName,
        searchText: buildProjectSearchText([id, fileName, prompt, model, mimeType, type]),
        navigationData: {
          assetId: id,
          filePath,
          type,
        },
        ...(thumbnailUri ? { thumbnailUri } : {}),
        freshness: 'fresh',
        metadata: {
          mediaType,
          fileType: path.extname(filePath).replace(/^\./, ''),
          ...(generatedAt ? { generatedAt } : {}),
          ...(model ? { model } : {}),
        },
      } satisfies ProjectSearchItem,
    ];
  }
}

class VscodeJsonReader implements JsonReader {
  constructor(private readonly logger?: ProjectSearchLogger) {}

  async read<T>(filePath: string): Promise<T | null> {
    let raw: Uint8Array;
    try {
      raw = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
    } catch {
      return null;
    }

    try {
      return JSON.parse(new TextDecoder().decode(raw)) as T;
    } catch (error) {
      this.logger?.warn('Failed to parse project search compatibility JSON', {
        filePath,
        error: formatUnknownError(error),
      });
      return null;
    }
  }
}

class VscodeWorkspaceFileFinder implements WorkspaceFileFinder {
  async findFiles(include: string, exclude?: string): Promise<readonly vscode.Uri[]> {
    return vscode.workspace.findFiles(include, exclude);
  }
}

function createStoryItem(
  projectRoot: string,
  filePath: string,
  kind: 'script-role' | 'story-scene' | 'story-section',
  label: string,
  input: {
    readonly id: string;
    readonly description: string;
    readonly navigationData: Record<string, unknown>;
    readonly searchText: string;
  },
): ProjectSearchItem {
  return {
    id: input.id,
    kind,
    label,
    description: input.description,
    icon: kind === 'script-role' ? '@' : kind === 'story-scene' ? '#' : '§',
    source: {
      partition: 'story-symbols',
      sourceId: input.id,
      sourceKind: kind,
      filePath,
      uri: vscode.Uri.file(filePath).toString(),
      projectRelativePath: path.relative(projectRoot, filePath),
    },
    projectRoot,
    filePath,
    canonicalName: label,
    searchText: input.searchText,
    navigationData: input.navigationData,
    freshness: 'fresh',
  };
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function createMediaItem(
  projectRoot: string,
  filePath: string,
  fileName: string,
  freshness: ProjectIndexFreshness,
  input: { readonly libraryName?: string; readonly mediaType?: AssetMediaType },
): ProjectSearchItem {
  const mediaType = input.mediaType;
  return {
    id: `media:${filePath}`,
    kind: mediaType === 'document' || mediaType === 'text' ? 'document' : 'media',
    label: fileName,
    description: input.libraryName ? `Media: ${input.libraryName}` : 'Media',
    icon: iconForMediaType(mediaType),
    source: {
      partition: 'media-library',
      sourceId: filePath,
      sourceKind: mediaType,
      filePath,
    },
    projectRoot,
    filePath,
    canonicalName: fileName,
    searchText: buildProjectSearchText([fileName, filePath, input.libraryName, mediaType]),
    navigationData: {
      filePath,
      ...(input.libraryName ? { libraryName: input.libraryName } : {}),
    },
    freshness,
    metadata: {
      ...(mediaType ? { mediaType } : {}),
    },
  };
}

function getStoryApi(): NekoStoryAPI | undefined {
  try {
    const extension = vscode.extensions.getExtension<NekoStoryAPI>('neko.neko-story');
    return extension?.isActive ? extension.exports : undefined;
  } catch {
    return undefined;
  }
}

async function readWorkspaceText(filePath: string): Promise<string> {
  try {
    const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
    return new TextDecoder().decode(raw);
  } catch {
    return '';
  }
}

function readVariants(value: unknown): readonly AssetVariantRecord[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const record = isRecord(item) ? item : {};
    return {
      id: optionalString(record.id),
      name: optionalString(record.name),
      thumbnailPath: optionalString(record.thumbnailPath),
      files: readAssetFiles(record.files),
    };
  });
}

function readAssetFiles(value: unknown): readonly AssetFileRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => ({
      id: optionalString(item.id),
      name: optionalString(item.name),
      path: optionalString(item.path),
      mediaType: optionalString(item.mediaType),
      purpose: optionalString(item.purpose),
      characterAsset: readCharacterAsset(item.characterAsset),
    }));
}

function readCharacterAsset(value: unknown): CharacterAssetRecord | undefined {
  if (!isRecord(value)) return undefined;
  const bundleLocator = isRecord(value.bundleLocator)
    ? {
        bundlePath: optionalString(value.bundleLocator.bundlePath),
        entryPath: optionalString(value.bundleLocator.entryPath),
        fragmentRef: optionalString(value.bundleLocator.fragmentRef),
      }
    : undefined;
  return {
    assetDimension: optionalString(value.assetDimension),
    mediaKind: optionalString(value.mediaKind),
    storageMode: optionalString(value.storageMode),
    ...(bundleLocator ? { bundleLocator } : {}),
    sourceOrigin: optionalString(value.sourceOrigin),
    sourceHash: optionalString(value.sourceHash),
  };
}

function readStringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

function compactStrings(values: readonly (string | undefined)[]): readonly string[] {
  return values.filter((value): value is string => typeof value === 'string' && value.length > 0);
}

function readAssetMediaType(value: unknown): AssetMediaType | undefined {
  return isAssetMediaType(value) ? value : undefined;
}

function detectMediaTypeSafe(filePath: string | undefined): AssetMediaType | undefined {
  if (!filePath || (!isMediaFile(filePath) && !isDocumentFile(filePath))) return undefined;
  return detectMediaType(filePath);
}

function generatedAssetMediaType(
  type: string,
  mimeType: string | undefined,
  filePath: string,
): AssetMediaType | undefined {
  if (type === 'generated-image' || mimeType?.startsWith('image/')) return 'image';
  if (type === 'generated-video' || mimeType?.startsWith('video/')) return 'video';
  if (type === 'generated-audio' || mimeType?.startsWith('audio/')) return 'audio';
  return detectMediaTypeSafe(filePath);
}

function isAssetMediaType(value: unknown): value is AssetMediaType {
  return (
    value === 'video' ||
    value === 'audio' ||
    value === 'image' ||
    value === 'sequence' ||
    value === 'text' ||
    value === 'document'
  );
}

function iconForAssetCategory(
  category: string | undefined,
  mediaType: AssetMediaType | undefined,
): string {
  if (category === 'character') return '🎭';
  if (category === 'environment') return '🏞';
  if (category === 'object') return '◆';
  if (category === 'vehicle') return '▰';
  if (category === 'audio') return '♪';
  if (category === 'document') return '📄';
  return iconForMediaType(mediaType);
}

function iconForMediaType(mediaType: AssetMediaType | undefined): string {
  if (mediaType === 'video') return '🎬';
  if (mediaType === 'audio') return '♪';
  if (mediaType === 'image') return '🖼';
  if (mediaType === 'sequence') return '▦';
  if (mediaType === 'text') return 'TXT';
  if (mediaType === 'document') return '📄';
  return '◈';
}

function iconForGraphKind(kind: string): string {
  if (kind === 'entity') return '◇';
  if (kind === 'asset') return '◈';
  if (kind === 'canvas-node') return '⬡';
  if (kind === 'generated-asset') return '✦';
  if (kind === 'script-range') return '¶';
  return '◇';
}

function dedupeById<T extends { readonly id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
  }
  return deduped;
}

function isPathInside(filePath: string, root: string): boolean {
  const relative = path.relative(root, filePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
