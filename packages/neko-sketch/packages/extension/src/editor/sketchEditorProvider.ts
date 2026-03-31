/**
 * Sketch Editor Provider - Custom editor for .nks files
 *
 * Implements VSCode CustomEditorProvider to open .nks sketch documents
 * in the WebGL-based drawing canvas.
 */
import * as vscode from 'vscode';
import { injectLocaleAttribute } from '@neko/shared/vscode/extension';
import type { LayerOutlineProvider } from '../views/layerOutlineProvider';
import type { SketchStatusBar } from '../views/sketchStatusBar';
import type { NksDocument, LayerOutlineData, SketchStatusInfo } from '../types';
import type { SketchImportContext, SketchSelectionData } from '@neko/shared';
import { getLogger } from '../utils/logger';

const logger = getLogger('SketchEditorProvider');

/** Image file extensions supported for import */
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);

/** Check if a URI points to an importable image file */
function isImageUri(uri: vscode.Uri): boolean {
  const ext = uri.path.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTENSIONS.has(ext);
}

/** Pending promise entry for Extension → Webview request/response round-trips */
interface PendingRequest<T> {
  resolve: (value: T) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class SketchEditorProvider implements vscode.CustomEditorProvider<vscode.CustomDocument> {
  public static readonly viewType = 'neko.sketchEditor';

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<
    vscode.CustomDocumentEditEvent<vscode.CustomDocument>
  >();
  public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  private activeWebviewPanel: vscode.WebviewPanel | undefined;
  private activeDocument: vscode.CustomDocument | undefined;

  // External providers for VSCode integration
  private outlineProvider: LayerOutlineProvider | undefined;
  private statusBar: SketchStatusBar | undefined;

  // Phase 2: import context for round-trip workflow
  private importContext: SketchImportContext | undefined;
  private pendingImport: { base64: string; name: string; context: SketchImportContext } | undefined;

  // Phase 2/3: pending Extension → Webview request/response round-trips
  // Key: requestId, Value: pending promise
  private readonly pendingRequests = new Map<string, PendingRequest<unknown>>();

  constructor(private readonly context: vscode.ExtensionContext) {}

  /** Wire up external providers after construction */
  setProviders(opts: { outline?: LayerOutlineProvider; statusBar?: SketchStatusBar }): void {
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

    webviewPanel.onDidDispose(() => {
      if (this.activeWebviewPanel === webviewPanel) {
        this.activeWebviewPanel = undefined;
        this.activeDocument = undefined;
        this.importContext = undefined;
        this.outlineProvider?.updateData(null);
        this.statusBar?.hide();
        // Reject any pending requests
        for (const [id, pending] of this.pendingRequests) {
          clearTimeout(pending.timer);
          pending.reject(new Error('Sketch editor closed'));
          this.pendingRequests.delete(id);
        }
      }
    });

    this.statusBar?.show();
  }

  async saveCustomDocument(
    _document: vscode.CustomDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    this.activeWebviewPanel?.webview.postMessage({ type: 'document:save' });
  }

  async saveCustomDocumentAs(
    _document: vscode.CustomDocument,
    destination: vscode.Uri,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    this.activeWebviewPanel?.webview.postMessage({
      type: 'document:saveAs',
      path: destination.fsPath,
    });
  }

  async revertCustomDocument(
    _document: vscode.CustomDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    this.activeWebviewPanel?.webview.postMessage({ type: 'document:revert' });
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

  /** Forward keyboard actions to webview */
  postKeyboardAction(action: string): void {
    this.activeWebviewPanel?.webview.postMessage({
      type: 'keyboardAction',
      action,
    });
  }

  /** Inject a base64-encoded image into the active webview as a new layer */
  postImageData(base64: string, name: string): void {
    this.activeWebviewPanel?.webview.postMessage({
      type: 'file:imported',
      name,
      data: base64,
      path: '',
    });
  }

  // ===========================================================================
  // Phase 2: Workflow API
  // ===========================================================================

  /** Whether a sketch editor is currently open and active */
  isActive(): boolean {
    return this.activeWebviewPanel !== undefined;
  }

  /** Return the current import context (source for round-trip "send back" actions) */
  getImportContext(): SketchImportContext | undefined {
    return this.importContext;
  }

  /**
   * Import an image with source context.
   * If an editor is open, injects immediately; otherwise stores as pending
   * and injects once the next editor sends its `ready` message.
   */
  importImageWithContext(base64: string, name: string, context: SketchImportContext): void {
    this.importContext = context;
    this.statusBar?.updateContext(context);
    if (this.activeWebviewPanel) {
      this.postImageData(base64, name);
    } else {
      this.pendingImport = { base64, name, context };
    }
  }

  /**
   * Request the webview to export the current canvas composite as base64 PNG.
   * Returns null if no editor is open or the request times out.
   */
  async requestExport(timeoutMs = 10_000): Promise<string | null> {
    if (!this.activeWebviewPanel) return null;
    try {
      const data = await this.sendRequestToWebview<string | null>(
        'request:exportCanvas',
        {},
        timeoutMs,
      );
      return data;
    } catch {
      return null;
    }
  }

  // ===========================================================================
  // Phase 3: AI Data-Read API
  // ===========================================================================

  async getCanvasImageData(timeoutMs = 10_000): Promise<string | null> {
    if (!this.activeWebviewPanel) return null;
    try {
      return await this.sendRequestToWebview<string | null>(
        'request:canvasImageData',
        {},
        timeoutMs,
      );
    } catch {
      return null;
    }
  }

  async getLayerImageData(layerId?: string, timeoutMs = 10_000): Promise<string | null> {
    if (!this.activeWebviewPanel) return null;
    try {
      return await this.sendRequestToWebview<string | null>(
        'request:layerImageData',
        { layerId },
        timeoutMs,
      );
    } catch {
      return null;
    }
  }

  async getSelectionMask(timeoutMs = 10_000): Promise<SketchSelectionData | null> {
    if (!this.activeWebviewPanel) return null;
    try {
      // Response has same shape as SketchSelectionData
      return await this.sendRequestToWebview<SketchSelectionData | null>(
        'request:selectionMask',
        {},
        timeoutMs,
      );
    } catch {
      return null;
    }
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  /**
   * Send a typed request to the webview and await the matching response.
   * Responses must arrive as `{ type: 'response:*', requestId, data }`.
   */
  private sendRequestToWebview<T>(
    requestType: string,
    extra: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const requestId = `${requestType}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request ${requestType} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });

      this.activeWebviewPanel?.webview.postMessage({ type: requestType, requestId, ...extra });
    });
  }

  /** Resolve a pending request from a webview response message */
  private resolveRequest(requestId: string, data: unknown): void {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingRequests.delete(requestId);
      pending.resolve(data);
    }
  }

  private getHtmlForWebview(webview: vscode.Webview, documentUri: vscode.Uri): string {
    const webviewUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
    );

    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html ${injectLocaleAttribute()}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data: blob:; font-src ${webview.cspSource};">
  <title>Sketch Editor</title>
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
        try {
          const fileData = await vscode.workspace.fs.readFile(document.uri);
          const content = Buffer.from(fileData).toString('utf-8');
          const data = content.trim() ? (JSON.parse(content) as NksDocument) : null;
          webviewPanel.webview.postMessage({ type: 'document:load', data });
          if (data) {
            this.syncOutline(data);
          }
        } catch {
          webviewPanel.webview.postMessage({ type: 'document:load', data: null });
        }
        // Phase 2: inject any pending import after document is loaded
        if (this.pendingImport) {
          const { base64, name } = this.pendingImport;
          this.pendingImport = undefined;
          webviewPanel.webview.postMessage({
            type: 'file:imported',
            name,
            data: base64,
            path: '',
          });
        }
        break;
      }
      case 'document:save': {
        try {
          const data = message.data as Record<string, unknown>;
          const content = JSON.stringify(data, null, 2);
          await vscode.workspace.fs.writeFile(document.uri, Buffer.from(content, 'utf-8'));
          if (data) {
            this.syncOutline(data as unknown as NksDocument);
          }
        } catch (error) {
          logger.error(`Failed to save: ${error}`);
        }
        break;
      }
      case 'status:update': {
        const info = message.data as SketchStatusInfo;
        this.statusBar?.update(info);
        break;
      }
      case 'layer:outline': {
        const outlineData = message.data as LayerOutlineData;
        this.outlineProvider?.updateData(outlineData);
        break;
      }
      case 'operationApplied': {
        // EditOperation sync from webview — fire dirty event
        this._onDidChangeCustomDocument.fire({
          document,
          undo: () => {},
          redo: () => {},
        });
        break;
      }
      case 'file:import': {
        const filters: Record<string, string[]> = {
          Images: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'psd'],
          'All Files': ['*'],
        };
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters,
        });
        if (uris && uris.length > 0) {
          const uri = uris[0];
          if (uri) {
            try {
              const fileData = await vscode.workspace.fs.readFile(uri);
              const base64 = Buffer.from(fileData).toString('base64');
              const name = uri.path.split('/').pop() || 'imported';
              webviewPanel.webview.postMessage({
                type: 'file:imported',
                name,
                data: base64,
                path: uri.fsPath,
              });
            } catch (error) {
              logger.error(`Failed to import file: ${error}`);
            }
          }
        }
        break;
      }
      case 'file:dropRequest': {
        const rawUris = message.uris as string;
        const uriStrings = rawUris.split('\n').filter(Boolean);
        for (const uriStr of uriStrings) {
          const uri = vscode.Uri.parse(uriStr.trim());
          if (isImageUri(uri)) {
            try {
              const fileData = await vscode.workspace.fs.readFile(uri);
              const base64 = Buffer.from(fileData).toString('base64');
              const name = uri.path.split('/').pop() || 'dropped';
              webviewPanel.webview.postMessage({
                type: 'file:imported',
                name,
                data: base64,
                path: uri.fsPath,
              });
            } catch (error) {
              logger.error(`Failed to import dropped file: ${error}`);
            }
            return; // Import the first valid image only
          }
        }
        break;
      }
      case 'file:export': {
        const exportData = message.data as { format: string; data: string };
        const ext = exportData.format || 'png';
        const saveUri = await vscode.window.showSaveDialog({
          filters: { [ext.toUpperCase()]: [ext] },
        });
        if (saveUri) {
          try {
            const buffer = Buffer.from(exportData.data, 'base64');
            await vscode.workspace.fs.writeFile(saveUri, buffer);
            webviewPanel.webview.postMessage({
              type: 'file:exportResult',
              success: true,
              path: saveUri.fsPath,
            });
          } catch (error) {
            logger.error(`Failed to export: ${error}`);
            webviewPanel.webview.postMessage({
              type: 'file:exportResult',
              success: false,
              error: error instanceof Error ? error.message : 'Export failed',
            });
          }
        }
        break;
      }

      // ─── Phase 2/3: webview response messages ───
      case 'response:exportCanvas': {
        this.resolveRequest(message.requestId as string, message.data);
        break;
      }
      case 'response:canvasImageData': {
        this.resolveRequest(message.requestId as string, message.data);
        break;
      }
      case 'response:layerImageData': {
        this.resolveRequest(message.requestId as string, message.data);
        break;
      }
      case 'response:selectionMask': {
        this.resolveRequest(message.requestId as string, message.data);
        break;
      }
    }
  }

  private syncOutline(data: NksDocument): void {
    if (!this.outlineProvider) return;

    const layers = data.layers ?? [];
    const mapLayers = (items: NksDocument['layers']): LayerOutlineData['layers'] =>
      items.map((l: NksDocument['layers'][number]) => ({
        id: l.id,
        name: l.name,
        type: l.type,
        visible: l.visible,
        locked: l.locked,
        children: mapLayers(l.children ?? []),
      }));

    this.outlineProvider.updateData({
      name: 'Sketch',
      layers: mapLayers(layers),
    });
  }
}
