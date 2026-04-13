/**
 * Canvas Editor Provider - Custom editor for .nkc files
 *
 * Supports inline media playback by sharing neko-preview's
 * NativeEngine and frame server via NekoPreviewAPI.
 */
import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'path';
import { injectLocaleAttribute } from '@neko/shared/vscode/extension';
import {
  buildStoryboardImportTimelineSyncPayload,
  extractCanvasNodeGenerationLineage,
  inferCanvasDocumentType,
  inferCanvasDroppedAssetKind,
  inferCanvasMediaType,
  inferCanvasModelType,
  loadNkc,
} from '@neko/shared';
import type {
  CanvasDroppedAsset,
  CanvasNode,
  CanvasNodeType,
  CanvasTimelineSyncPayload,
  CanvasStoryboardPayload,
  CreatedCanvasStoryboard,
  NekoStoryAPI,
  NekoStoryScriptIndex,
  ScriptScene,
} from '@neko/shared';
import type { CanvasChangeEvent, ShapeConfig } from '../api';
import type { CanvasOutlineProvider, CanvasOutlineData } from '../views/canvasOutlineProvider';
import type { CanvasStatusBar } from '../views/canvasStatusBar';
import { getLogger } from '../utils/logger';
import { handleError } from '../utils/errorHandler';
import { BatchGenerationScheduler } from '../services/batchGenerationScheduler';

const logger = getLogger('CanvasEditorProvider');

function mapStoryScriptIndexToCanvasScenes(index: NekoStoryScriptIndex | undefined): ScriptScene[] {
  if (!index) {
    return [];
  }

  return Array.from(index.scenes, (scene) => ({
    id: scene.sceneId,
    title: scene.sceneTitle || scene.heading,
    lineStart: scene.line_start,
    lineEnd: scene.line_end,
  }));
}

function mapOperationToCanvasChangeEvent(operation: {
  type?: string;
  payload?: Record<string, unknown>;
}): CanvasChangeEvent {
  const opType = operation.type ?? 'unknown';
  const payload = operation.payload ?? {};
  const payloadNode = payload['node'];
  const payloadGroupNode = payload['groupNode'];
  const nodeId =
    typeof payload['nodeId'] === 'string'
      ? payload['nodeId']
      : typeof payloadNode === 'object' &&
          payloadNode !== null &&
          typeof (payloadNode as { id?: unknown }).id === 'string'
        ? (payloadNode as { id: string }).id
        : typeof payloadGroupNode === 'object' &&
            payloadGroupNode !== null &&
            typeof (payloadGroupNode as { id?: unknown }).id === 'string'
          ? (payloadGroupNode as { id: string }).id
          : undefined;
  const nodeIds = Array.isArray(payload['childIds'])
    ? (payload['childIds'] as unknown[]).filter(
        (value): value is string => typeof value === 'string',
      )
    : nodeId
      ? [nodeId]
      : undefined;

  return {
    type: opType.includes('.add')
      ? 'add'
      : opType.includes('.remove') || opType.includes('.ungroup')
        ? 'delete'
        : 'update',
    nodeId,
    nodeIds,
    entityType: opType.startsWith('canvas.connection')
      ? 'connection'
      : opType.startsWith('canvas.node')
        ? 'node'
        : 'operation',
    reason: 'operationApplied',
    operationType: opType,
  };
}

// NekoPreviewAPI type (matches neko-preview/src/types/api.ts)
interface NekoPreviewAPI {
  readonly isAvailable: boolean;
  readonly port: number | null;
  getStreamWebSocketUrl(streamId: string): string | null;
  probeMedia(filePath: string): Promise<Record<string, unknown>>;
  startPlayback(
    filePath: string,
    mediaInfo: Record<string, unknown>,
    startTime?: number,
    speed?: number,
  ): Promise<{ videoStreamId: string | null; audioStreamId: string | null }>;
  stopStreams(videoStreamId: string | null, audioStreamId: string | null): Promise<void>;
  seekStreams(
    videoStreamId: string | null,
    audioStreamId: string | null,
    time: number,
  ): Promise<void>;
  pauseStreams(videoStreamId: string | null, audioStreamId: string | null): Promise<void>;
  resumeStreams(videoStreamId: string | null, audioStreamId: string | null): Promise<void>;
  setStreamSpeed(
    videoStreamId: string | null,
    audioStreamId: string | null,
    speed: number,
  ): Promise<void>;
  captureFrame(filePath: string, time: number, quality?: number): Promise<string>;
}

export class CanvasEditorProvider implements vscode.CustomEditorProvider<vscode.CustomDocument> {
  public static readonly viewType = 'neko.canvasEditor';

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<
    vscode.CustomDocumentEditEvent<vscode.CustomDocument>
  >();
  public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  private readonly _onDidChangeCanvas = new vscode.EventEmitter<CanvasChangeEvent>();
  public readonly onDidChangeCanvas = this._onDidChangeCanvas.event;

  private readonly _onSelectionChange = new vscode.EventEmitter<CanvasNode[]>();
  public readonly onSelectionChange = this._onSelectionChange.event;

  private activeWebviewPanel: vscode.WebviewPanel | undefined;
  private activeDocument: vscode.CustomDocument | undefined;

  // External providers for VSCode integration
  private outlineProvider: CanvasOutlineProvider | undefined;
  private statusBar: CanvasStatusBar | undefined;

  // Shared neko-preview API for media playback
  private _previewApi: NekoPreviewAPI | null = null;
  // Batch image generation scheduler
  private readonly scheduler = new BatchGenerationScheduler();
  // Track active streams per panel for cleanup
  private _activeStreams = new Map<
    vscode.WebviewPanel,
    { videoStreamId: string | null; audioStreamId: string | null }
  >();

  constructor(private readonly context: vscode.ExtensionContext) {}

  /** Lazily acquire neko-preview API */
  private async getPreviewApi(): Promise<NekoPreviewAPI | null> {
    if (this._previewApi?.isAvailable) return this._previewApi;
    try {
      const ext = vscode.extensions.getExtension('neko.neko-preview');
      if (!ext) {
        logger.warn('neko-preview extension not found');
        return null;
      }
      if (!ext.isActive) {
        await ext.activate();
      }
      this._previewApi = ext.exports as NekoPreviewAPI;
      return this._previewApi?.isAvailable ? this._previewApi : null;
    } catch (error) {
      logger.error(`Failed to get preview API: ${error}`);
      return null;
    }
  }

  /** Wire up external providers after construction */
  setProviders(opts: { outline?: CanvasOutlineProvider; statusBar?: CanvasStatusBar }): void {
    this.outlineProvider = opts.outline;
    this.statusBar = opts.statusBar;
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
    this.activeWebviewPanel = webviewPanel;
    this.activeDocument = document;

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview')],
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document.uri);

    webviewPanel.webview.onDidReceiveMessage(
      (message) => this.handleWebviewMessage(message, webviewPanel, document),
      undefined,
      this.context.subscriptions,
    );

    webviewPanel.onDidDispose(async () => {
      // Stop active media streams for this panel
      const streams = this._activeStreams.get(webviewPanel);
      if (streams) {
        const api = await this.getPreviewApi();
        await api?.stopStreams(streams.videoStreamId, streams.audioStreamId).catch(() => {});
        this._activeStreams.delete(webviewPanel);
      }
      if (this.activeWebviewPanel === webviewPanel) {
        this.activeWebviewPanel = undefined;
        this.activeDocument = undefined;
        // Clear outline and hide status bar when editor closes
        this.outlineProvider?.updateData(null);
        this.statusBar?.hide();
      }
    });

    // Show status bar when canvas editor is opened
    this.statusBar?.show();
  }

  async saveCustomDocument(
    _document: vscode.CustomDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    this.activeWebviewPanel?.webview.postMessage({ type: 'save' });
  }

  async saveCustomDocumentAs(
    _document: vscode.CustomDocument,
    destination: vscode.Uri,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    this.activeWebviewPanel?.webview.postMessage({
      type: 'saveAs',
      path: destination.fsPath,
    });
  }

  async revertCustomDocument(
    _document: vscode.CustomDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    this.activeWebviewPanel?.webview.postMessage({ type: 'revert' });
  }

  async backupCustomDocument(
    _document: vscode.CustomDocument,
    context: vscode.CustomDocumentBackupContext,
    _cancellation: vscode.CancellationToken,
  ): Promise<vscode.CustomDocumentBackup> {
    return {
      id: context.destination.toString(),
      delete: () => {},
    };
  }

  // Keyboard action forwarding
  postKeyboardAction(action: string): void {
    this.activeWebviewPanel?.webview.postMessage({
      type: 'keyboardAction',
      action,
    });
  }

  /**
   * Forward a GeneratedAsset import to the active canvas webview (ADR-5 P0).
   * Returns false if no canvas editor is open.
   */
  postImportAsset(asset: { path?: string; type?: string }): boolean {
    if (!this.activeWebviewPanel) return false;
    this.activeWebviewPanel.webview.postMessage({
      type: 'importGeneratedAsset',
      asset,
    });
    return true;
  }

  /**
   * Update the generatedImage of a shot node and push the change to the webview.
   * Called by the `neko.canvas.updateNodeImage` command when Sketch sends back
   * an edited image via the round-trip workflow.
   */
  postUpdateNodeImage(nodeId: string, imageData: string, cellId?: string): boolean {
    if (!this.activeWebviewPanel) return false;
    this.activeWebviewPanel.webview.postMessage({
      type: 'updateNodeImage',
      nodeId,
      imageData,
      cellId,
    });
    return true;
  }

  // API Methods
  async addShape(shape: ShapeConfig): Promise<string> {
    if (!this.activeWebviewPanel) {
      throw new Error('No active canvas editor');
    }
    const result = await this.sendRequest<{ id: string }>('addShape', shape);
    this._onDidChangeCanvas.fire({ type: 'add', shapeId: result.id });
    return result.id;
  }

  async updateShape(shapeId: string, updates: Partial<ShapeConfig>): Promise<void> {
    if (!this.activeWebviewPanel) {
      throw new Error('No active canvas editor');
    }
    await this.sendRequest('updateShape', { shapeId, updates });
    this._onDidChangeCanvas.fire({ type: 'update', shapeId });
  }

  async deleteShape(shapeId: string): Promise<void> {
    if (!this.activeWebviewPanel) {
      throw new Error('No active canvas editor');
    }
    await this.sendRequest('deleteShape', { shapeId });
    this._onDidChangeCanvas.fire({ type: 'delete', shapeId });
  }

  // ===========================================================================
  // Node API — used by neko-agent Canvas MCP tools
  // ===========================================================================

  async listNodes(type?: CanvasNodeType): Promise<CanvasNode[]> {
    if (!this.activeWebviewPanel) return [];
    const result = await this.sendRequest<{ nodes: CanvasNode[] }>('nodes.list', {
      nodeType: type,
    });
    return result.nodes;
  }

  async getNode(nodeId: string): Promise<CanvasNode | undefined> {
    if (!this.activeWebviewPanel) return undefined;
    const result = await this.sendRequest<{ node: CanvasNode | null }>('nodes.get', { nodeId });
    return result.node ?? undefined;
  }

  async updateNode(nodeId: string, data: Record<string, unknown>): Promise<void> {
    if (!this.activeWebviewPanel) throw new Error('No active canvas editor');
    await this.sendRequest('nodes.update', { nodeId, data });
    this._onDidChangeCanvas.fire({ type: 'update' });
  }

  async createNode(
    type: CanvasNodeType,
    position: { x: number; y: number },
    data: object,
  ): Promise<string> {
    if (!this.activeWebviewPanel) throw new Error('No active canvas editor');
    const result = await this.sendRequest<{ nodeId: string }>('nodes.create', {
      payload: { type, position, data },
    });
    this._onDidChangeCanvas.fire({ type: 'add' });
    return result.nodeId;
  }

  async generateImageForNode(nodeId: string, cellId?: string): Promise<void> {
    const node = await this.getNode(nodeId);
    const lineage = node ? extractCanvasNodeGenerationLineage(node) : { sourceNodeId: nodeId };

    this.scheduler.enqueue({
      nodeId,
      cellId,
      params: {
        prompt: '',
        sourceNodeId: lineage?.sourceNodeId ?? nodeId,
        characterIds: lineage?.characterIds ? [...lineage.characterIds] : undefined,
      },
      onProgress: (status, dataUrl) => {
        this.activeWebviewPanel?.webview.postMessage({
          type: 'generationProgress',
          nodeId,
          cellId,
          status,
          dataUrl,
        });
        if (status === 'done' && dataUrl) {
          void this.pushGeneratedToCut(nodeId, dataUrl);
        }
      },
    });
  }

  async generateBatchForNodes(nodeIds: string[]): Promise<void> {
    for (const nodeId of nodeIds) {
      await this.generateImageForNode(nodeId);
    }
  }

  reportStoryboardImport(payload: CanvasStoryboardPayload, created: CreatedCanvasStoryboard): void {
    const nodeIds = created.scenes.flatMap((scene) => [scene.sceneNodeId, ...scene.shotIds]);
    this._onDidChangeCanvas.fire({
      type: 'update',
      nodeIds,
      documentUri: this.activeDocument?.uri.toString(),
      entityType: 'import',
      reason: 'storyboardImported',
      operationType: 'storyboard.import',
      sourceScriptUri: payload.sourceScriptUri,
      storyboardImport: created,
    });
  }

  /**
   * Save a base64 data URL to workspace .neko/generated/image/ and return a GeneratedImage.
   * ADR-4: writes binary to disk, returns JSON reference only.
   */
  private saveGeneratedImage(
    workspaceDir: string,
    nodeId: string,
    dataUrl: string,
  ): { filePath: string; assetId: string } {
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const ext = dataUrl.startsWith('data:image/png') ? 'png' : 'jpg';
    const dir = path.join(workspaceDir, '.neko', 'generated', 'image');
    fs.mkdirSync(dir, { recursive: true });
    const assetId = crypto.randomUUID();
    const filePath = path.join(dir, `${assetId}.${ext}`);
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    return { filePath, assetId };
  }

  /** If neko-cut is active, import the generated asset into the cut timeline. */
  private async pushGeneratedToCut(nodeId: string, dataUrl: string): Promise<void> {
    const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceDir) return;
    const cutExt = vscode.extensions.getExtension('neko.neko-cut');
    if (!cutExt?.isActive) return;
    try {
      const { filePath } = this.saveGeneratedImage(workspaceDir, nodeId, dataUrl);
      await vscode.commands.executeCommand('neko.cut.importGeneratedClip', { assetPath: filePath });
      logger.info('Auto-pushed generated image to neko-cut', { nodeId, assetPath: filePath });
    } catch (err) {
      logger.warn('Failed to push generated image to neko-cut', { nodeId, err });
    }
  }

  private reportCanvasReady(documentUri: vscode.Uri, data: Record<string, unknown> | null): void {
    const nodeIds = Array.isArray(data?.['nodes'])
      ? (data['nodes'] as unknown[])
          .map((node) => {
            if (typeof node !== 'object' || node === null) {
              return null;
            }
            return typeof (node as { id?: unknown }).id === 'string'
              ? (node as { id: string }).id
              : null;
          })
          .filter((nodeId): nodeId is string => nodeId !== null)
      : [];

    this._onDidChangeCanvas.fire({
      type: 'update',
      nodeIds,
      documentUri: documentUri.toString(),
      entityType: 'operation',
      reason: 'editorReady',
      operationType: 'canvas.editor.ready',
    });
  }

  private getHtmlForWebview(webview: vscode.Webview, documentUri: vscode.Uri): string {
    // Allow loading resources from workspace folders for media files
    const workspaceFolders = vscode.workspace.workspaceFolders || [];
    const localResourceRoots = [
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
      ...workspaceFolders.map((f) => f.uri),
    ];

    webview.options = {
      enableScripts: true,
      localResourceRoots,
    };

    const webviewUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
    );

    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html ${injectLocaleAttribute()}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data: blob: https:; font-src ${webview.cspSource}; media-src ${webview.cspSource} data: blob: https:; connect-src ws://127.0.0.1:* http://127.0.0.1:*;">
  <title>Canvas Editor</title>
  <link rel="stylesheet" href="${webviewUri}/assets/index.css">
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    window.documentUri = "${documentUri.toString()}";
  </script>
  <script nonce="${nonce}" type="module" src="${webviewUri}/assets/index.js"></script>
</body>
</html>`;
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  private async handleWebviewMessage(
    message: { type: string; [key: string]: unknown },
    webviewPanel: vscode.WebviewPanel,
    document: vscode.CustomDocument,
  ): Promise<void> {
    switch (message.type) {
      case 'ready': {
        // Read file content and send to webview
        try {
          const fileData = await vscode.workspace.fs.readFile(document.uri);
          const content = Buffer.from(fileData).toString('utf-8');
          const result = content.trim() ? loadNkc(content) : null;
          const data = result?.data ?? null;
          if (result && !result.validation.valid) {
            logger.warn(
              'NKC validation errors:',
              result.validation.errors.map((e) => `${e.field}: ${e.message}`).join('; '),
            );
          }
          webviewPanel.webview.postMessage({ type: 'update', data });
          // Sync outline & status bar on initial load
          if (data) {
            this.syncOutline(data as Record<string, unknown>);
            this.syncStatusBar(data as Record<string, unknown>);
          }
          this.reportCanvasReady(document.uri, data as Record<string, unknown> | null);
        } catch {
          // File is empty or invalid JSON — send null to use defaults
          webviewPanel.webview.postMessage({ type: 'update', data: null });
          this.reportCanvasReady(document.uri, null);
        }
        break;
      }
      case 'save': {
        // Save canvas data back to file, normalizing asset paths for portability
        try {
          const data = message.data as Record<string, unknown>;
          await this.normalizeCanvasPathsForSave(data, document.uri);
          const content = JSON.stringify(data, null, 2);
          await vscode.workspace.fs.writeFile(document.uri, Buffer.from(content, 'utf-8'));
          // Sync outline & status bar on every save
          this.syncOutline(data);
          this.syncStatusBar(data);
        } catch (error) {
          logger.error(`Failed to save: ${error}`);
        }
        break;
      }
      case 'canvasStatus': {
        // Webview reports status update (selection change, viewport change, etc.)
        const data = message.data as Record<string, unknown>;
        this.syncStatusBar(data);
        this.syncOutline(data);
        break;
      }
      case 'openMediaPreview': {
        // Open video/audio in neko-preview's customEditor
        const assetPath = message.assetPath as string;
        const mediaTypeHint = message.mediaType as string | undefined;
        if (!assetPath) break;

        try {
          // Resolve to filesystem path (handles webview URIs, absolute, and relative paths)
          const fsPath = await this.resolveAssetPath(assetPath, document.uri);
          const fileUri = vscode.Uri.file(fsPath);

          const ext = assetPath.split('.').pop()?.toLowerCase() ?? '';
          const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'ts', 'flv', 'wmv'];
          const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'];

          if (videoExts.includes(ext) || mediaTypeHint === 'video') {
            await vscode.commands.executeCommand('vscode.openWith', fileUri, 'neko.videoPreview');
          } else if (audioExts.includes(ext) || mediaTypeHint === 'audio') {
            await vscode.commands.executeCommand('vscode.openWith', fileUri, 'neko.audioPreview');
          }
        } catch (error) {
          logger.error(`Failed to open media preview: ${error}`);
          void handleError(error instanceof Error ? error : new Error(String(error)), {
            showToUser: true,
          });
        }
        break;
      }
      case 'pickMedia': {
        // Open file picker for media files
        const mediaType = message.mediaType as string;
        const filters: Record<string, string[]> = {};
        switch (mediaType) {
          case 'image':
            filters['Images'] = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
            break;
          case 'video':
            filters['Videos'] = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'];
            break;
          case 'audio':
            filters['Audio'] = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'];
            break;
        }
        filters['All Files'] = ['*'];

        const uris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters,
        });

        if (uris && uris.length > 0) {
          const uri = uris[0];
          // Convert to webview URI so the webview can access the file
          const webviewUri = webviewPanel.webview.asWebviewUri(uri);
          const name = uri.path.split('/').pop() || 'media';
          webviewPanel.webview.postMessage({
            type: 'addMedia',
            mediaType,
            uri: webviewUri.toString(),
            name,
          });
        }
        break;
      }

      case 'pickCanvasDocument': {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: {
            'Neko Canvas': ['nkc'],
            'All Files': ['*'],
          },
        });

        if (uris && uris.length > 0) {
          const uri = uris[0];
          const fileName = uri.path.split('/').pop() || 'canvas.nkc';
          const contractedPath = await this.contractAssetPath(uri.fsPath, document.uri);
          const title = fileName.replace(/\.[^.]+$/, '') || 'Canvas';
          webviewPanel.webview.postMessage({
            type: 'dropAssets',
            assets: [
              {
                kind: 'canvas',
                path: contractedPath,
                name: fileName,
                title,
              },
            ],
          });
        }
        break;
      }

      case 'pickScriptDocument': {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: {
            Scripts: ['fountain', 'nks', 'story'],
            'All Files': ['*'],
          },
        });

        if (uris && uris.length > 0) {
          const uri = uris[0];
          const fileName = uri.path.split('/').pop() || 'script.fountain';
          const contractedPath = await this.contractAssetPath(uri.fsPath, document.uri);
          const title = fileName.replace(/\.[^.]+$/, '') || 'Script';
          webviewPanel.webview.postMessage({
            type: 'dropAssets',
            assets: [
              {
                kind: 'script',
                path: contractedPath,
                name: fileName,
                title,
              },
            ],
          });
        }
        break;
      }

      case 'pickReferenceDocument': {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: {
            Documents: ['pdf', 'docx', 'epub', 'cbz'],
            'All Files': ['*'],
          },
        });

        if (uris && uris.length > 0) {
          const uri = uris[0];
          const fileName = uri.path.split('/').pop() || 'document.pdf';
          const contractedPath = await this.contractAssetPath(uri.fsPath, document.uri);
          const title = fileName.replace(/\.[^.]+$/, '') || 'Document';
          const docType = inferCanvasDocumentType(fileName);
          if (!docType) break;
          webviewPanel.webview.postMessage({
            type: 'dropAssets',
            assets: [
              {
                kind: 'document',
                path: contractedPath,
                name: fileName,
                title,
                docType,
              },
            ],
          });
        }
        break;
      }

      case 'pickModelReference': {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: {
            Models: ['safetensors', 'ckpt', 'pt', 'pth', 'bin'],
            'All Files': ['*'],
          },
        });

        if (uris && uris.length > 0) {
          const uri = uris[0];
          const fileName = uri.path.split('/').pop() || 'model.safetensors';
          const contractedPath = await this.contractAssetPath(uri.fsPath, document.uri);
          const modelName = fileName.replace(/\.[^.]+$/, '') || 'Model';
          const modelType = inferCanvasModelType(fileName);
          if (!modelType) break;
          webviewPanel.webview.postMessage({
            type: 'dropAssets',
            assets: [
              {
                kind: 'model',
                path: contractedPath,
                name: fileName,
                modelName,
                modelType,
                role: 'reference',
              },
            ],
          });
        }
        break;
      }

      case 'canvasChanged':
        this._onDidChangeCanvas.fire({
          type: message.changeType as 'add' | 'update' | 'delete',
          shapeId: message.shapeId as string | undefined,
        });
        break;

      case 'operationApplied':
        // EditOperation sync from webview — fire dirty event
        this._onDidChangeCustomDocument.fire({
          document,
          undo: () => {},
          redo: () => {},
        });
        this._onDidChangeCanvas.fire(
          mapOperationToCanvasChangeEvent(
            message.operation as {
              type?: string;
              payload?: Record<string, unknown>;
            },
          ),
        );
        break;

      // =================================================================
      // Cross-extension drag-and-drop (ADR-5 P1)
      // =================================================================

      case 'dnd:drop': {
        try {
          const payload = await vscode.commands.executeCommand<{
            path: string;
            mediaType: 'image' | 'video' | 'audio';
            name: string;
          } | null>('neko.agent.getDndPayload');

          if (payload) {
            this.postImportAsset({ path: payload.path, type: payload.mediaType });
            await vscode.commands.executeCommand('neko.agent.clearDndPayload');
            logger.info(`DnD drop accepted: ${payload.name}`);
          }
        } catch (error) {
          logger.warn(`DnD drop failed (agent extension may not be installed): ${error}`);
        }
        break;
      }

      // =================================================================
      // Media playback via shared neko-preview API
      // =================================================================

      case 'media:probe': {
        const assetPath = message.assetPath as string;
        logger.debug(`media:probe received, assetPath: ${assetPath}, nodeId: ${message.nodeId}`);
        if (!assetPath) break;
        try {
          const filePath = await this.resolveAssetPath(assetPath, document.uri);
          logger.debug(`Resolved filePath: ${filePath}`);
          const api = await this.getPreviewApi();
          logger.debug(`Preview API available: ${!!api}, isAvailable: ${api?.isAvailable}`);
          if (!api) {
            webviewPanel.webview.postMessage({
              type: 'media:probeResult',
              nodeId: message.nodeId,
              error: 'Preview engine not available',
            });
            break;
          }
          const mediaInfo = await api.probeMedia(filePath);
          logger.debug(`Probe result: ${JSON.stringify(mediaInfo)}`);
          webviewPanel.webview.postMessage({
            type: 'media:probeResult',
            nodeId: message.nodeId,
            mediaInfo,
            port: api.port,
          });
        } catch (error) {
          logger.error(`Probe failed: ${error}`);
          webviewPanel.webview.postMessage({
            type: 'media:probeResult',
            nodeId: message.nodeId,
            error: error instanceof Error ? error.message : 'Probe failed',
          });
        }
        break;
      }

      case 'media:play': {
        const assetPath = message.assetPath as string;
        const mediaInfo = message.mediaInfo as Record<string, unknown>;
        const startTime = (message.startTime as number) ?? 0;
        const speed = (message.speed as number) ?? 1.0;
        if (!assetPath || !mediaInfo) break;
        try {
          const filePath = await this.resolveAssetPath(assetPath, document.uri);
          const api = await this.getPreviewApi();
          if (!api) {
            webviewPanel.webview.postMessage({
              type: 'media:streamReady',
              nodeId: message.nodeId,
              error: 'Preview engine not available',
            });
            break;
          }
          // Stop previous streams for this panel if any
          const prev = this._activeStreams.get(webviewPanel);
          if (prev) {
            await api.stopStreams(prev.videoStreamId, prev.audioStreamId).catch(() => {});
          }
          const result = await api.startPlayback(filePath, mediaInfo, startTime, speed);
          this._activeStreams.set(webviewPanel, result);
          webviewPanel.webview.postMessage({
            type: 'media:streamReady',
            nodeId: message.nodeId,
            videoStreamUrl: result.videoStreamId
              ? api.getStreamWebSocketUrl(result.videoStreamId)
              : null,
            audioStreamUrl: result.audioStreamId
              ? api.getStreamWebSocketUrl(result.audioStreamId)
              : null,
            videoStreamId: result.videoStreamId,
            audioStreamId: result.audioStreamId,
            mediaInfo,
          });
        } catch (error) {
          webviewPanel.webview.postMessage({
            type: 'media:streamReady',
            nodeId: message.nodeId,
            error: error instanceof Error ? error.message : 'Play failed',
          });
        }
        break;
      }

      case 'media:seek': {
        const streams = this._activeStreams.get(webviewPanel);
        if (!streams) break;
        const api = await this.getPreviewApi();
        await api?.seekStreams(
          streams.videoStreamId,
          streams.audioStreamId,
          message.time as number,
        );
        break;
      }

      case 'media:pause': {
        const streams = this._activeStreams.get(webviewPanel);
        if (!streams) break;
        const api = await this.getPreviewApi();
        await api?.pauseStreams(streams.videoStreamId, streams.audioStreamId);
        break;
      }

      case 'media:resume': {
        const streams = this._activeStreams.get(webviewPanel);
        if (!streams) break;
        const api = await this.getPreviewApi();
        await api?.resumeStreams(streams.videoStreamId, streams.audioStreamId);
        break;
      }

      case 'media:stop': {
        const streams = this._activeStreams.get(webviewPanel);
        if (!streams) break;
        const api = await this.getPreviewApi();
        await api?.stopStreams(streams.videoStreamId, streams.audioStreamId);
        this._activeStreams.delete(webviewPanel);
        break;
      }

      case 'media:captureFrame': {
        const assetPath = message.assetPath as string;
        const time = (message.time as number) ?? 0;
        if (!assetPath) break;
        try {
          const filePath = await this.resolveAssetPath(assetPath, document.uri);
          const api = await this.getPreviewApi();
          if (!api) {
            webviewPanel.webview.postMessage({
              type: 'media:captureFrameResult',
              nodeId: message.nodeId,
              error: 'Preview engine not available',
            });
            break;
          }
          const base64 = await api.captureFrame(filePath, time);
          // Ensure it's a proper data URL
          const dataUrl = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
          webviewPanel.webview.postMessage({
            type: 'media:captureFrameResult',
            nodeId: message.nodeId,
            dataUrl,
          });
        } catch (error) {
          webviewPanel.webview.postMessage({
            type: 'media:captureFrameResult',
            nodeId: message.nodeId,
            error: error instanceof Error ? error.message : 'Capture failed',
          });
        }
        break;
      }

      case 'resolveDroppedFiles': {
        // Webview dropped files from VSCode explorer - resolve them into node-ready asset DTOs.
        const droppedUris = message.uris as string[];
        const resolvedAssets: CanvasDroppedAsset[] = [];

        for (const uriStr of droppedUris) {
          try {
            const fileUri = vscode.Uri.parse(uriStr);
            const fileName = fileUri.path.split('/').pop() || 'file';
            const assetKind = inferCanvasDroppedAssetKind(fileName);
            if (!assetKind) continue;

            if (assetKind === 'media') {
              const mediaType = inferCanvasMediaType(fileName);
              if (!mediaType) continue;

              const webviewUri = webviewPanel.webview.asWebviewUri(fileUri);
              resolvedAssets.push({
                kind: 'media',
                path: webviewUri.toString(),
                name: fileName,
                mediaType,
              });
              continue;
            }

            const contractedPath = await this.contractAssetPath(fileUri.fsPath, document.uri);
            const baseName = fileName.replace(/\.[^.]+$/, '');

            if (assetKind === 'script') {
              resolvedAssets.push({
                kind: 'script',
                path: contractedPath,
                name: fileName,
                title: baseName || 'Script',
              });
              continue;
            }

            if (assetKind === 'document') {
              const docType = inferCanvasDocumentType(fileName);
              if (!docType) continue;
              resolvedAssets.push({
                kind: 'document',
                path: contractedPath,
                name: fileName,
                title: baseName || 'Document',
                docType,
              });
              continue;
            }

            if (assetKind === 'canvas') {
              resolvedAssets.push({
                kind: 'canvas',
                path: contractedPath,
                name: fileName,
                title: baseName || 'Canvas',
              });
              continue;
            }

            const modelType = inferCanvasModelType(fileName);
            if (!modelType) continue;
            resolvedAssets.push({
              kind: 'model',
              path: contractedPath,
              name: fileName,
              modelName: baseName || 'Model',
              modelType,
              role: 'reference',
            });
          } catch {
            // Skip invalid URIs
            logger.warn(`Failed to resolve dropped URI: ${uriStr}`);
          }
        }

        if (resolvedAssets.length > 0) {
          webviewPanel.webview.postMessage({
            type: 'dropAssets',
            assets: resolvedAssets,
          });
        }
        break;
      }

      case 'generateForNode': {
        // Delegate image generation to BatchGenerationScheduler → neko-agent
        const nodeId = message.nodeId as string;
        const cellId = message.cellId as string | undefined;
        const rawParams = message.params as Record<string, unknown>;
        if (!nodeId || typeof rawParams['prompt'] !== 'string') break;
        const node = await this.getNode(nodeId);
        const lineage = node ? extractCanvasNodeGenerationLineage(node) : { sourceNodeId: nodeId };
        const params = {
          ...rawParams,
          prompt: rawParams['prompt'],
          sourceNodeId:
            typeof rawParams['sourceNodeId'] === 'string'
              ? rawParams['sourceNodeId']
              : (lineage?.sourceNodeId ?? nodeId),
          characterIds: Array.isArray(rawParams['characterIds'])
            ? rawParams['characterIds'].filter(
                (value): value is string => typeof value === 'string' && value.length > 0,
              )
            : lineage?.characterIds
              ? [...lineage.characterIds]
              : undefined,
        };

        this.scheduler.enqueue({
          nodeId,
          cellId,
          params,
          onProgress: (status: string, dataUrl?: string) => {
            webviewPanel.webview.postMessage({
              type: 'generationProgress',
              nodeId,
              cellId,
              status,
              dataUrl,
            });
          },
        });
        break;
      }

      case 'buildPrompt': {
        // Delegate AutoPrompt to neko-agent's buildPrompt command
        const { nodeId, shotData } = message;
        try {
          const prompt = await vscode.commands.executeCommand<string>(
            'neko.agent.buildPrompt',
            shotData,
          );
          webviewPanel.webview.postMessage({
            type: 'buildPromptResult',
            nodeId,
            prompt: prompt ?? '',
          });
        } catch {
          webviewPanel.webview.postMessage({
            type: 'buildPromptResult',
            nodeId,
            prompt: '',
            error: 'neko-agent not available',
          });
        }
        break;
      }

      case 'getScriptIndex': {
        // Fetch scene TOC from neko-story
        const scriptPath = message.scriptPath as string;
        const requestNodeId = message.nodeId as string;
        const storyExt = vscode.extensions.getExtension<NekoStoryAPI>('neko.neko-story');

        if (!storyExt) {
          webviewPanel.webview.postMessage({
            type: 'scriptIndexResult',
            nodeId: requestNodeId,
            scenes: null,
            error: 'neko-story not available',
          });
          break;
        }

        try {
          const storyApi = storyExt.isActive
            ? storyExt.exports
            : ((await storyExt.activate()) as NekoStoryAPI);
          const resolvedScriptPath = await this.resolveAssetPath(scriptPath, document.uri);
          const index = storyApi.getScriptIndex(resolvedScriptPath);

          webviewPanel.webview.postMessage({
            type: 'scriptIndexResult',
            nodeId: requestNodeId,
            scenes: mapStoryScriptIndexToCanvasScenes(index),
            error: index ? undefined : 'script index unavailable',
          });
        } catch {
          webviewPanel.webview.postMessage({
            type: 'scriptIndexResult',
            nodeId: requestNodeId,
            scenes: null,
            error: 'neko-story not available',
          });
        }
        break;
      }

      case 'openDocument': {
        // Open a document file using VSCode's default handler
        const docPath = message.docPath as string;
        if (!docPath) break;
        try {
          const fsPath = await this.resolveAssetPath(docPath, document.uri);
          await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(fsPath));
        } catch (error) {
          logger.error(`Failed to open document: ${error}`);
          void handleError(error instanceof Error ? error : new Error(String(error)), {
            showToUser: true,
          });
        }
        break;
      }

      case 'checkModelInstalled': {
        // Query neko-market for model installation status
        const modelPath = message.modelPath as string;
        const modelNodeId = message.nodeId as string;
        try {
          const installed = await vscode.commands.executeCommand<boolean>(
            'neko.market.isInstalled',
            modelPath,
          );
          // Webview expects installedVersion: string | null
          // neko.market.isInstalled returns boolean; convert to version string or null
          webviewPanel.webview.postMessage({
            type: 'modelInstalledResult',
            nodeId: modelNodeId,
            installedVersion: installed ? 'installed' : null,
          });
        } catch {
          webviewPanel.webview.postMessage({
            type: 'modelInstalledResult',
            nodeId: modelNodeId,
            installedVersion: null,
          });
        }
        break;
      }

      case 'importToTimeline': {
        // Forward storyboard shots to neko-cut for timeline import
        const { projectName, shots } = message as unknown as {
          projectName: string;
          shots: unknown[];
        };
        try {
          await vscode.commands.executeCommand('neko.cut.importStoryboard', {
            projectName,
            shots,
          });
          const shotIds = shots
            .map((shot) =>
              typeof shot === 'object' &&
              shot !== null &&
              typeof (shot as { id?: unknown }).id === 'string'
                ? (shot as { id: string }).id
                : null,
            )
            .filter((shotId): shotId is string => shotId !== null);
          const importedAt = Date.now();
          const payload: CanvasTimelineSyncPayload = buildStoryboardImportTimelineSyncPayload(
            shotIds,
            projectName,
            importedAt,
          );
          webviewPanel.webview.postMessage({
            type: 'timelineSync',
            payload,
          });
          this._onDidChangeCanvas.fire({
            type: 'update',
            nodeIds: shotIds,
            entityType: 'import',
            reason: 'importToTimeline',
            operationType: 'timeline.import',
          });
        } catch {
          void handleError(
            new Error(
              'neko-cut is not available. Install neko-cut to import storyboard to timeline.',
            ),
            { showToUser: true, severity: 'warning' },
          );
        }
        break;
      }

      case 'exportArtboard': {
        const artboardData = message.data as Record<string, unknown>;
        const artboardName = (artboardData.name as string) || 'Untitled Artboard';
        const safeName = artboardName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim();
        const format = (artboardData.format as string) || 'png';
        const imageData = artboardData.data as string | undefined;

        // 如果 webview 报告导出错误
        if (artboardData.error) {
          void handleError(new Error('Failed to capture artboard'), { showToUser: true });
          break;
        }

        if (!imageData) {
          void handleError(new Error('No image data received'), { showToUser: true });
          break;
        }

        const saveUri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.joinPath(
            vscode.Uri.file(document.uri.fsPath).with({
              path: document.uri.fsPath.replace(/[^/\\]+$/, ''),
            }),
            `${safeName}.${format}`,
          ),
          filters: {
            [format.toUpperCase()]: [format],
            'All Files': ['*'],
          },
        });

        if (saveUri) {
          try {
            const buffer = Buffer.from(imageData, 'base64');
            await vscode.workspace.fs.writeFile(saveUri, buffer);
            vscode.window.showInformationMessage(`Artboard exported: ${saveUri.fsPath}`);
          } catch (error) {
            logger.error(`Failed to export artboard: ${error}`);
            void handleError(error instanceof Error ? error : new Error(String(error)), {
              showToUser: true,
            });
          }
        }
        break;
      }
      case 'sendToAgent':
      case 'sendNodeToAgent': {
        const nodeIds = (message.nodeIds ?? []) as string[];
        const action = message.action as string;
        const intent = (message.intent as string | undefined) ?? undefined;

        if (action === 'generate') {
          // Generate image for the first selected ShotNode via Agent
          const nodeId = nodeIds[0];
          if (nodeId) await this.generateImageForNode(nodeId);
        } else if (action === 'batch') {
          // Batch-generate all selected ShotNodes
          await this.generateBatchForNodes(nodeIds);
        } else {
          // Send selected node as context to the Agent panel
          const nodeId = nodeIds[0];
          if (!nodeId) break;
          const node = await this.getNode(nodeId);
          if (!node) {
            logger.warn(`sendToAgent: node ${nodeId} not found`);
            void handleError(new Error('Cannot send to Agent: node not found'), {
              showToUser: true,
              severity: 'warning',
            });
            break;
          }
          const d = node.data as Record<string, unknown>;
          const payload = {
            type: 'canvas-node' as const,
            id: node.id,
            label:
              node.type === 'shot'
                ? `Shot #${String(d.shotNumber ?? '?').padStart(3, '0')}`
                : ((d.characterName as string | undefined) ?? node.type),
            summary: String(d.visualDescription ?? d.sceneTitle ?? ''),
            data: { nodes: nodeIds },
            intent,
          };
          try {
            await vscode.commands.executeCommand('neko.agent.sendContext', payload);
          } catch (err) {
            logger.error(`sendToAgent failed: ${err}`);
            void handleError(err instanceof Error ? err : new Error(String(err)), {
              showToUser: true,
              severity: 'warning',
            });
          }
        }
        break;
      }

      case 'editInSketch': {
        // Open the ShotNode's generated image in neko-sketch for round-trip editing
        const nodeId = message.nodeId as string;
        const imageDataFromWebview = (message.imageData as string | undefined) ?? null;

        const node = await this.getNode(nodeId);
        if (!node) break;

        const d = node.data as Record<string, unknown>;
        // Prefer the image provided by the webview; fall back to the stored generatedImage
        const raw = imageDataFromWebview ?? (d['generatedImage'] as string | undefined) ?? null;
        if (!raw) {
          void handleError(new Error('No generated image found for this shot node'), {
            showToUser: true,
            severity: 'warning',
          });
          break;
        }
        // Strip data URL prefix if present
        const base64 = raw.startsWith('data:') ? (raw.split(',')[1] ?? raw) : raw;
        const name = `Shot-${String(d['shotNumber'] ?? '').padStart(3, '0')}.png`;

        try {
          await vscode.commands.executeCommand('neko.sketch.editImage', {
            base64,
            name,
            context: {
              source: 'canvas',
              sourceNodeId: nodeId,
              metadata: {
                shotNumber: d['shotNumber'],
                cellId: d['cellId'],
              },
            },
          });
        } catch {
          void handleError(
            new Error('Failed to open image in Sketch — is neko-sketch installed?'),
            { showToUser: true },
          );
        }
        break;
      }

      case 'selectionChange': {
        const nodes = (message.nodes ?? []) as CanvasNode[];
        this._onSelectionChange.fire(nodes);
        this._onDidChangeCanvas.fire({
          type: 'update',
          entityType: 'selection',
          reason: 'selectionChange',
          nodeIds: nodes.map((node) => node.id),
        });
        break;
      }

      case '_response': {
        // Resolve a pending sendRequest() promise from the webview
        const id = message._requestId as number;
        const pending = this.pendingRequests.get(id);
        if (pending) {
          this.pendingRequests.delete(id);
          pending.resolve(message);
        }
        break;
      }
    }
  }

  private requestId = 0;
  private pendingRequests = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  /** Resolve asset path (PathVariable, webview URI, relative, or absolute) to absolute filesystem path */
  private async resolveAssetPath(assetPath: string, documentUri: vscode.Uri): Promise<string> {
    // PathVariable: ${VAR}/rest → absolute
    if (assetPath.startsWith('${')) {
      try {
        const resolved = await vscode.commands.executeCommand<string>(
          'neko.assets.resolvePath',
          assetPath,
        );
        if (resolved) return resolved;
      } catch {
        // neko-assets not active
      }
      return assetPath;
    }
    // Handle webview URIs (https:/file+.vscode-resource.vscode-cdn.net/path/to/file)
    const vscodeResourceMatch = assetPath.match(/vscode-resource\.vscode-cdn\.net(\/.*)/);
    if (vscodeResourceMatch) {
      return decodeURIComponent(vscodeResourceMatch[1]!);
    }
    // Absolute filesystem path
    if (assetPath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(assetPath)) {
      return assetPath;
    }
    // Relative path — resolve against document's directory
    const docDir = vscode.Uri.joinPath(documentUri, '..');
    return vscode.Uri.joinPath(docDir, assetPath).fsPath;
  }

  /** Normalize all media node asset paths in canvas data for portable storage */
  private async normalizeCanvasPathsForSave(
    data: Record<string, unknown>,
    documentUri: vscode.Uri,
  ): Promise<void> {
    const nodes = data['nodes'] as Array<Record<string, unknown>> | undefined;
    if (!nodes) return;

    for (const node of nodes) {
      if (node['type'] !== 'media') continue;
      const nodeData = node['data'] as Record<string, unknown> | undefined;
      if (!nodeData || typeof nodeData['assetPath'] !== 'string') continue;

      const assetPath = nodeData['assetPath'] as string;
      // Resolve to absolute first (handle webview URIs, relative, etc.)
      const absolutePath = await this.resolveAssetPath(assetPath, documentUri);
      // Contract to portable path
      nodeData['assetPath'] = await this.contractAssetPath(absolutePath, documentUri);
    }
  }

  /** Contract absolute path to portable path for storage */
  private async contractAssetPath(absolutePath: string, documentUri: vscode.Uri): Promise<string> {
    // Try PathVariable first (for external paths)
    try {
      const contracted = await vscode.commands.executeCommand<string>(
        'neko.assets.contractPath',
        absolutePath,
      );
      if (contracted && contracted.startsWith('${')) return contracted;
    } catch {
      // neko-assets not active
    }

    // Fallback: relative to document directory
    const docDir = path.dirname(documentUri.fsPath);
    return path.relative(docDir, absolutePath).split(path.sep).join('/');
  }

  // ===========================================================================
  // Data sync helpers for VSCode integration (outline, timeline, status bar)
  // ===========================================================================

  /** Extract outline data from raw canvas JSON and push to outline provider */
  private syncOutline(canvasData: Record<string, unknown>): void {
    if (!this.outlineProvider) return;

    const nodes = (canvasData.nodes ?? []) as Array<Record<string, unknown>>;
    const connections = (canvasData.connections ?? []) as Array<Record<string, unknown>>;

    // Build node label lookup for connection display
    const nodeLabelMap = new Map<string, string>();
    const outlineNodes = nodes.map((n) => {
      const data = (n.data ?? {}) as Record<string, unknown>;
      const type = String(n.type ?? 'unknown');
      let label = 'Untitled';
      let detail: string | undefined;

      switch (type) {
        case 'media': {
          const path = String(data.assetPath ?? '');
          label = path.split('/').pop() || 'Media';
          detail = String(data.mediaType ?? 'media');
          break;
        }
        case 'storyboard':
          label = String(data.title || 'Scene');
          detail = data.description ? String(data.description).slice(0, 40) : undefined;
          break;
        case 'annotation':
          label = String(data.content || 'Note').slice(0, 30) || 'Note';
          detail = 'annotation';
          break;
        case 'group':
          label = String(data.label || 'Group');
          break;
        case 'text':
          label = String(data.content || 'Text').slice(0, 30) || 'Text';
          detail = 'text';
          break;
        case 'artboard':
          label = String(data.title || data.name || 'Artboard');
          detail = data.preset ? String(data.preset) : undefined;
          break;
        case 'shot': {
          const num = String(data.shotNumber ?? '?');
          const scale = data.shotScale ? ` [${String(data.shotScale)}]` : '';
          label = `#${num.padStart(3, '0')}${scale}`;
          detail = data.visualDescription ? String(data.visualDescription).slice(0, 40) : undefined;
          break;
        }
        case 'scene':
          label = String(data.sceneTitle || 'Scene');
          detail = data.location
            ? `${String(data.location)} · ${String(data.timeOfDay ?? '')}`
            : undefined;
          break;
        case 'gallery':
          label = String(data.characterName || '角色画廊');
          detail = data.preset ? String(data.preset) : undefined;
          break;
        case 'script':
          label = String(data.scriptTitle ?? 'Script');
          detail = data.scriptPath ? String(data.scriptPath).split('/').pop() : undefined;
          break;
        case 'document':
          label = String(data.title ?? 'Document');
          detail = data.docType ? String(data.docType).toUpperCase() : undefined;
          break;
        case 'model':
          label = String(data.modelName ?? 'Model');
          detail = data.modelType ? String(data.modelType) : undefined;
          break;
        case 'canvas-embed':
          label = String(data.canvasTitle ?? 'Canvas');
          detail = 'embed';
          break;
      }

      const id = String(n.id ?? '');
      nodeLabelMap.set(id, label);

      return {
        id,
        type,
        label,
        detail,
        locked: Boolean(n.locked),
        ...(type === 'scene' && Array.isArray(data.shotIds)
          ? { shotIds: data.shotIds as string[] }
          : {}),
      };
    });

    const outlineConnections = connections.map((c) => ({
      id: String(c.id ?? ''),
      sourceLabel: nodeLabelMap.get(String(c.sourceId ?? '')) ?? '?',
      targetLabel: nodeLabelMap.get(String(c.targetId ?? '')) ?? '?',
      label: c.label ? String(c.label) : undefined,
    }));

    const outlineData: CanvasOutlineData = {
      name: String(canvasData.name ?? 'Canvas'),
      nodes: outlineNodes,
      connections: outlineConnections,
    };

    this.outlineProvider.updateData(outlineData);
  }

  /** Update VSCode status bar with canvas info */
  private syncStatusBar(canvasData: Record<string, unknown>): void {
    if (!this.statusBar) return;

    const nodes = (canvasData.nodes ?? []) as unknown[];
    const connections = (canvasData.connections ?? []) as unknown[];
    const viewport = (canvasData.viewport ?? { zoom: 1 }) as Record<string, unknown>;
    const selection = (canvasData._selection ?? {}) as Record<string, unknown>;
    const selectedNodeIds = (selection.nodeIds ?? []) as unknown[];

    this.statusBar.update({
      nodeCount: nodes.length,
      connectionCount: connections.length,
      zoom: Number(viewport.zoom ?? 1),
      selectedCount: selectedNodeIds.length,
    });
  }

  private sendRequest<T>(type: string, data?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.activeWebviewPanel) {
        reject(new Error('No active webview'));
        return;
      }

      const id = ++this.requestId;
      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });

      this.activeWebviewPanel.webview.postMessage({
        type,
        _requestId: id,
        ...(data as Record<string, unknown>),
      });

      setTimeout(() => {
        const pending = this.pendingRequests.get(id);
        if (pending) {
          this.pendingRequests.delete(id);
          pending.reject(new Error(`Request timeout: ${type}`));
        }
      }, 30000);
    });
  }
}
