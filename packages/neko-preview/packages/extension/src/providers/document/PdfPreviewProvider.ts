/**
 * PdfPreviewProvider - CustomReadonlyEditorProvider for PDF files
 *
 * Renders PDF using pdfjs-dist in webview with TextLayer for native text selection.
 * Supports sending selected text to AI agent via AgentContextPayload.
 */

import * as vscode from 'vscode';
import { setupDocumentWebview } from './documentProviderHelper';

export class PdfPreviewProvider implements vscode.CustomReadonlyEditorProvider, vscode.Disposable {
  static readonly viewType = 'neko.pdfPreview';

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
    await setupDocumentWebview(document, webviewPanel, this._extensionUri, 'pdf');
  }

  dispose(): void {
    // No shared state to clean up
  }
}
