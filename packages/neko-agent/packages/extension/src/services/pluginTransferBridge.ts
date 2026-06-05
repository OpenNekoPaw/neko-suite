import * as vscode from 'vscode';
import * as path from 'node:path';
import {
  buildRuntimePluginTransferPlan,
  buildRuntimePluginsAvailableMessage,
  expandRuntimePluginTransferInputs,
} from '@neko/agent/runtime';
import type { PluginTransferAssetRef, PluginTransferPayload } from '@neko-agent/types';
import { PathResolver, type ContentIngestResult, type ResourceRef } from '@neko/shared';
import {
  createGeneratedAssetResourceRef,
  GeneratedOutputContentIngestProvider,
  HostContentIngestService,
  type ContentIngestService,
} from '@neko/shared/vscode/extension';
import { getLogger, handleError } from '../base';

const logger = getLogger('PluginTransferBridge');
const CANVAS_TARGET = 'canvas';
const GENERATED_ASSETS_RELATIVE_DIR = path.join('.neko', 'generated');

export interface PluginTransferBridgeResult {
  readonly success: boolean;
  readonly executed: number;
  readonly results: unknown[];
  readonly unsupported: Array<{ target: string; reason?: string }>;
  readonly error?: string;
}

export interface PluginTransferBridgeDeps {
  readonly workspaceRoot?: string;
  readonly ingestService?: ContentIngestService;
  readonly pathResolver?: PathResolver;
  readonly executeCommand?: typeof vscode.commands.executeCommand;
}

/**
 * Dispatch a generated asset to another neko-suite plugin.
 *
 * This is an Extension-host bridge because it calls VSCode commands exposed by
 * sibling extensions. The webview and agent only deal with target identifiers
 * and asset paths.
 */
export async function sendGeneratedAssetToPlugin(
  target: string,
  assetPath?: string,
  mediaType?: string,
  payload?: PluginTransferPayload,
  deps: PluginTransferBridgeDeps = {},
): Promise<PluginTransferBridgeResult> {
  const results: unknown[] = [];
  const unsupported: PluginTransferBridgeResult['unsupported'] = [];
  try {
    const initialPayload =
      payload ??
      (target === CANVAS_TARGET && assetPath
        ? {
            kind: 'singleAsset' as const,
            asset: {
              path: assetPath,
              ...(toPluginTransferMediaType(mediaType)
                ? { mediaType: toPluginTransferMediaType(mediaType) }
                : {}),
            },
          }
        : undefined);
    const promotedPayload = await prepareTransferPayload(target, initialPayload, deps);
    const inputs = expandRuntimePluginTransferInputs({
      target,
      assetPath: initialPayload ? undefined : assetPath,
      mediaType,
      payload: promotedPayload,
    });
    const executeCommand = deps.executeCommand ?? vscode.commands.executeCommand;

    for (const input of inputs) {
      const plan = buildRuntimePluginTransferPlan(input);

      if (plan.status === 'execute-command') {
        results.push(await executeCommand(plan.command, plan.payload));
        continue;
      }

      if (plan.status === 'reveal-file') {
        results.push(await executeCommand('revealFileInOS', vscode.Uri.file(plan.filePath)));
        continue;
      }

      unsupported.push({ target: plan.target, reason: plan.reason });
      logger.warn(`Unsupported sendToPlugin target: ${plan.target}`, { reason: plan.reason });
    }
    return {
      success: unsupported.length === 0,
      executed: results.length,
      results,
      unsupported,
    };
  } catch (err) {
    logger.error(`Failed to send to ${target}:`, err);
    void handleError(
      err instanceof Error
        ? err
        : new Error(`Failed to send to ${target}. Is the extension installed?`),
      { showToUser: true, severity: 'warning' },
    );
    return {
      success: false,
      executed: results.length,
      results,
      unsupported,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function postPluginsAvailable(webview: vscode.Webview): void {
  webview.postMessage(
    buildRuntimePluginsAvailableMessage({
      hasExtension: (extensionId) => !!vscode.extensions.getExtension(extensionId),
    }),
  );
}

async function prepareTransferPayload(
  target: string,
  payload: PluginTransferPayload | undefined,
  deps: PluginTransferBridgeDeps,
): Promise<PluginTransferPayload | undefined> {
  if (target !== CANVAS_TARGET || !payload) return payload;

  if (payload.kind === 'singleAsset') {
    const promoted = await promoteCanvasAsset(payload.asset, deps);
    return promoted ? { ...payload, asset: promoted } : payload;
  }

  if (payload.kind === 'assetBatch') {
    const assets = await Promise.all(
      payload.assets.map(async (asset) => (await promoteCanvasAsset(asset, deps)) ?? asset),
    );
    return { ...payload, assets };
  }

  return payload;
}

async function promoteCanvasAsset(
  asset: PluginTransferAssetRef,
  deps: PluginTransferBridgeDeps,
): Promise<PluginTransferAssetRef | undefined> {
  if (asset.resourceRef || asset.documentResourceRef || !isPromotableLocalPath(asset.path)) {
    return undefined;
  }

  const workspaceRoot = deps.workspaceRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    logger.warn('Unable to promote generated asset before Canvas transfer: workspace missing');
    return undefined;
  }

  const ingestService =
    deps.ingestService ?? createGeneratedOutputIngestService(workspaceRoot, deps.pathResolver);
  const generatedDir = path.join(workspaceRoot, GENERATED_ASSETS_RELATIVE_DIR, mediaDir(asset));
  const result = await ingestService.ingest({
    mode: 'generated-output',
    sourcePath: asset.path,
    destination: {
      kind: 'generated-assets',
      directory: generatedDir,
    },
    fileName: asset.name ?? path.basename(asset.path),
    mimeType: mimeTypeForAsset(asset),
    caller: 'neko-agent.plugin-transfer',
    prewarm: [{ role: 'preview', mimeType: mimeTypeForAsset(asset) }],
    metadata: {
      assetId: assetIdForGeneratedAsset(asset),
      sourcePath: asset.path,
      mediaType: asset.mediaType,
      provenance: asset.provenance,
    },
  });

  if (result.status !== 'ready' || !result.outputPath) {
    logger.warn('Unable to promote generated asset before Canvas transfer', {
      status: result.status,
      error: result.error,
    });
    return undefined;
  }

  return {
    ...asset,
    path: result.outputPath,
    resourceRef: createPromotedGeneratedResourceRef(asset, result),
  };
}

function createGeneratedOutputIngestService(
  workspaceRoot: string,
  pathResolver = createWorkspacePathResolver(workspaceRoot),
): ContentIngestService {
  return new HostContentIngestService({
    providers: [
      new GeneratedOutputContentIngestProvider({
        projectRoot: workspaceRoot,
        pathResolver,
      }),
    ],
    guardOptions: {
      projectRoot: workspaceRoot,
    },
  });
}

function createWorkspacePathResolver(workspaceRoot: string): PathResolver {
  return new PathResolver(
    new Map([
      ['WORKSPACE', workspaceRoot],
      ['PROJECT', workspaceRoot],
    ]),
  );
}

function createPromotedGeneratedResourceRef(
  asset: PluginTransferAssetRef,
  result: ContentIngestResult,
): ResourceRef {
  return createGeneratedAssetResourceRef({
    assetId: readGeneratedAssetId(result, asset),
    path: result.contractedPath ?? result.outputPath ?? asset.path,
    mimeType: mimeTypeForAsset(asset),
    scope: 'project',
  });
}

function readGeneratedAssetId(result: ContentIngestResult, asset: PluginTransferAssetRef): string {
  const source = result.source;
  if (source?.kind === 'generated-asset') return source.assetId;
  return assetIdForGeneratedAsset(asset);
}

function assetIdForGeneratedAsset(asset: PluginTransferAssetRef): string {
  const base = asset.name ?? path.basename(asset.path);
  return base.replace(/\.[^.]+$/, '') || 'generated-asset';
}

function mediaDir(asset: PluginTransferAssetRef): string {
  if (asset.mediaType === 'video') return 'video';
  if (asset.mediaType === 'audio') return 'audio';
  if (asset.mediaType === 'model') return 'model';
  return 'image';
}

function mimeTypeForAsset(asset: PluginTransferAssetRef): string | undefined {
  if (asset.mediaType === 'image') return mimeTypeFromExtension(asset.path) ?? 'image/png';
  if (asset.mediaType === 'video') return mimeTypeFromExtension(asset.path) ?? 'video/mp4';
  if (asset.mediaType === 'audio') return mimeTypeFromExtension(asset.path) ?? 'audio/mpeg';
  return mimeTypeFromExtension(asset.path);
}

function mimeTypeFromExtension(assetPath: string): string | undefined {
  const ext = path.extname(assetPath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.ogg') return 'audio/ogg';
  return undefined;
}

function toPluginTransferMediaType(
  value: string | undefined,
): PluginTransferAssetRef['mediaType'] | undefined {
  return value === 'image' || value === 'video' || value === 'audio' || value === 'model'
    ? value
    : undefined;
}

function isPromotableLocalPath(value: string | undefined): value is string {
  if (!value) return false;
  if (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('blob:') ||
    value.startsWith('data:') ||
    value.startsWith('vscode-resource:') ||
    value.startsWith('vscode-webview-resource:')
  ) {
    return false;
  }
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);
}
