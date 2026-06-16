/**
 * VSCode project search host adapter for @neko/agent mention projection.
 */

import * as vscode from 'vscode';
import type { AgentProjectFileCandidate, AgentProjectFileSearchPlan } from '@neko/agent/runtime';
import { detectMediaType, isDocumentFile, isMediaFile } from '@neko/shared';
import { createWorkspaceMentionIgnoreFilter } from './workspaceIgnoreFilter';

export async function searchVSCodeProjectFiles(
  plan: AgentProjectFileSearchPlan,
): Promise<readonly AgentProjectFileCandidate[]> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return [];
  }

  const files = await vscode.workspace.findFiles(
    plan.includePattern,
    plan.excludePattern,
    Math.max(plan.limit * 4, plan.limit),
  );
  const filters = await Promise.all(
    workspaceFolders.map(async (folder) => ({
      folder,
      filter: await createWorkspaceMentionIgnoreFilter(folder.uri.fsPath),
    })),
  );

  return files
    .filter((file) => !isIgnoredWorkspaceFile(file, filters))
    .map((file) => {
      const relativePath = vscode.workspace.asRelativePath(file);
      const mediaType =
        !isWorkspaceCodeFile(relativePath) &&
        (isMediaFile(relativePath) || isDocumentFile(relativePath))
          ? detectMediaType(relativePath)
          : undefined;
      return {
        relativePath,
        source: 'workspace',
        icon: iconForWorkspaceFile(relativePath, mediaType),
        ...(mediaType ? { mediaType } : {}),
      };
    })
    .sort((left, right) => compareWorkspaceFileCandidates(left, right, plan))
    .slice(0, plan.limit);
}

function compareWorkspaceFileCandidates(
  left: AgentProjectFileCandidate,
  right: AgentProjectFileCandidate,
  plan: AgentProjectFileSearchPlan,
): number {
  const filter = extractSearchFilter(plan.includePattern);
  const rankOrder =
    scoreWorkspaceFileCandidate(left.relativePath, filter) -
    scoreWorkspaceFileCandidate(right.relativePath, filter);
  if (rankOrder !== 0) return rankOrder;

  const depthOrder = getPathDepth(left.relativePath) - getPathDepth(right.relativePath);
  if (depthOrder !== 0) return depthOrder;

  return left.relativePath.localeCompare(right.relativePath, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function scoreWorkspaceFileCandidate(relativePath: string, filter: string): number {
  if (!filter) return 0;
  const path = relativePath.toLowerCase();
  const fileName = getPathBaseName(path);
  if (fileName === filter) return 0;
  if (fileName.startsWith(filter)) return 1;
  if (path.includes(`/${filter}`)) return 2;
  if (fileName.includes(filter)) return 3;
  if (path.includes(filter)) return 4;
  return 5;
}

function extractSearchFilter(includePattern: string): string {
  const match = includePattern.match(/^\*\*\/\*(.*)\*$/);
  return (match?.[1] ?? '').toLowerCase();
}

function getPathDepth(relativePath: string): number {
  return relativePath.split(/[\\/]/).filter(Boolean).length;
}

function getPathBaseName(relativePath: string): string {
  return relativePath.split(/[\\/]/).pop() ?? relativePath;
}

function isIgnoredWorkspaceFile(
  file: vscode.Uri,
  filters: readonly {
    readonly folder: vscode.WorkspaceFolder;
    readonly filter: Awaited<ReturnType<typeof createWorkspaceMentionIgnoreFilter>>;
  }[],
): boolean {
  const entry = filters.find(({ folder }) => file.fsPath.startsWith(folder.uri.fsPath));
  return entry?.filter.isIgnored(file) ?? false;
}

function iconForWorkspaceFile(
  filePath: string,
  mediaType: ReturnType<typeof detectMediaType> | undefined,
): string {
  if (mediaType === 'video') return '🎬';
  if (mediaType === 'audio') return '♪';
  if (mediaType === 'image') return '🖼';
  if (mediaType === 'sequence') return '▦';
  if (mediaType === 'document') return '📄';
  if (mediaType === 'text') return 'TXT';

  const ext = filePath.split('.').pop()?.toLowerCase();
  if (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx') return 'TS';
  if (ext === 'rs') return 'RS';
  if (ext === 'json' || ext === 'jsonc') return '{}';
  if (ext === 'md' || ext === 'mdx') return 'MD';
  if (ext === 'css' || ext === 'scss' || ext === 'less') return '#';
  return '📄';
}

function isWorkspaceCodeFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase();
  return Boolean(
    ext &&
    [
      'ts',
      'tsx',
      'js',
      'jsx',
      'mjs',
      'cjs',
      'rs',
      'go',
      'py',
      'java',
      'kt',
      'swift',
      'json',
      'jsonc',
      'css',
      'scss',
      'less',
      'html',
      'xml',
    ].includes(ext),
  );
}
