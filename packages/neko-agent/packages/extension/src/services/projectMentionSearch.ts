/**
 * Project mention projection for agent @completion.
 *
 * The Agent extension consumes the project cache/search facade instead of
 * owning cache file schemas. Domain-specific cache reads live behind
 * ProjectSearchAdapter implementations.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import type { ProjectSearchItem, ProjectSearchItemKind, ProjectSearchResult } from '@neko/shared';
import type { AgentProjectFileSearchPlan, AgentProjectMentionCandidate } from '@neko/agent/runtime';
import type {
  ProjectMentionExtraType,
  ProjectMentionMediaType,
  ProjectMentionSource,
} from '@neko-agent/types';
import { PROJECT_SEARCH_QUERY_COMMAND } from '@neko/search/host-vscode';

const MENTION_SEARCH_KINDS: readonly ProjectSearchItemKind[] = [
  'story-scene',
  'story-section',
  'script-role',
  'creative-entity',
  'entity-candidate',
  'asset',
  'media',
  'document',
  'generated-asset',
];

const ROLEPLAY_SEARCH_KINDS: readonly ProjectSearchItemKind[] = [
  'script-role',
  'creative-entity',
  'entity-candidate',
  'asset',
  'generated-asset',
];

const ASSETS_CONTRACT_PATH_COMMAND = 'neko.assets.contractPath';
const WINDOWS_DRIVE_RE = /^[A-Za-z]:[\\/]/;
const WINDOWS_UNC_RE = /^\\\\/;

interface ProjectMentionSearchOptions {
  readonly contextFilePath?: string;
  readonly contextUri?: string;
  readonly projectRoot?: string;
}

export async function searchProjectMentionCandidates(
  plan: AgentProjectFileSearchPlan,
  options: ProjectMentionSearchOptions = {},
): Promise<readonly AgentProjectMentionCandidate[]> {
  const filter = extractSearchFilter(plan);
  const activeEditorUri = vscode.window.activeTextEditor?.document.uri;
  const isRoleplaySearch = plan.purpose === 'roleplay';
  const result = await vscode.commands.executeCommand<ProjectSearchResult>(
    PROJECT_SEARCH_QUERY_COMMAND,
    {
      text: filter,
      mode: 'mention',
      limit: plan.limit,
      kinds: isRoleplaySearch ? ROLEPLAY_SEARCH_KINDS : MENTION_SEARCH_KINDS,
      ...(isRoleplaySearch
        ? { partitions: ['story-symbols', 'creative-entities', 'asset-library'] }
        : {}),
      freshness: 'allow-stale',
      contextFilePath: options.contextFilePath ?? activeEditorUri?.fsPath,
      contextUri: options.contextUri ?? activeEditorUri?.toString(),
      projectRoot: options.projectRoot,
    },
  );

  const items = result?.items ?? [];
  return Promise.all(
    (isRoleplaySearch ? items.filter(isRoleplayProjectSearchItem) : items).map(
      projectSearchItemToMentionCandidate,
    ),
  );
}

function isRoleplayProjectSearchItem(item: ProjectSearchItem): boolean {
  if (item.kind === 'script-role') return true;
  return isCharacterProjectSearchItem(item);
}

function isCharacterProjectSearchItem(item: ProjectSearchItem): boolean {
  return (
    isCharacterLikeString(readString(item.source.metadata?.['entityKind'])) ||
    isCharacterLikeString(readString(item.metadata?.['entityType'])) ||
    isCharacterLikeString(item.source.sourceKind) ||
    isCharacterLikeString(readString(item.metadata?.['category'])) ||
    isCharacterLikeString(readString(item.navigationData?.['kind'])) ||
    isCharacterLikeString(readString(item.navigationData?.['entityKind']))
  );
}

function isCharacterLikeString(value: string | undefined): boolean {
  if (!value) return false;
  return ['character', 'role', '角色'].includes(value.trim().toLowerCase());
}

async function projectSearchItemToMentionCandidate(
  item: ProjectSearchItem,
): Promise<AgentProjectMentionCandidate> {
  const type = mentionTypeForProjectItem(item);
  const source = mentionSourceForProjectItem(item);
  const mediaType = readMentionMediaType(item.metadata?.['mediaType']);
  const thumbnailUri = item.visualResource?.projectedUri ?? item.thumbnailUri;
  const entityType =
    readString(item.source.metadata?.['entityKind']) ??
    readString(item.metadata?.['entityType']) ??
    readString(item.metadata?.['category']) ??
    item.source.sourceKind;
  const referencePath = await projectMentionReferencePath(item);
  return {
    type,
    id: item.id,
    label: item.label,
    summary: item.description
      ? `${labelForType(type)}: ${item.label} (${item.description})`
      : `${labelForType(type)}: ${item.label}`,
    ...(item.searchText ? { searchText: item.searchText } : {}),
    ...(source ? { source } : {}),
    ...(item.icon ? { icon: item.icon } : {}),
    ...(referencePath ? { filePath: referencePath } : {}),
    ...(mediaType ? { mediaType } : {}),
    ...(entityType ? { entityType } : {}),
    ...(thumbnailUri ? { thumbnailUri } : {}),
    navigationData: projectMentionNavigationData(item, referencePath, type),
  };
}

async function projectMentionReferencePath(item: ProjectSearchItem): Promise<string | undefined> {
  const filePath = readString(item.filePath);
  if (!filePath) return undefined;

  const normalizedPath = normalizeMentionPath(filePath);
  if (!isLocalAbsolutePath(filePath)) {
    return normalizedPath;
  }

  const projectRelativePath = contractWithProjectRoot(filePath, item.projectRoot);
  if (projectRelativePath) {
    return projectRelativePath;
  }

  const contractedPath = await contractPathWithAssets(filePath, item);
  if (contractedPath && !isLocalAbsolutePath(contractedPath)) {
    return normalizeMentionPath(contractedPath);
  }

  return undefined;
}

async function contractPathWithAssets(
  filePath: string,
  item: ProjectSearchItem,
): Promise<string | undefined> {
  let contracted: unknown;
  try {
    contracted = await vscode.commands.executeCommand<unknown>(
      ASSETS_CONTRACT_PATH_COMMAND,
      filePath,
      {
        owningWorkspaceRoot: item.projectRoot,
        workspaceRoots: [item.projectRoot],
      },
    );
  } catch {
    return undefined;
  }
  return typeof contracted === 'string' && contracted.length > 0 ? contracted : undefined;
}

function projectMentionNavigationData(
  item: ProjectSearchItem,
  referencePath: string | undefined,
  type: ProjectMentionExtraType,
): Record<string, string> {
  const navigationData: Record<string, unknown> = { ...item.navigationData };
  const rawFilePath = readString(item.filePath) ?? readString(navigationData['filePath']);
  const rawSourceId = readString(item.source.sourceId);
  const sourceId =
    rawSourceId && isLocalAbsolutePath(rawSourceId) ? (referencePath ?? undefined) : rawSourceId;

  if (referencePath) {
    navigationData['path'] = referencePath;
    navigationData['filePath'] = referencePath;
    navigationData['portablePath'] = referencePath;
    const variable = extractPathVariable(referencePath);
    if (variable) {
      navigationData['variable'] = variable;
    }
  } else {
    removeAbsoluteNavigationPath(navigationData, 'path');
    removeAbsoluteNavigationPath(navigationData, 'filePath');
    removeAbsoluteNavigationPath(navigationData, 'portablePath');
  }

  if (referencePath && rawFilePath && isLocalAbsolutePath(rawFilePath)) {
    navigationData['resolvedPath'] = normalizeMentionPath(rawFilePath);
  }

  return stringifyNavigationData({
    ...navigationData,
    ...(type === 'asset' ? { assetId: assetIdForProjectItem(item) } : {}),
    projectRoot: item.projectRoot,
    partition: item.source.partition,
    ...(sourceId ? { sourceId } : {}),
    sourceKind: item.source.sourceKind,
    refId: item.source.refId,
    freshness: item.freshness,
  });
}

function removeAbsoluteNavigationPath(data: Record<string, unknown>, key: string): void {
  const value = readString(data[key]);
  if (value && isLocalAbsolutePath(value)) {
    delete data[key];
  }
}

function contractWithProjectRoot(filePath: string, projectRoot: string): string | undefined {
  if (!projectRoot) return undefined;
  const relativePath = path.relative(projectRoot, filePath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return undefined;
  }
  return normalizeMentionPath(relativePath);
}

function isLocalAbsolutePath(filePath: string): boolean {
  return (
    path.isAbsolute(filePath) || WINDOWS_DRIVE_RE.test(filePath) || WINDOWS_UNC_RE.test(filePath)
  );
}

function normalizeMentionPath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function extractPathVariable(filePath: string): string | undefined {
  return /^\$\{([^}]+)\}(?:\/|$)/.exec(filePath)?.[1];
}

function assetIdForProjectItem(item: ProjectSearchItem): string | undefined {
  return (
    readString(item.navigationData?.['assetId']) ??
    readString(item.source.metadata?.['assetId']) ??
    (item.source.partition === 'asset-library' ? item.source.sourceId : undefined) ??
    parseAssetIdFromItemId(item.id)
  );
}

function parseAssetIdFromItemId(id: string): string | undefined {
  const prefix = 'asset:';
  return id.startsWith(prefix) ? id.slice(prefix.length) : undefined;
}

function mentionTypeForProjectItem(item: ProjectSearchItem): ProjectMentionExtraType {
  if (item.kind === 'story-scene' || item.kind === 'story-section') return 'scene';
  if (item.kind === 'script-role') return 'character';
  if (item.kind === 'asset' || item.kind === 'generated-asset') return 'asset';
  if (item.kind === 'media' || item.kind === 'document') return 'media';
  return 'entity';
}

function mentionSourceForProjectItem(item: ProjectSearchItem): ProjectMentionSource | undefined {
  if (item.source.partition === 'story-symbols') return 'story';
  if (item.source.partition === 'asset-library') return 'asset-library';
  if (item.source.partition === 'media-library' || item.source.partition === 'documents') {
    return 'media-library';
  }
  if (
    item.source.partition === 'creative-entities' ||
    item.source.partition === 'generated-assets'
  ) {
    return 'entity-graph';
  }
  return undefined;
}

function labelForType(type: ProjectMentionExtraType): string {
  if (type === 'character') return 'Character';
  if (type === 'scene') return 'Scene';
  if (type === 'asset') return 'Asset';
  if (type === 'media') return 'Media';
  if (type === 'entity') return 'Entity';
  return 'Context';
}

function stringifyNavigationData(input: Record<string, unknown>): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    output[key] = String(value);
  }
  return output;
}

function extractSearchFilter(plan: AgentProjectFileSearchPlan): string {
  const includePattern = plan.includePattern;
  if (includePattern === '**/*') {
    return '';
  }
  const match = /^\*\*\/\*(.*)\*$/.exec(includePattern);
  return (match?.[1] ?? '').trim();
}

function readMentionMediaType(value: unknown): ProjectMentionMediaType | undefined {
  return isMentionMediaType(value) ? value : undefined;
}

function isMentionMediaType(value: unknown): value is ProjectMentionMediaType {
  return (
    value === 'video' ||
    value === 'audio' ||
    value === 'image' ||
    value === 'sequence' ||
    value === 'text' ||
    value === 'document'
  );
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
