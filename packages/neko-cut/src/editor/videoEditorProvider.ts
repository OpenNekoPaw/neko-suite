/**
 * Video Editor Provider - Custom editor for .jvi files
 */
import * as vscode from 'vscode';
import type {
  TimelineInfo,
  ElementConfig,
  TimelineChangeEvent,
  ElementSelectedEvent,
  PlaybackChangeEvent,
} from '../api';

export class VideoEditorProvider implements vscode.CustomEditorProvider<vscode.CustomDocument> {
  public static readonly viewType = 'neko.videoEditor';

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<vscode.CustomDocument>>();
  public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  // Events for API
  private readonly _onDidChangeTimeline = new vscode.EventEmitter<TimelineChangeEvent>();
  public readonly onDidChangeTimeline = this._onDidChangeTimeline.event;

  private readonly _onDidSelectElement = new vscode.EventEmitter<ElementSelectedEvent>();
  public readonly onDidSelectElement = this._onDidSelectElement.event;

  private readonly _onDidChangePlayback = new vscode.EventEmitter<PlaybackChangeEvent>();
  public readonly onDidChangePlayback = this._onDidChangePlayback.event;

  // Active webview panel
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

    // Handle messages from webview
    webviewPanel.webview.onDidReceiveMessage(
      (message) => this.handleWebviewMessage(message, webviewPanel),
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
    document: vscode.CustomDocument,
    _cancellation: vscode.CancellationToken
  ): Promise<void> {
    // Request save from webview
    this.activeWebviewPanel?.webview.postMessage({ type: 'save' });
  }

  async saveCustomDocumentAs(
    document: vscode.CustomDocument,
    destination: vscode.Uri,
    _cancellation: vscode.CancellationToken
  ): Promise<void> {
    this.activeWebviewPanel?.webview.postMessage({
      type: 'saveAs',
      path: destination.fsPath,
    });
  }

  async revertCustomDocument(
    document: vscode.CustomDocument,
    _cancellation: vscode.CancellationToken
  ): Promise<void> {
    this.activeWebviewPanel?.webview.postMessage({ type: 'revert' });
  }

  async backupCustomDocument(
    document: vscode.CustomDocument,
    context: vscode.CustomDocumentBackupContext,
    _cancellation: vscode.CancellationToken
  ): Promise<vscode.CustomDocumentBackup> {
    return {
      id: context.destination.toString(),
      delete: () => {},
    };
  }

  // API Methods
  async getTimelineInfo(): Promise<TimelineInfo | null> {
    if (!this.activeWebviewPanel) {
      return null;
    }
    return this.sendRequest<TimelineInfo>('getTimelineInfo');
  }

  async addElement(config: ElementConfig): Promise<string> {
    if (!this.activeWebviewPanel) {
      throw new Error('No active editor');
    }
    const result = await this.sendRequest<{ id: string }>('addElement', config);
    this._onDidChangeTimeline.fire({ type: 'add', elementId: result.id });
    return result.id;
  }

  async updateElement(id: string, updates: Partial<ElementConfig>): Promise<void> {
    if (!this.activeWebviewPanel) {
      throw new Error('No active editor');
    }
    await this.sendRequest('updateElement', { id, updates });
    this._onDidChangeTimeline.fire({ type: 'update', elementId: id });
  }

  async deleteElement(id: string): Promise<void> {
    if (!this.activeWebviewPanel) {
      throw new Error('No active editor');
    }
    await this.sendRequest('deleteElement', { id });
    this._onDidChangeTimeline.fire({ type: 'delete', elementId: id });
  }

  async listElements(): Promise<ElementConfig[]> {
    if (!this.activeWebviewPanel) {
      return [];
    }
    return this.sendRequest<ElementConfig[]>('listElements');
  }

  // Private methods
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data: blob:; media-src ${webview.cspSource} data: blob:; font-src ${webview.cspSource};">
  <title>Video Editor</title>
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

  private handleWebviewMessage(message: { type: string; [key: string]: unknown }, panel: vscode.WebviewPanel): void {
    switch (message.type) {
      case 'elementSelected':
        this._onDidSelectElement.fire({
          elementId: message.elementId as string | null,
          element: message.element as ElementConfig | null,
        });
        break;
      case 'playbackChanged':
        this._onDidChangePlayback.fire({
          playing: message.playing as boolean,
          currentTime: message.currentTime as number,
        });
        break;
      case 'timelineChanged':
        this._onDidChangeTimeline.fire({
          type: message.changeType as 'add' | 'update' | 'delete',
          elementId: message.elementId as string | undefined,
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

      // Timeout after 30 seconds
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
