import * as path from 'path';
import { fileURLToPath } from 'url';
import * as vscode from 'vscode';
import type { ProjectSearchQuery, ProjectSearchQueryContext } from '@neko/shared';
import { resolveDocumentPath } from '../documentPathResolver';

const URI_SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const WINDOWS_DRIVE_RE = /^[A-Za-z]:[\\/]/;

export async function resolveProjectSearchContext(
  query: ProjectSearchQuery,
): Promise<ProjectSearchQueryContext> {
  if (query.projectRoot) {
    return {
      projectRoot: normalizeLocalPath(query.projectRoot),
      resolvedContextFilePath: await resolveOptionalContextPath(query.contextFilePath),
      contextUri: query.contextUri,
      fallbackDerived: false,
    };
  }

  const contextPath = await resolveOptionalContextPath(query.contextFilePath ?? query.contextUri);
  const contextRoot = contextPath ? findWorkspaceRootForPath(contextPath) : undefined;
  if (contextRoot) {
    return {
      projectRoot: contextRoot,
      resolvedContextFilePath: contextPath,
      contextUri: query.contextUri,
      fallbackDerived: false,
    };
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  return {
    projectRoot: workspaceRoot,
    resolvedContextFilePath: contextPath,
    contextUri: query.contextUri,
    fallbackDerived: Boolean(workspaceRoot),
  };
}

async function resolveOptionalContextPath(value: string | undefined): Promise<string | undefined> {
  if (!value) return undefined;
  const localPath = toLocalFilesystemPath(value) ?? value;
  try {
    return normalizeLocalPath(await resolveDocumentPath(localPath));
  } catch {
    return normalizeLocalPath(localPath);
  }
}

function findWorkspaceRootForPath(filePath: string): string | undefined {
  let best: string | undefined;
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const root = normalizeLocalPath(folder.uri.fsPath);
    if (isPathInside(filePath, root) && (!best || root.length > best.length)) {
      best = root;
    }
  }
  return best;
}

function isPathInside(filePath: string, root: string): boolean {
  const relative = path.relative(root, filePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function toLocalFilesystemPath(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (WINDOWS_DRIVE_RE.test(trimmed) || trimmed.startsWith('/')) return trimmed;
  if (!URI_SCHEME_RE.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'file:' ? fileURLToPath(url) : undefined;
  } catch {
    return undefined;
  }
}

function normalizeLocalPath(value: string): string {
  return path.normalize(value);
}
