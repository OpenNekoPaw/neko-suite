import * as vscode from 'vscode';
import * as path from 'node:path';

export const DOCUMENT_IMAGE_CACHE_DIR = 'document-image-cache';

export function getDocumentImageCacheFsPath(context: vscode.ExtensionContext): string {
  return path.join(context.globalStorageUri.fsPath, DOCUMENT_IMAGE_CACHE_DIR);
}

export function getDocumentImageCacheUri(context: vscode.ExtensionContext): vscode.Uri {
  return vscode.Uri.file(getDocumentImageCacheFsPath(context));
}
