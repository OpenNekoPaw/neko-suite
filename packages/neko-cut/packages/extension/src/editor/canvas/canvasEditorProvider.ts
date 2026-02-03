/**
 * Canvas Editor Provider
 * Provides custom editor for .jvc (JSON Video Canvas) files
 */

import * as vscode from 'vscode';
import * as path from 'path';
import type { CanvasData } from '@neko/shared';
import { DEFAULT_CANVAS_DATA } from '@neko/shared';

export class CanvasEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'uniedit.canvasEditor';

  private activeWebviews: Map<string, vscode.Webview> = new Map();
  private activeWebviewPanels: Map<string, vscode.WebviewPanel> = new Map();
  // Track documents being saved to prevent feedback loops
  private savingDocuments: Set<string> = new Set();

  constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * Get the webview for a specific document URI
   */
  public getWebviewForDocument(documentUri: string): vscode.Webview | null {
    return this.activeWebviews.get(documentUri) || null;
  }

  /**
   * Get the currently active/visible webview
   */
  public getActiveWebview(): vscode.Webview | null {
    for (const [, panel] of this.activeWebviewPanels) {
      if (panel.visible && panel.active) {
        return panel.webview;
      }
    }

    for (const [, panel] of this.activeWebviewPanels) {
      if (panel.visible) {
        return panel.webview;
      }
    }

    for (const [, webview] of this.activeWebviews) {
      return webview;
    }

    return null;
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const docUri = document.uri.toString();
    this.activeWebviews.set(docUri, webviewPanel.webview);
    this.activeWebviewPanels.set(docUri, webviewPanel);

    // Setup webview options
    const localResourceRoots = [
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'canvas'),
    ];

    // Add workspace folders
    if (vscode.workspace.workspaceFolders) {
      localResourceRoots.push(...vscode.workspace.workspaceFolders.map(f => f.uri));
    }

    // Add the .jvc file's directory
    const jvcDir = vscode.Uri.file(path.dirname(document.uri.fsPath));
    if (!localResourceRoots.some(root => root.fsPath === jvcDir.fsPath)) {
      localResourceRoots.push(jvcDir);
    }

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots,
    };

    // Set up the webview HTML content
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    // Send initial data to webview
    const sendDataToWebview = () => {
      const text = document.getText();
      let data: CanvasData;

      try {
        data = text.trim() ? JSON.parse(text) : DEFAULT_CANVAS_DATA;
      } catch {
        data = DEFAULT_CANVAS_DATA;
      }

      webviewPanel.webview.postMessage({
        type: 'update',
        data,
      });
    };

    // Handle messages from the webview
    webviewPanel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'ready':
            sendDataToWebview();
            break;

          case 'save':
            await this.updateDocument(document, message.data);
            break;

          case 'requestFile':
            // Handle file URI requests
            const filePath = message.path;
            const absolutePath = path.isAbsolute(filePath)
              ? filePath
              : path.resolve(path.dirname(document.uri.fsPath), filePath);
            const fileUri = webviewPanel.webview.asWebviewUri(
              vscode.Uri.file(absolutePath)
            );
            webviewPanel.webview.postMessage({
              type: 'fileUri',
              path: filePath,
              uri: fileUri.toString(),
            });
            break;
        }
      },
      undefined,
      this.context.subscriptions
    );

    // Handle document changes from outside
    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(
      (e) => {
        if (e.document.uri.toString() === document.uri.toString()) {
          // Skip if we're the ones saving (prevent feedback loop)
          if (this.savingDocuments.has(docUri)) {
            return;
          }
          sendDataToWebview();
        }
      }
    );

    // Clean up when the webview is disposed
    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
      this.activeWebviews.delete(docUri);
      this.activeWebviewPanels.delete(docUri);
    });
  }

  /**
   * Update the document with new canvas data
   */
  private async updateDocument(
    document: vscode.TextDocument,
    data: CanvasData
  ): Promise<void> {
    const docUri = document.uri.toString();
    const text = JSON.stringify(data, null, 2);

    // Skip if content is the same
    if (document.getText() === text) {
      return;
    }

    // Mark as saving to prevent feedback loop
    this.savingDocuments.add(docUri);

    try {
      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        document.uri,
        new vscode.Range(0, 0, document.lineCount, 0),
        text
      );
      await vscode.workspace.applyEdit(edit);
    } finally {
      // Clear saving flag after a short delay to ensure change event has fired
      setTimeout(() => {
        this.savingDocuments.delete(docUri);
      }, 100);
    }
  }

  /**
   * Generate HTML for the webview
   */
  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'canvas', 'assets', 'canvas.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'canvas', 'assets', 'canvas-style.css')
    );

    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data: blob:; font-src ${webview.cspSource};">
  <link href="${styleUri}" rel="stylesheet">
  <title>Canvas Editor</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  /**
   * Generate a nonce for CSP
   */
  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
