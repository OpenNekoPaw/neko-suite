/**
 * Canvas Editor Provider - Custom editor for .jvc files
 */
import * as vscode from 'vscode';
import type { CanvasChangeEvent, ShapeConfig } from '../api';

export class CanvasEditorProvider implements vscode.CustomEditorProvider<vscode.CustomDocument> {
  public static readonly viewType = 'neko.canvasEditor';

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<vscode.CustomDocument>>();
  public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  private readonly _onDidChangeCanvas = new vscode.EventEmitter<CanvasChangeEvent>();
  public readonly onDidChangeCanvas = this._onDidChangeCanvas.event;

  private activeWebviewPanel: vscode.WebviewPanel | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

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

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
      ],
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document.uri);

    webviewPanel.webview.onDidReceiveMessage(
      (message) => this.handleWebviewMessage(message),
      undefined,
      this.context.subscriptions
    );

    webviewPanel.onDidDispose(() => {
      if (this.activeWebviewPanel === webviewPanel) {
        this.activeWebviewPanel = undefined;
      }
    });
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
    const webviewUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview')
    );

    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data: blob:; font-src ${webview.cspSource};">
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

  private handleWebviewMessage(message: { type: string; [key: string]: unknown }): void {
    switch (message.type) {
      case 'canvasChanged':
        this._onDidChangeCanvas.fire({
          type: message.changeType as 'add' | 'update' | 'delete',
          shapeId: message.shapeId as string | undefined,
        });
        break;
    }
  }

  private requestId = 0;
  private pendingRequests = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

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
        ...data,
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
