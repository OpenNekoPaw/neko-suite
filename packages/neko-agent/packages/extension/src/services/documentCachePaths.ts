import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { resolveStorageLayout } from '@neko/shared';

export const DOCUMENT_IMAGE_CACHE_DIR = 'document-image-cache';

export function getDocumentImageCacheFsPath(context: vscode.ExtensionContext): string {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceRoot) {
    const layout = resolveStorageLayout(workspaceRoot, os.homedir() || workspaceRoot);
    return path.join(layout.project.local.cache.root, DOCUMENT_IMAGE_CACHE_DIR);
  }
  return path.join(context.globalStorageUri.fsPath, DOCUMENT_IMAGE_CACHE_DIR);
}

export function getDocumentImageCacheUri(context: vscode.ExtensionContext): vscode.Uri {
  return vscode.Uri.file(getDocumentImageCacheFsPath(context));
}

export function getWorkspaceCacheUri(): vscode.Uri | undefined {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return undefined;
  }
  const layout = resolveStorageLayout(workspaceRoot, os.homedir() || workspaceRoot);
  return vscode.Uri.file(layout.project.local.cache.root);
}

export function isDocumentImageCachePath(value: string): boolean {
  const normalized = value.replace(/\\/g, '/').replace(/%20/g, ' ');
  return (
    normalized.includes(`/${DOCUMENT_IMAGE_CACHE_DIR}/`) ||
    normalized.endsWith(`/${DOCUMENT_IMAGE_CACHE_DIR}`)
  );
}
