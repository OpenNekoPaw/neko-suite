import * as vscode from 'vscode';

export const DOCUMENT_IMAGE_CACHE_DIR = 'document-image-cache';

export function getDocumentImageCacheUri(context: vscode.ExtensionContext): vscode.Uri {
  return vscode.Uri.joinPath(context.globalStorageUri, DOCUMENT_IMAGE_CACHE_DIR);
}
