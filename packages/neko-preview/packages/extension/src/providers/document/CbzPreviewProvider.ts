/**
 * CbzPreviewProvider - CustomReadonlyEditorProvider for CBZ comic archives
 *
 * On ready: registers file with neko-engine → sends URL to webview.
 * Webview connects directly to neko-engine via HTTP Range requests.
 */

import * as vscode from 'vscode';
import {
  setupDocumentWebview,
  getErrorHtml,
  getUnresolvedVariableHtml,
} from './documentProviderHelper';
import { previewFileServer, UnresolvedPathVariableError } from './PreviewFileServer';
import type { StatusBarManager } from '../../ui/StatusBarManager';

export class CbzPreviewProvider implements vscode.CustomReadonlyEditorProvider, vscode.Disposable {
  static readonly viewType = 'neko.cbzPreview';

  /** fsPath → registered token (for cleanup on panel dispose) */
  private readonly tokens = new Map<string, string>();
  /** fsPath → webview panel */
  private readonly panels = new Map<string, vscode.WebviewPanel>();
  /** fsPath → pending page navigation */
  private readonly pendingPageNumbers = new Map<string, number>();

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _statusBar?: StatusBarManager,
    private readonly _context?: vscode.ExtensionContext,
  ) {}

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
    const filePath = document.uri.fsPath;
    this.panels.set(filePath, webviewPanel);

    webviewPanel.onDidDispose(() => {
      this.panels.delete(filePath);
      const token = this.tokens.get(filePath);
      if (token) {
        this.tokens.delete(filePath);
        void previewFileServer.unregisterFile(token);
      }
    });

    await setupDocumentWebview(document, webviewPanel, this._extensionUri, 'cbz', {
      statusBar: this._statusBar,
      context: this._context,
      onReady: async () => {
        try {
          const { url, token } = await previewFileServer.registerFile(filePath);
          this.tokens.set(filePath, token);

          await webviewPanel.webview.postMessage({
            type: 'document:data',
            payload: { url },
          });
          this.flushPendingNavigation(filePath);
        } catch (err) {
          if (err instanceof UnresolvedPathVariableError) {
            webviewPanel.webview.html = getUnresolvedVariableHtml(err.variable, err.originalPath);
          } else {
            webviewPanel.webview.html = getErrorHtml(
              err instanceof Error ? err.message : String(err),
            );
          }
        }
      },
    });
  }

  navigateToPage(pageNumber: number, uri: vscode.Uri): boolean {
    const panel = this.panels.get(uri.fsPath);
    if (!panel) {
      this.pendingPageNumbers.set(uri.fsPath, pageNumber);
      return false;
    }
    this.postPageNavigation(panel, pageNumber);
    return true;
  }

  private flushPendingNavigation(filePath: string): void {
    const pageNumber = this.pendingPageNumbers.get(filePath);
    const panel = this.panels.get(filePath);
    if (pageNumber === undefined || !panel) return;
    this.pendingPageNumbers.delete(filePath);
    this.postPageNavigation(panel, pageNumber);
  }

  private postPageNavigation(panel: vscode.WebviewPanel, pageNumber: number): void {
    void panel.webview.postMessage({
      type: 'document:navigate',
      payload: { locator: { kind: 'page', pageNumber, pageIndex: Math.max(0, pageNumber - 1) } },
    });
  }

  dispose(): void {
    this.panels.clear();
    this.pendingPageNumbers.clear();
    this.tokens.clear();
  }
}
