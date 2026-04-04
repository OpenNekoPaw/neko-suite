/**
 * EpubPreviewProvider - CustomReadonlyEditorProvider for EPUB ebooks
 *
 * Renders EPUB using epub.js in webview with chapter navigation and TOC.
 * Tracks open webview panels so the goToChapter command can post navigate messages.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { setupDocumentWebview } from './documentProviderHelper';

export class EpubPreviewProvider implements vscode.CustomReadonlyEditorProvider, vscode.Disposable {
  static readonly viewType = 'neko.epubPreview';

  /** URI fsPath → webview panel */
  private readonly panels = new Map<string, vscode.WebviewPanel>();
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

    webviewPanel.onDidDispose(() => {
      this.panels.delete(key);
      if (this._activeUri?.fsPath === key) this._activeUri = null;
    });

    // Pass the file as a webview URI instead of base64 so epubjs loads
    // chapters on demand — dramatically faster for large manga EPUBs.
    const fileUri = document.uri;
    const fileDir = vscode.Uri.file(path.dirname(fileUri.fsPath));

    await setupDocumentWebview(document, webviewPanel, this._extensionUri, 'epub', {
      extraLocalRoots: [fileDir],
      onMessage: (msg: { type: string; payload: Record<string, unknown> }) => {
        if (msg.type === 'epub:rangeTestResult') {
          const p = msg.payload;
          if (p['error']) {
            vscode.window.showWarningMessage(`[Range probe] fetch failed: ${String(p['error'])}`);
          } else {
            const supported = p['rangeSupported'] ? 'YES ✓' : 'NO ✗';
            vscode.window.showInformationMessage(
              `[Range probe] supported=${supported}  status=${p['status']}  Accept-Ranges=${p['acceptRanges'] ?? '-'}  Content-Range=${p['contentRange'] ?? '-'}  received=${p['receivedBytes']} bytes`,
            );
          }
        }
      },
      onReady: async () => {
        const stat = await fs.stat(fileUri.fsPath).catch(() => null);
        const webviewUri = webviewPanel.webview.asWebviewUri(fileUri);
        await webviewPanel.webview.postMessage({
          type: 'document:data',
          payload: {
            url: webviewUri.toString(),
            fileName: path.basename(fileUri.fsPath),
            fileSize: stat?.size ?? 0,
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
  }
}
