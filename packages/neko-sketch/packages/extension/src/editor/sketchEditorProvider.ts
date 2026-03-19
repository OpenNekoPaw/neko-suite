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
import { getLogger } from '../utils/logger';

const logger = getLogger('SketchEditorProvider');

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
        this.outlineProvider?.updateData(null);
        this.statusBar?.hide();
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
    }
  }

  private syncOutline(data: NksDocument): void {
    if (!this.outlineProvider) return;

    const layers = data.layers ?? [];
    const mapLayers = (items: NksDocument['layers']): LayerOutlineData['layers'] =>
      items.map((l) => ({
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
