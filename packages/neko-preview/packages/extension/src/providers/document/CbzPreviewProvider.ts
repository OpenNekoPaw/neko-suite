/**
 * CbzPreviewProvider - CustomReadonlyEditorProvider for CBZ comic archives
 *
 * Serves the CBZ file via neko-engine's local HTTP server so zip.js HttpReader
 * can use HTTP Range requests — only the ZIP central directory and individual
 * page images are fetched on demand, without a full-file transfer.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { setupDocumentWebview, getErrorHtml } from './documentProviderHelper';
import { previewFileServer } from './PreviewFileServer';

export class CbzPreviewProvider implements vscode.CustomReadonlyEditorProvider, vscode.Disposable {
  static readonly viewType = 'neko.cbzPreview';

  /** fsPath → registered token (for cleanup on panel dispose) */
  private readonly tokens = new Map<string, string>();

  constructor(private readonly _extensionUri: vscode.Uri) {}

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
    const fileName = path.basename(filePath);

    webviewPanel.onDidDispose(async () => {
      const token = this.tokens.get(filePath);
      if (token) {
        this.tokens.delete(filePath);
        await previewFileServer.unregisterFile(token);
      }
    });

    await setupDocumentWebview(document, webviewPanel, this._extensionUri, 'cbz', {
      onReady: async () => {
        let registration: { url: string; token: string };
        try {
          registration = await previewFileServer.registerFile(filePath);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          webviewPanel.webview.html = getErrorHtml(msg);
          return;
        }

        this.tokens.set(filePath, registration.token);

        await webviewPanel.webview.postMessage({
          type: 'document:data',
          payload: {
            url: registration.url,
            fileName,
            fileSize: 0,
          },
        });
      },
    });
  }

  dispose(): void {
    this.tokens.clear();
  }
}
