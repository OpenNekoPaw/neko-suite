import * as vscode from 'vscode';

/**
 * Custom editor provider for 3D model files (.gltf, .glb, .vrm)
 */
export class ModelEditorProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = 'neko.modelEditor';

  private activeWebviewPanel: vscode.WebviewPanel | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): vscode.CustomDocument {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    this.activeWebviewPanel = webviewPanel;

    const workspaceFolders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri);

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
        ...workspaceFolders,
      ],
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document.uri);

    webviewPanel.webview.onDidReceiveMessage(
      (msg) => this.handleWebviewMessage(msg, webviewPanel, document),
      undefined,
      this.context.subscriptions,
    );

    webviewPanel.onDidDispose(() => {
      if (this.activeWebviewPanel === webviewPanel) {
        this.activeWebviewPanel = undefined;
      }
    });
  }

  /**
   * Forward keyboard action to active webview
   */
  postKeyboardAction(action: string): void {
    this.activeWebviewPanel?.webview.postMessage({
      type: 'keyboardAction',
      action,
    });
  }

  private async handleWebviewMessage(
    message: { type: string; [key: string]: unknown },
    webviewPanel: vscode.WebviewPanel,
    document: vscode.CustomDocument,
  ): Promise<void> {
    switch (message.type) {
      case 'ready': {
        // Send model file URI to webview
        const modelUri = webviewPanel.webview.asWebviewUri(document.uri);
        webviewPanel.webview.postMessage({
          type: 'loadModel',
          uri: modelUri.toString(),
          filePath: document.uri.fsPath,
        });
        break;
      }
      case 'requestEnginePort': {
        // Get engine port for backend communication
        try {
          const result = await vscode.commands.executeCommand<{ port: number }>(
            'neko.engine.ensureFrameServer',
          );
          if (result) {
            webviewPanel.webview.postMessage({
              type: 'enginePort',
              port: result.port,
            });
          }
        } catch {
          // Engine not available, webview will work in standalone mode
        }
        break;
      }
      default:
        break;
    }
  }

  private getHtmlForWebview(webview: vscode.Webview, documentUri: vscode.Uri): string {
    const webviewDistUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
    );
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';
             img-src ${webview.cspSource} data: blob: https:;
             connect-src ws://127.0.0.1:* http://127.0.0.1:*;">
  <link rel="stylesheet" href="${webviewDistUri}/assets/index.css">
  <title>3D Model Editor</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">window.documentUri = "${documentUri.toString()}";</script>
  <script nonce="${nonce}" type="module" src="${webviewDistUri}/assets/index.js"></script>
</body>
</html>`;
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
