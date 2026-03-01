/**
 * Canvas Editor Provider - Custom editor for .jvc files
 *
 * Supports inline media playback by sharing neko-preview's
 * NativeEngine and frame server via NekoPreviewAPI.
 */
import * as vscode from 'vscode';
import { injectLocaleAttribute } from '@neko/shared/vscode/extension';
import type { CanvasChangeEvent, ShapeConfig } from '../api';
import type { CanvasOutlineProvider, CanvasOutlineData } from '../views/canvasOutlineProvider';
import type { CanvasStatusBar } from '../views/canvasStatusBar';
import { getLogger } from '../utils/logger';

const logger = getLogger('CanvasEditorProvider');

// NekoPreviewAPI type (matches neko-preview/src/types/api.ts)
interface NekoPreviewAPI {
  readonly isAvailable: boolean;
  readonly port: number | null;
  getStreamWebSocketUrl(streamId: string): string | null;
  probeMedia(filePath: string): Promise<Record<string, unknown>>;
  startPlayback(filePath: string, mediaInfo: Record<string, unknown>, startTime?: number, speed?: number): Promise<{ videoStreamId: string | null; audioStreamId: string | null }>;
  stopStreams(videoStreamId: string | null, audioStreamId: string | null): Promise<void>;
  seekStreams(videoStreamId: string | null, audioStreamId: string | null, time: number): Promise<void>;
  pauseStreams(videoStreamId: string | null, audioStreamId: string | null): Promise<void>;
  resumeStreams(videoStreamId: string | null, audioStreamId: string | null): Promise<void>;
  setStreamSpeed(videoStreamId: string | null, audioStreamId: string | null, speed: number): Promise<void>;
  captureFrame(filePath: string, time: number, quality?: number): Promise<string>;
}

export class CanvasEditorProvider implements vscode.CustomEditorProvider<vscode.CustomDocument> {
  public static readonly viewType = 'neko.canvasEditor';

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<vscode.CustomDocument>>();
  public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  private readonly _onDidChangeCanvas = new vscode.EventEmitter<CanvasChangeEvent>();
  public readonly onDidChangeCanvas = this._onDidChangeCanvas.event;

  private activeWebviewPanel: vscode.WebviewPanel | undefined;
  private activeDocument: vscode.CustomDocument | undefined;

  // External providers for VSCode integration
  private outlineProvider: CanvasOutlineProvider | undefined;
  private statusBar: CanvasStatusBar | undefined;

  // Shared neko-preview API for media playback
  private _previewApi: NekoPreviewAPI | null = null;
  // Track active streams per panel for cleanup
  private _activeStreams = new Map<vscode.WebviewPanel, { videoStreamId: string | null; audioStreamId: string | null }>();

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
  setProviders(opts: {
    outline?: CanvasOutlineProvider;
    statusBar?: CanvasStatusBar;
  }): void {
    this.outlineProvider = opts.outline;
    this.statusBar = opts.statusBar;
  }

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<vscode.CustomDocument> {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    this.activeWebviewPanel = webviewPanel;
    this.activeDocument = document;

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
      ],
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document.uri);

    webviewPanel.webview.onDidReceiveMessage(
      (message) => this.handleWebviewMessage(message, webviewPanel, document),
      undefined,
      this.context.subscriptions
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
    _cancellation: vscode.CancellationToken
  ): Promise<void> {
    this.activeWebviewPanel?.webview.postMessage({ type: 'save' });
  }

  async saveCustomDocumentAs(
    _document: vscode.CustomDocument,
    destination: vscode.Uri,
    _cancellation: vscode.CancellationToken
  ): Promise<void> {
    this.activeWebviewPanel?.webview.postMessage({
      type: 'saveAs',
      path: destination.fsPath,
    });
  }

  async revertCustomDocument(
    _document: vscode.CustomDocument,
    _cancellation: vscode.CancellationToken
  ): Promise<void> {
    this.activeWebviewPanel?.webview.postMessage({ type: 'revert' });
  }

  async backupCustomDocument(
    _document: vscode.CustomDocument,
    context: vscode.CustomDocumentBackupContext,
    _cancellation: vscode.CancellationToken
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

  private getHtmlForWebview(webview: vscode.Webview, documentUri: vscode.Uri): string {
    // Allow loading resources from workspace folders for media files
    const workspaceFolders = vscode.workspace.workspaceFolders || [];
    const localResourceRoots = [
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
      ...workspaceFolders.map(f => f.uri),
    ];

    webview.options = {
      enableScripts: true,
      localResourceRoots,
    };

    const webviewUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview')
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
    document: vscode.CustomDocument
  ): Promise<void> {
    switch (message.type) {
      case 'ready': {
        // Read file content and send to webview
        try {
          const fileData = await vscode.workspace.fs.readFile(document.uri);
          const content = Buffer.from(fileData).toString('utf-8');
          const data = content.trim() ? JSON.parse(content) : null;
          webviewPanel.webview.postMessage({ type: 'update', data });
          // Sync outline & status bar on initial load
          if (data) {
            this.syncOutline(data as Record<string, unknown>);
            this.syncStatusBar(data as Record<string, unknown>);
          }
        } catch {
          // File is empty or invalid JSON — send null to use defaults
          webviewPanel.webview.postMessage({ type: 'update', data: null });
        }
        break;
      }
      case 'save': {
        // Save canvas data back to file
        try {
          const data = message.data as Record<string, unknown>;
          const content = JSON.stringify(data, null, 2);
          await vscode.workspace.fs.writeFile(
            document.uri,
            Buffer.from(content, 'utf-8')
          );
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
        break;
      }
      case 'openMediaPreview': {
        // Open video/audio in neko-preview's customEditor
        const assetPath = message.assetPath as string;
        const mediaTypeHint = message.mediaType as string | undefined;
        if (!assetPath) break;

        try {
          // Resolve to filesystem path (handles webview URIs, absolute, and relative paths)
          const fsPath = this.resolveAssetPath(assetPath, document.uri);
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
          vscode.window.showErrorMessage(`Failed to open media preview: ${assetPath}`);
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
      case 'canvasChanged':
        this._onDidChangeCanvas.fire({
          type: message.changeType as 'add' | 'update' | 'delete',
          shapeId: message.shapeId as string | undefined,
        });
        break;

      // =================================================================
      // Media playback via shared neko-preview API
      // =================================================================

      case 'media:probe': {
        const assetPath = message.assetPath as string;
        logger.debug(`media:probe received, assetPath: ${assetPath}, nodeId: ${message.nodeId}`);
        if (!assetPath) break;
        try {
          const filePath = this.resolveAssetPath(assetPath, document.uri);
          logger.debug(`Resolved filePath: ${filePath}`);
          const api = await this.getPreviewApi();
          logger.debug(`Preview API available: ${!!api}, isAvailable: ${api?.isAvailable}`);
          if (!api) {
            webviewPanel.webview.postMessage({ type: 'media:probeResult', nodeId: message.nodeId, error: 'Preview engine not available' });
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
          const filePath = this.resolveAssetPath(assetPath, document.uri);
          const api = await this.getPreviewApi();
          if (!api) {
            webviewPanel.webview.postMessage({ type: 'media:streamReady', nodeId: message.nodeId, error: 'Preview engine not available' });
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
            videoStreamUrl: result.videoStreamId ? api.getStreamWebSocketUrl(result.videoStreamId) : null,
            audioStreamUrl: result.audioStreamId ? api.getStreamWebSocketUrl(result.audioStreamId) : null,
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
        await api?.seekStreams(streams.videoStreamId, streams.audioStreamId, message.time as number);
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
          const filePath = this.resolveAssetPath(assetPath, document.uri);
          const api = await this.getPreviewApi();
          if (!api) {
            webviewPanel.webview.postMessage({ type: 'media:captureFrameResult', nodeId: message.nodeId, error: 'Preview engine not available' });
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
        // Webview dropped files from VSCode explorer - resolve URIs and detect media types
        const droppedUris = message.uris as string[];
        const resolvedFiles: Array<{ uri: string; name: string; mediaType: string }> = [];

        for (const uriStr of droppedUris) {
          try {
            const fileUri = vscode.Uri.parse(uriStr);
            const fileName = fileUri.path.split('/').pop() || 'file';
            const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
            const mediaType = this.detectMediaType(ext);
            if (!mediaType) continue;

            const webviewUri = webviewPanel.webview.asWebviewUri(fileUri);
            resolvedFiles.push({
              uri: webviewUri.toString(),
              name: fileName,
              mediaType,
            });
          } catch {
            // Skip invalid URIs
            logger.warn(`Failed to resolve dropped URI: ${uriStr}`);
          }
        }

        if (resolvedFiles.length > 0) {
          webviewPanel.webview.postMessage({
            type: 'dropMedia',
            files: resolvedFiles,
          });
        }
        break;
      }
    }
  }

  private requestId = 0;
  private pendingRequests = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

  private static readonly MEDIA_EXTENSIONS: Record<string, string> = {
    png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', bmp: 'image', svg: 'image',
    mp4: 'video', mov: 'video', avi: 'video', mkv: 'video', webm: 'video', m4v: 'video',
    mp3: 'audio', wav: 'audio', ogg: 'audio', m4a: 'audio', aac: 'audio', flac: 'audio',
  };

  private detectMediaType(ext: string): string | null {
    return CanvasEditorProvider.MEDIA_EXTENSIONS[ext] ?? null;
  }

  /** Resolve asset path to absolute filesystem path */
  private resolveAssetPath(assetPath: string, documentUri: vscode.Uri): string {
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
          label = String(data.title ?? 'Scene');
          detail = data.description ? String(data.description).slice(0, 40) : undefined;
          break;
        case 'annotation':
          label = String(data.content ?? 'Note').slice(0, 30);
          detail = 'annotation';
          break;
        case 'group':
          label = String(data.label ?? 'Group');
          break;
      }

      const id = String(n.id ?? '');
      nodeLabelMap.set(id, label);

      return {
        id,
        type: type as 'media' | 'storyboard' | 'annotation' | 'group',
        label,
        detail,
        locked: Boolean(n.locked),
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
