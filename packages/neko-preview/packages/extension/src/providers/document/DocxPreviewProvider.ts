/**
 * DocxPreviewProvider - CustomReadonlyEditorProvider for DOCX/DOC files
 *
 * Renders DOCX using docx-preview in webview (high-fidelity DOM rendering).
 * Native text selection works directly on rendered DOM elements.
 */

import * as vscode from 'vscode';
import { setupDocumentWebview } from './documentProviderHelper';

export class DocxPreviewProvider implements vscode.CustomReadonlyEditorProvider, vscode.Disposable {
  static readonly viewType = 'neko.docxPreview';

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
    await setupDocumentWebview(document, webviewPanel, this._extensionUri, 'docx');
  }

  dispose(): void {}
}
