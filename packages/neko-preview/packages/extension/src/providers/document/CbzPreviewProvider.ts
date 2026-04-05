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

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _statusBar?: StatusBarManager,
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

    webviewPanel.onDidDispose(() => {
      const token = this.tokens.get(filePath);
      if (token) {
        this.tokens.delete(filePath);
        void previewFileServer.unregisterFile(token);
      }
    });

    await setupDocumentWebview(document, webviewPanel, this._extensionUri, 'cbz', {
      statusBar: this._statusBar,
      onReady: async () => {
        try {
          const { url, token } = await previewFileServer.registerFile(filePath);
          this.tokens.set(filePath, token);

          await webviewPanel.webview.postMessage({
            type: 'document:data',
            payload: { url },
          });
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

  dispose(): void {
    this.tokens.clear();
  }
}
