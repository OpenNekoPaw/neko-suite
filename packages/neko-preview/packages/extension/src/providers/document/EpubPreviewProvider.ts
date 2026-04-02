/**
 * EpubPreviewProvider - CustomReadonlyEditorProvider for EPUB ebooks
 *
 * Renders EPUB using epub.js in webview with chapter navigation and TOC.
 * Supports text selection for AI analysis via AgentContextPayload.
 */

import * as vscode from 'vscode';
import { setupDocumentWebview } from './documentProviderHelper';

export class EpubPreviewProvider implements vscode.CustomReadonlyEditorProvider, vscode.Disposable {
  static readonly viewType = 'neko.epubPreview';

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
    await setupDocumentWebview(document, webviewPanel, this._extensionUri, 'epub');
  }

  dispose(): void {}
}
