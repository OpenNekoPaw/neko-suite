/**
 * DocxPreviewProvider - CustomReadonlyEditorProvider for DOCX/DOC files
 *
 * On ready: registers file with neko-engine → sends URL to webview.
 * Webview fetches the full file via HTTP, then passes to docx-preview.
 */

import * as vscode from 'vscode';
import {
  setupDocumentWebview,
  getErrorHtml,
  getUnresolvedVariableHtml,
} from './documentProviderHelper';
import { previewFileServer, UnresolvedPathVariableError } from './PreviewFileServer';
import type { StatusBarManager } from '../../ui/StatusBarManager';

export class DocxPreviewProvider implements vscode.CustomReadonlyEditorProvider, vscode.Disposable {
  static readonly viewType = 'neko.docxPreview';

  /** fsPath → registered token (for cleanup on panel dispose) */
  private readonly tokens = new Map<string, string>();

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

    webviewPanel.onDidDispose(() => {
      const token = this.tokens.get(filePath);
      if (token) {
        this.tokens.delete(filePath);
        void previewFileServer.unregisterFile(token);
      }
    });

    await setupDocumentWebview(document, webviewPanel, this._extensionUri, 'docx', {
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
