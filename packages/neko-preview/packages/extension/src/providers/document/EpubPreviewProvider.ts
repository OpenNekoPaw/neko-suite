/**
 * EpubPreviewProvider - CustomReadonlyEditorProvider for EPUB ebooks
 *
 * On ready: registers file with neko-engine → sends directory URL to webview.
 * Webview uses epub.js directory mode to fetch entries on demand via HTTP.
 */

import * as vscode from 'vscode';
import {
  setupDocumentWebview,
  getErrorHtml,
  getUnresolvedVariableHtml,
} from './documentProviderHelper';
import { previewFileServer, UnresolvedPathVariableError } from './PreviewFileServer';
import type { StatusBarManager } from '../../ui/StatusBarManager';
import type { DocumentStatusPayload } from '../../types/document-messages';

export interface EpubActiveLocation {
  uri: vscode.Uri;
  currentPage?: number;
  pageCount?: number;
  chapterHref?: string;
  chapterTitle?: string;
}

export class EpubPreviewProvider implements vscode.CustomReadonlyEditorProvider, vscode.Disposable {
  static readonly viewType = 'neko.epubPreview';

  /** URI fsPath → webview panel */
  private readonly panels = new Map<string, vscode.WebviewPanel>();
  /** fsPath → registered token (for cleanup on panel dispose) */
  private readonly tokens = new Map<string, string>();
  /** fsPath → current reading location */
  private readonly locations = new Map<string, Omit<EpubActiveLocation, 'uri'>>();
  private _activeUri: vscode.Uri | null = null;

  private readonly _onDidChangeActiveEpub = new vscode.EventEmitter<vscode.Uri | null>();
  /** Fires when the active EPUB editor changes (or becomes null). */
  readonly onDidChangeActiveEpub = this._onDidChangeActiveEpub.event;
  private readonly _onDidChangeActiveLocation =
    new vscode.EventEmitter<EpubActiveLocation | null>();
  /** Fires when the active EPUB reading location changes. */
  readonly onDidChangeActiveLocation = this._onDidChangeActiveLocation.event;

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
    const key = document.uri.fsPath;
    this.panels.set(key, webviewPanel);

    const emitActiveLocation = (): void => {
      if (this._activeUri?.fsPath !== key) return;
      this._onDidChangeActiveLocation.fire(this.getActiveLocation());
    };

    webviewPanel.onDidChangeViewState((e) => {
      if (e.webviewPanel.active) {
        this._activeUri = document.uri;
        this._onDidChangeActiveEpub.fire(document.uri);
        emitActiveLocation();
      }
    });

    if (webviewPanel.active) {
      this._activeUri = document.uri;
      this._onDidChangeActiveEpub.fire(document.uri);
    }

    const filePath = document.uri.fsPath;

    webviewPanel.onDidDispose(() => {
      this.panels.delete(key);
      this.locations.delete(key);
      if (this._activeUri?.fsPath === key) {
        this._activeUri = null;
        this._onDidChangeActiveEpub.fire(null);
        this._onDidChangeActiveLocation.fire(null);
      }
      const token = this.tokens.get(key);
      if (token) {
        this.tokens.delete(key);
        void previewFileServer.unregisterFile(token);
      }
    });

    await setupDocumentWebview(document, webviewPanel, this._extensionUri, 'epub', {
      statusBar: this._statusBar,
      context: this._context,
      onReady: async () => {
        try {
          const { url, token } = await previewFileServer.registerEpub(filePath);
          this.tokens.set(key, token);

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
      onStatusUpdate: (payload) => {
        this.updateLocation(document.uri, payload);
        emitActiveLocation();
      },
      onMessage: (_msg) => {
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

  getActiveLocation(): EpubActiveLocation | null {
    const activeUri = this._activeUri;
    if (!activeUri) return null;
    return {
      uri: activeUri,
      ...(this.locations.get(activeUri.fsPath) ?? {}),
    };
  }

  private updateLocation(uri: vscode.Uri, payload: DocumentStatusPayload): void {
    const previous = this.locations.get(uri.fsPath) ?? {};
    this.locations.set(uri.fsPath, {
      currentPage: payload.currentPage ?? previous.currentPage,
      pageCount: payload.pageCount ?? previous.pageCount,
      chapterHref: payload.chapterHref ?? previous.chapterHref,
      chapterTitle: payload.chapterTitle ?? previous.chapterTitle,
    });
  }

  dispose(): void {
    this.panels.clear();
    this.tokens.clear();
    this.locations.clear();
    this._onDidChangeActiveEpub.dispose();
    this._onDidChangeActiveLocation.dispose();
  }
}
