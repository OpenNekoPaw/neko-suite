/**
 * VSCode project search host adapter for @neko/agent mention projection.
 */

import * as vscode from 'vscode';
import type { AgentProjectFileCandidate, AgentProjectFileSearchPlan } from '@neko/agent/runtime';
import { detectMediaType, isDocumentFile, isMediaFile } from '@neko/shared';

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
    plan.limit,
  );

  return files.map((file) => {
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
  });
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
