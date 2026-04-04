/**
 * EpubPreviewProvider - CustomReadonlyEditorProvider for EPUB ebooks
 *
 * On ready: registers file with neko-engine → sends directory URL to webview.
 * Webview uses epub.js directory mode to fetch entries on demand via HTTP.
 */

import * as vscode from 'vscode';
import { setupDocumentWebview, getErrorHtml } from './documentProviderHelper';
import { previewFileServer } from './PreviewFileServer';

export class EpubPreviewProvider implements vscode.CustomReadonlyEditorProvider, vscode.Disposable {
  static readonly viewType = 'neko.epubPreview';

  /** URI fsPath → webview panel */
  private readonly panels = new Map<string, vscode.WebviewPanel>();
  /** fsPath → registered token (for cleanup on panel dispose) */
  private readonly tokens = new Map<string, string>();
  private _activeUri: vscode.Uri | null = null;

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
    const key = document.uri.fsPath;
    this.panels.set(key, webviewPanel);

    webviewPanel.onDidChangeViewState((e) => {
      if (e.webviewPanel.active) this._activeUri = document.uri;
    });

    const filePath = document.uri.fsPath;

    webviewPanel.onDidDispose(() => {
      this.panels.delete(key);
      if (this._activeUri?.fsPath === key) this._activeUri = null;
      const token = this.tokens.get(key);
      if (token) {
        this.tokens.delete(key);
        void previewFileServer.unregisterFile(token);
      }
    });

    await setupDocumentWebview(document, webviewPanel, this._extensionUri, 'epub', {
      onReady: async () => {
        try {
          const { url, token } = await previewFileServer.registerEpub(filePath);
          this.tokens.set(key, token);

          await webviewPanel.webview.postMessage({
            type: 'document:data',
            payload: { url },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          webviewPanel.webview.html = getErrorHtml(msg);
        }
      },
      onMessage: (msg) => {
        // EPUB-specific messages handled here if needed
      },
    });
  }

  /** Navigate the active (or specified) EPUB webview to a chapter href. */
  navigateToChapter(href: string, uri?: vscode.Uri): boolean {
    const key = uri?.fsPath ?? this._activeUri?.fsPath;
    if (!key) return false;
    const panel = this.panels.get(key);
    if (!panel) return false;
    void panel.webview.postMessage({ type: 'epub:navigate', payload: { href } });
    return true;
  }

  getActiveUri(): vscode.Uri | null {
    return this._activeUri;
  }

  dispose(): void {
    this.panels.clear();
    this.tokens.clear();
  }
}
