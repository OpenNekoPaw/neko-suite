/**
 * EpubPreviewProvider - CustomReadonlyEditorProvider for EPUB ebooks
 *
 * Renders EPUB using epub.js in webview with chapter navigation and TOC.
 * Serves the file via neko-engine's local HTTP server (same as PDF/CBZ) so
 * the webview can fetch it directly over localhost without vscode-webview://
 * protocol overhead. Tracks open webview panels so the goToChapter command
 * can post navigate messages.
 */

import * as vscode from 'vscode';
import * as path from 'path';
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

    webviewPanel.onDidDispose(async () => {
      this.panels.delete(key);
      if (this._activeUri?.fsPath === key) this._activeUri = null;
      const token = this.tokens.get(key);
      if (token) {
        this.tokens.delete(key);
        await previewFileServer.unregisterFile(token);
      }
    });

    const filePath = document.uri.fsPath;
    const fileName = path.basename(filePath);

    await setupDocumentWebview(document, webviewPanel, this._extensionUri, 'epub', {
      onReady: async () => {
        let registration: { url: string; token: string };
        try {
          registration = await previewFileServer.registerEpub(filePath);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          webviewPanel.webview.html = getErrorHtml(msg);
          return;
        }

        this.tokens.set(key, registration.token);

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
