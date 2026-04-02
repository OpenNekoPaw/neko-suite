/**
 * CbzPreviewProvider - CustomReadonlyEditorProvider for CBZ comic archives
 *
 * Extracts images from ZIP archive using zip.js in webview.
 * Supports region selection (canvas crop) for AI Vision analysis.
 */

import * as vscode from 'vscode';
import { setupDocumentWebview } from './documentProviderHelper';

export class CbzPreviewProvider implements vscode.CustomReadonlyEditorProvider, vscode.Disposable {
  static readonly viewType = 'neko.cbzPreview';

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
    await setupDocumentWebview(document, webviewPanel, this._extensionUri, 'cbz');
  }

  dispose(): void {}
}
