import * as vscode from 'vscode';
import * as path from 'path';
import type {
  EnvironmentPlacement,
  PanoramaViewState,
  PreviewManifest,
  PreviewProjectionType,
  PreviewVariantRequest,
} from '@neko/shared';
import { PreviewService } from '../services/PreviewService';
import type { StatusBarManager } from '../ui/StatusBarManager';
import { getWebviewHtml } from '../utils/html';
import { getLogger } from '../utils/logger';
import { PANORAMIC_IMAGE_VIEW_TYPE } from '../types/panoramic-api';

const logger = getLogger('PanoramicImagePreview');

export class PanoramicImagePreviewProvider implements vscode.CustomReadonlyEditorProvider {
  static readonly viewType = PANORAMIC_IMAGE_VIEW_TYPE;

  private _previewService: PreviewService | null = null;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _statusBar: StatusBarManager,
  ) {}

  setPreviewService(service: PreviewService): void {
    this._previewService = service;
  }

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): Promise<vscode.CustomDocument> {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview')],
    };

    const filePath = document.uri.fsPath;
    const fileName = basenameForDisplay(filePath);
    this._statusBar.show({ fileName, duration: 0 });

    webviewPanel.webview.html = getWebviewHtml({
      webview: webviewPanel.webview,
      extensionUri: this._extensionUri,
      entry: 'panorama-image',
    });

    const manifestPromise = this.registerManifest(filePath, webviewPanel, fileName);
    let activeManifest: PreviewManifest | null = null;

    const messageDisposable = webviewPanel.webview.onDidReceiveMessage(
      async (message: Record<string, unknown>) => {
        switch (message.type) {
          case 'ready': {
            const manifest = await manifestPromise;
            if (!manifest) return;
            activeManifest = manifest;
            await webviewPanel.webview.postMessage({
              type: 'panorama:init',
              payload: {
                manifest,
                engineBaseUrl: this._previewService?.getPreviewBaseUrl() ?? null,
              },
            });
            break;
          }
          case 'panorama:confirmProjection': {
            const manifest = activeManifest ?? (await manifestPromise);
            if (!manifest) return;
            const projectionType = parseProjectionType(message.projectionType);
            if (!projectionType) return;
            const updated = await this.persistProjectionDecision(
              webviewPanel,
              manifest.assetId,
              projectionType,
            );
            if (updated) activeManifest = updated;
            break;
          }
          case 'panorama:saveDefaultView': {
            const manifest = activeManifest ?? (await manifestPromise);
            if (!manifest) return;
            const viewState = parsePanoramaViewState(message.viewState);
            if (!viewState) return;
            const updated = await this.persistDefaultView(
              webviewPanel,
              manifest.assetId,
              viewState,
            );
            if (updated) activeManifest = updated;
            break;
          }
          case 'panorama:requestVariant': {
            const manifest = activeManifest ?? (await manifestPromise);
            if (!manifest) return;
            const request = parseVariantRequest(message.request);
            if (!request) return;
            await this.requestVariant(webviewPanel, manifest.assetId, request);
            break;
          }
          case 'panorama:sendToModel': {
            const manifest = activeManifest ?? (await manifestPromise);
            if (!manifest) return;
            const viewState = parsePanoramaViewState(message.viewState);
            await this.sendToModel(document.uri, manifest, viewState);
            break;
          }
        }
      },
    );

    const disposePanelResources = async () => {
      messageDisposable.dispose();
      const manifest = activeManifest ?? (await manifestPromise.catch(() => null));
      if (manifest) {
        await this._previewService?.unregisterPreviewAsset(manifest.assetId);
      }
      this._statusBar.hide();
    };

    webviewPanel.onDidDispose(() => {
      void disposePanelResources().catch((error) => {
        logger.error('Failed to dispose panoramic image preview resources:', error);
      });
    });
  }

  private async persistProjectionDecision(
    webviewPanel: vscode.WebviewPanel,
    assetId: string,
    projectionType: PreviewProjectionType,
  ): Promise<PreviewManifest | null> {
    try {
      const manifest = await this._previewService?.updatePreviewAssetMetadata(assetId, {
        projectionType,
      });
      if (!manifest) return null;
      await webviewPanel.webview.postMessage({
        type: 'panorama:init',
        payload: {
          manifest,
          engineBaseUrl: this._previewService?.getPreviewBaseUrl() ?? null,
        },
      });
      return manifest;
    } catch (error) {
      await webviewPanel.webview.postMessage({
        type: 'panorama:error',
        payload: { message: error instanceof Error ? error.message : String(error) },
      });
      return null;
    }
  }

  private async persistDefaultView(
    webviewPanel: vscode.WebviewPanel,
    assetId: string,
    viewState: PanoramaViewState,
  ): Promise<PreviewManifest | null> {
    try {
      const manifest = await this._previewService?.updatePreviewAssetMetadata(assetId, {
        defaultViewState: viewState,
      });
      if (!manifest) return null;
      await webviewPanel.webview.postMessage({
        type: 'panorama:init',
        payload: {
          manifest,
          engineBaseUrl: this._previewService?.getPreviewBaseUrl() ?? null,
        },
      });
      return manifest;
    } catch (error) {
      await webviewPanel.webview.postMessage({
        type: 'panorama:error',
        payload: { message: error instanceof Error ? error.message : String(error) },
      });
      return null;
    }
  }

  private async requestVariant(
    webviewPanel: vscode.WebviewPanel,
    assetId: string,
    request: PreviewVariantRequest,
  ): Promise<void> {
    try {
      const variant = await this._previewService?.requestPreviewVariant(assetId, request);
      if (!variant) return;
      await webviewPanel.webview.postMessage({
        type: 'panorama:variantReady',
        payload: { variant },
      });
    } catch (error) {
      await webviewPanel.webview.postMessage({
        type: 'panorama:error',
        payload: { message: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  private async sendToModel(
    uri: vscode.Uri,
    manifest: PreviewManifest,
    viewState: PanoramaViewState | null,
  ): Promise<void> {
    const placement: EnvironmentPlacement = {
      sourceAssetId: manifest.assetId,
      sourceUri: uri.toString(),
      mode: 'background-and-ibl',
      rotationDeg: 0,
      intensity: 1,
      exposure: viewState?.exposure ?? manifest.defaultViewState?.exposure ?? 0,
      visibleAsBackground: true,
    };
    await vscode.commands.executeCommand('neko.model.useEnvironment', placement);
  }

  dispose(): void {}

  private async registerManifest(
    filePath: string,
    webviewPanel: vscode.WebviewPanel,
    fileName: string,
  ): Promise<PreviewManifest | null> {
    if (!this._previewService) {
      this._previewService = await PreviewService.tryCreate();
    }
    if (!this._previewService?.isAvailable) {
      webviewPanel.webview.html = this.getErrorHtml(
        'Failed to initialize media engine. Please ensure neko-engine is installed.',
      );
      this._statusBar.hide();
      return null;
    }

    try {
      const manifest = await this._previewService.registerPreviewAsset({
        source: filePath,
        kind: 'image',
      });
      this._statusBar.show({
        fileName,
        width: manifest.media.dimensions?.width,
        height: manifest.media.dimensions?.height,
        codec: manifest.media.codec?.imageFormat,
        duration: 0,
      });
      return manifest;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to register panoramic image manifest:', error);
      webviewPanel.webview.html = this.getErrorHtml(`Failed to register preview asset: ${message}`);
      this._statusBar.hide();
      return null;
    }
  }

  private getErrorHtml(message: string): string {
    return `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 20px;">
  <h2>Panoramic Preview Error</h2>
  <p>${escapeHtml(message)}</p>
</body>
</html>`;
  }
}

function parseProjectionType(value: unknown): PreviewProjectionType | null {
  return value === 'equirectangular' || value === 'flat' ? value : null;
}

function parsePanoramaViewState(value: unknown): PanoramaViewState | null {
  if (!isRecord(value)) return null;
  if (value.mode !== 'sphere' && value.mode !== 'flat' && value.mode !== 'little-planet') {
    return null;
  }
  const yawDeg = finiteNumber(value.yawDeg);
  const pitchDeg = finiteNumber(value.pitchDeg);
  const rollDeg = finiteNumber(value.rollDeg);
  const fovDeg = finiteNumber(value.fovDeg);
  const exposure = finiteNumber(value.exposure);
  if (
    yawDeg === null ||
    pitchDeg === null ||
    rollDeg === null ||
    fovDeg === null ||
    exposure === null
  ) {
    return null;
  }
  const toneMapping =
    value.toneMapping === 'none' ||
    value.toneMapping === 'aces' ||
    value.toneMapping === 'reinhard' ||
    value.toneMapping === 'filmic'
      ? value.toneMapping
      : null;
  if (!toneMapping) return null;
  return { mode: value.mode, yawDeg, pitchDeg, rollDeg, fovDeg, exposure, toneMapping };
}

function parseVariantRequest(value: unknown): PreviewVariantRequest | null {
  if (!isRecord(value) || typeof value.role !== 'string') return null;
  const role = value.role;
  if (
    role !== 'thumbnail' &&
    role !== 'fov-crop' &&
    role !== 'screenshot' &&
    role !== 'proxy' &&
    role !== 'tile'
  ) {
    return null;
  }
  const request: PreviewVariantRequest = { role };
  const viewState = parsePanoramaViewState(value.viewState);
  if (viewState) request.viewState = viewState;
  const width = finiteNumber(value.width);
  const height = finiteNumber(value.height);
  const quality = finiteNumber(value.quality);
  if (width !== null) request.width = width;
  if (height !== null) request.height = height;
  if (quality !== null) request.quality = quality;
  if (value.format === 'jpeg' || value.format === 'png' || value.format === 'webp') {
    request.format = value.format;
  }
  return request;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function basenameForDisplay(filePath: string): string {
  return path.basename(filePath.replaceAll('\\', path.sep));
}
