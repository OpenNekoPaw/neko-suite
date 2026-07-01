import * as path from 'node:path';
import * as vscode from 'vscode';
import { WORKSPACE_GENERATED_ASSET_ROOT, type GeneratedAsset } from '@neko/shared';
import { GeneratedAssetIndex } from '@neko/platform/media/generated-asset-index';

export interface GeneratedAssetLookup {
  get(id: string): GeneratedAsset | undefined;
}

export function resolveGeneratedAssetOpenPath(
  ref: string,
  lookup: GeneratedAssetLookup | undefined,
): string | undefined {
  if (!lookup || !ref.startsWith('generated-assets/')) return undefined;

  const basename = path.basename(ref);
  const extension = path.extname(basename);
  const assetId = extension ? basename.slice(0, -extension.length) : basename;
  if (!assetId) return undefined;

  return lookup.get(assetId)?.path;
}

export function createWorkspaceGeneratedAssetIndex(
  options: {
    readonly logger?: {
      warn(message: string, details?: unknown): void;
    };
  } = {},
): GeneratedAssetIndex | undefined {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return undefined;
  }

  try {
    const generatedDir = vscode.Uri.joinPath(
      workspaceFolder.uri,
      WORKSPACE_GENERATED_ASSET_ROOT,
    ).fsPath;
    const assetIndex = new GeneratedAssetIndex(generatedDir);
    void assetIndex.load();
    return assetIndex;
  } catch (error) {
    options.logger?.warn('Failed to initialize GeneratedAssetIndex — asset tracking disabled', {
      error,
    });
    return undefined;
  }
}
