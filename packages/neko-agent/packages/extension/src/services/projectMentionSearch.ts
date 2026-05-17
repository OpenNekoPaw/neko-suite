/**
 * Project mention aggregation for agent @completion.
 *
 * Reads persisted project indexes owned by the asset, media, and entity graph
 * layers. The agent extension stays a host-side aggregator and does not depend
 * on those extension implementations directly.
 */

import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import {
  detectMediaType,
  isDocumentFile,
  isMediaFile,
  resolveStorageLayout,
  type AssetMediaType,
} from '@neko/shared';
import type { AgentProjectFileSearchPlan, AgentProjectMentionCandidate } from '@neko/agent/runtime';
import type { ProjectMentionMediaType } from '@neko-agent/types';

const MAX_ASSET_RESULTS = 10;
const MAX_MEDIA_RESULTS = 10;
const MAX_ENTITY_RESULTS = 10;

interface ProjectMentionSearchOptions {
  readonly webview?: Pick<vscode.Webview, 'asWebviewUri'>;
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

export async function searchProjectMentionCandidates(
  plan: AgentProjectFileSearchPlan,
  options: ProjectMentionSearchOptions = {},
): Promise<readonly AgentProjectMentionCandidate[]> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return [];
  }

  const layout = resolveStorageLayout(workspaceRoot, os.homedir());
  const filter = extractSearchFilter(plan);
  const [assets, media, entities] = await Promise.all([
    searchAssetLibraryMentions(layout.project.facts.assetLibrary, filter, options),
    searchMediaLibraryMentions(
      layout.project.local.cache.searchIndex,
      layout.project.local.cache.mediaMetadata,
      filter,
    ),
    searchCreativeEntityMentions(layout.project.local.cache.assetGraph, filter),
  ]);

  return [...assets, ...media, ...entities];
}

async function searchAssetLibraryMentions(
  libraryPath: string,
  filter: string,
  options: ProjectMentionSearchOptions,
): Promise<readonly AgentProjectMentionCandidate[]> {
  const data = await readJsonFile<AssetLibraryData>(libraryPath);
  const entities = Array.isArray(data?.entities) ? data.entities : [];
  const results: AgentProjectMentionCandidate[] = [];

  for (const entity of entities) {
    const id = optionalString(entity.id);
    const name = optionalString(entity.name);
    if (!id || !name) {
      continue;
    }

    const category = optionalString(entity.category);
    const description = optionalString(entity.description);
    const tags = readStringArray(entity.tags);
    const aliases = readStringArray(entity.aliases);
    const variants = readVariants(entity.variants);
    const defaultVariant = variants[0];
    const primaryFile = defaultVariant?.files[0];
    const thumbnailUri = resolveThumbnailUri(defaultVariant?.thumbnailPath, options.webview);
    const searchText = [name, category, description, ...tags, ...aliases, primaryFile?.path]
      .filter(Boolean)
      .join(' ');

    if (!matchesFilter(searchText, filter)) {
      continue;
    }

    const mediaType =
      readMentionMediaType(primaryFile?.mediaType) ?? detectMentionMediaType(primaryFile?.path);
    results.push({
      type: 'asset',
      id,
      label: name,
      summary: `Asset: ${name}${category ? ` (${category})` : ''}`,
      source: 'asset-library',
      icon: iconForAssetCategory(category, mediaType),
      ...(primaryFile?.path ? { filePath: primaryFile.path } : {}),
      ...(mediaType ? { mediaType } : {}),
      ...(category ? { entityType: category } : {}),
      ...(thumbnailUri ? { thumbnailUri } : {}),
      navigationData: {
        assetId: id,
        ...(category ? { category } : {}),
        ...(primaryFile?.id ? { fileId: primaryFile.id } : {}),
        ...(defaultVariant?.id ? { variantId: defaultVariant.id } : {}),
      },
    });

    if (results.length >= MAX_ASSET_RESULTS) {
      break;
    }
  }

  return results;
}

async function searchMediaLibraryMentions(
  searchIndexPath: string,
  metadataCachePath: string,
  filter: string,
): Promise<readonly AgentProjectMentionCandidate[]> {
  const fromSearchIndex = await readMediaSearchIndexMentions(searchIndexPath, filter);
  if (fromSearchIndex.length > 0) {
    return fromSearchIndex;
  }
  return readMediaMetadataMentions(metadataCachePath, filter);
}

async function readMediaSearchIndexMentions(
  searchIndexPath: string,
  filter: string,
): Promise<readonly AgentProjectMentionCandidate[]> {
  const data = await readJsonFile<MediaSearchIndexData>(searchIndexPath);
  const entries = Array.isArray(data?.entries) ? data.entries : [];
  const results: AgentProjectMentionCandidate[] = [];

  for (const entry of entries) {
    const filePath = optionalString(entry.filePath);
    const fileName =
      optionalString(entry.fileName) ?? (filePath ? path.basename(filePath) : undefined);
    if (!filePath || !fileName || !matchesFilter(`${fileName} ${filePath}`, filter)) {
      continue;
    }

    const mediaType = readMentionMediaType(entry.mediaType) ?? detectMentionMediaType(filePath);
    results.push({
      type: 'media',
      id: filePath,
      label: fileName,
      summary: `Media: ${fileName}`,
      source: 'media-library',
      icon: iconForMediaType(mediaType),
      filePath,
      ...(mediaType ? { mediaType } : {}),
      navigationData: buildNavigationData({
        filePath,
        libraryName: optionalString(entry.libraryName),
      }),
    });

    if (results.length >= MAX_MEDIA_RESULTS) {
      break;
    }
  }

  return results;
}

async function readMediaMetadataMentions(
  metadataCachePath: string,
  filter: string,
): Promise<readonly AgentProjectMentionCandidate[]> {
  const data = await readJsonFile<MediaMetadataCacheData>(metadataCachePath);
  const entries =
    data?.entries && typeof data.entries === 'object' ? Object.keys(data.entries) : [];
  const results: AgentProjectMentionCandidate[] = [];

  for (const filePath of entries) {
    const fileName = path.basename(filePath);
    if (!matchesFilter(`${fileName} ${filePath}`, filter)) {
      continue;
    }

    const mediaType = detectMentionMediaType(filePath);
    results.push({
      type: 'media',
      id: filePath,
      label: fileName,
      summary: `Media: ${fileName}`,
      source: 'media-library',
      icon: iconForMediaType(mediaType),
      filePath,
      ...(mediaType ? { mediaType } : {}),
      navigationData: { filePath },
    });

    if (results.length >= MAX_MEDIA_RESULTS) {
      break;
    }
  }

  return results;
}

async function searchCreativeEntityMentions(
  graphPath: string,
  filter: string,
): Promise<readonly AgentProjectMentionCandidate[]> {
  const data = await readJsonFile<CreativeGraphData>(graphPath);
  const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
  const results: AgentProjectMentionCandidate[] = [];

  for (const node of nodes) {
    const id = optionalString(node.id);
    const label = optionalString(node.label);
    const kind = optionalString(node.kind);
    const refId = optionalString(node.refId);
    if (!id || !label || !kind || !matchesFilter(`${label} ${kind} ${refId ?? ''}`, filter)) {
      continue;
    }

    results.push({
      type: 'entity',
      id,
      label,
      summary: `Entity: ${label}${kind ? ` (${kind})` : ''}`,
      source: 'entity-graph',
      icon: iconForGraphKind(kind),
      entityType: kind,
      navigationData: {
        nodeId: id,
        kind,
        ...(refId ? { refId } : {}),
      },
    });

    if (results.length >= MAX_ENTITY_RESULTS) {
      break;
    }
  }

  return results;
}

function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
    return JSON.parse(new TextDecoder().decode(content)) as T;
  } catch {
    return null;
  }
}

function extractSearchFilter(plan: AgentProjectFileSearchPlan): string {
  const includePattern = plan.includePattern;
  if (includePattern === '**/*') {
    return '';
  }
  const match = /^\*\*\/\*(.*)\*$/.exec(includePattern);
  return (match?.[1] ?? '').trim().toLowerCase();
}

function readVariants(value: unknown): readonly AssetVariantRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

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
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (isRecord(item) ? item : null))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      id: optionalString(item.id),
      name: optionalString(item.name),
      path: optionalString(item.path),
      mediaType: optionalString(item.mediaType),
      purpose: optionalString(item.purpose),
    }));
}

function buildNavigationData(input: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
}

function readStringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function matchesFilter(text: string, filter: string): boolean {
  return !filter || text.toLowerCase().includes(filter);
}

function detectMentionMediaType(filePath: string | undefined): ProjectMentionMediaType | undefined {
  if (!filePath) {
    return undefined;
  }
  if (!isMediaFile(filePath) && !isDocumentFile(filePath)) {
    return undefined;
  }
  return detectMediaType(filePath);
}

function readMentionMediaType(value: unknown): ProjectMentionMediaType | undefined {
  return isMentionMediaType(value) ? value : undefined;
}

function isMentionMediaType(value: unknown): value is AssetMediaType {
  return (
    value === 'video' ||
    value === 'audio' ||
    value === 'image' ||
    value === 'sequence' ||
    value === 'text' ||
    value === 'document'
  );
}

function resolveThumbnailUri(
  thumbnailPath: string | undefined,
  webview: Pick<vscode.Webview, 'asWebviewUri'> | undefined,
): string | undefined {
  if (!thumbnailPath || !webview) {
    return undefined;
  }
  return webview.asWebviewUri(vscode.Uri.file(thumbnailPath)).toString();
}

function iconForAssetCategory(
  category: string | undefined,
  mediaType: ProjectMentionMediaType | undefined,
): string {
  if (category === 'character') return '🎭';
  if (category === 'environment') return '🏞';
  if (category === 'object') return '◆';
  if (category === 'vehicle') return '▰';
  if (category === 'audio') return '♪';
  if (category === 'document') return '📄';
  return iconForMediaType(mediaType);
}

function iconForMediaType(mediaType: ProjectMentionMediaType | undefined): string {
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

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
