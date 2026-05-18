/**
 * Project mention projection for agent @completion.
 *
 * The Agent extension consumes the project cache/search facade instead of
 * owning cache file schemas. Domain-specific cache reads live behind
 * ProjectSearchAdapter implementations.
 */

import * as vscode from 'vscode';
import type { ProjectSearchItem, ProjectSearchItemKind, ProjectSearchResult } from '@neko/shared';
import type { AgentProjectFileSearchPlan, AgentProjectMentionCandidate } from '@neko/agent/runtime';
import type {
  ProjectMentionExtraType,
  ProjectMentionMediaType,
  ProjectMentionSource,
} from '@neko-agent/types';
import { PROJECT_SEARCH_QUERY_COMMAND } from './projectSearch/commands';

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
  const result = await vscode.commands.executeCommand<ProjectSearchResult>(
    PROJECT_SEARCH_QUERY_COMMAND,
    {
      text: filter,
      limit: plan.limit,
      kinds: MENTION_SEARCH_KINDS,
      freshness: 'allow-stale',
      contextFilePath: options.contextFilePath ?? activeEditorUri?.fsPath,
      contextUri: options.contextUri ?? activeEditorUri?.toString(),
      projectRoot: options.projectRoot,
    },
  );

  return (result?.items ?? []).map(projectSearchItemToMentionCandidate);
}

function projectSearchItemToMentionCandidate(
  item: ProjectSearchItem,
): AgentProjectMentionCandidate {
  const type = mentionTypeForProjectItem(item);
  const source = mentionSourceForProjectItem(item);
  const mediaType = readMentionMediaType(item.metadata?.['mediaType']);
  const entityType = readString(item.metadata?.['entityType']) ?? item.source.sourceKind;
  return {
    type,
    id: item.id,
    label: item.label,
    summary: item.description
      ? `${labelForType(type)}: ${item.label} (${item.description})`
      : `${labelForType(type)}: ${item.label}`,
    ...(source ? { source } : {}),
    ...(item.icon ? { icon: item.icon } : {}),
    ...(item.filePath ? { filePath: item.filePath } : {}),
    ...(mediaType ? { mediaType } : {}),
    ...(entityType ? { entityType } : {}),
    ...(item.thumbnailUri ? { thumbnailUri: item.thumbnailUri } : {}),
    navigationData: stringifyNavigationData({
      ...item.navigationData,
      projectRoot: item.projectRoot,
      partition: item.source.partition,
      sourceId: item.source.sourceId,
      sourceKind: item.source.sourceKind,
      refId: item.source.refId,
      freshness: item.freshness,
    }),
  };
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
