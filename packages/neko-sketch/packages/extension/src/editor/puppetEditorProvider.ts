/**
 * Puppet Editor Provider - Custom readonly editor for .inp files
 *
 * Implements VSCode CustomReadonlyEditorProvider to open Inochi2D puppet
 * files (.inp) in the puppet animation editor. Handles binary file loading,
 * engine backend connection, and webview message passing.
 */
import * as vscode from 'vscode';
import { injectLocaleAttribute } from '@neko/shared/vscode/extension';
import { getLogger } from '../utils/logger';

const logger = getLogger('PuppetEditorProvider');

export class PuppetEditorProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = 'neko.puppetEditor';

  private activeWebviewPanel: vscode.WebviewPanel | undefined;
  private enginePort: number | undefined;

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

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'puppet-webview'),
      ],
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

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
   * Ensure engine port is discovered via neko-engine command.
   * Falls back gracefully — puppet webview shows static data without engine.
   */
  private async ensureEnginePort(): Promise<number | undefined> {
    if (this.enginePort) {
      return this.enginePort;
    }

    try {
      const result = await vscode.commands.executeCommand<{ port: number }>(
        'neko.engine.ensureFrameServer',
      );
      if (result) {
        this.enginePort = result.port;
      }
    } catch {
      // Engine extension not installed or not running
    }

    return this.enginePort;
  }

  private async handleWebviewMessage(
    message: { type: string; [key: string]: unknown },
    webviewPanel: vscode.WebviewPanel,
    document: vscode.CustomDocument,
  ): Promise<void> {
    switch (message.type) {
      case 'ready': {
        // Send engine port first if available
        const port = await this.ensureEnginePort();
        if (port) {
          webviewPanel.webview.postMessage({ type: 'enginePort', port });
        }

        // Read binary .inp file and send as base64
        try {
          const fileData = await vscode.workspace.fs.readFile(document.uri);
          const base64 = Buffer.from(fileData).toString('base64');
          webviewPanel.webview.postMessage({ type: 'loadPuppet', data: base64 });
        } catch (err) {
          logger.error(`Failed to read puppet file: ${err}`);
        }
        break;
      }

      case 'requestEnginePort': {
        const port = await this.ensureEnginePort();
        if (port) {
          webviewPanel.webview.postMessage({ type: 'enginePort', port });
        }
        break;
      }

      default:
        break;
    }
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const webviewUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'puppet-webview'),
    );
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html ${injectLocaleAttribute()}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';
             img-src ${webview.cspSource} data: blob:;
             font-src ${webview.cspSource};
             connect-src ws://127.0.0.1:* http://127.0.0.1:*;">
  <link rel="stylesheet" href="${webviewUri}/assets/index.css">
  <title>Puppet Editor</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" type="module" src="${webviewUri}/assets/index.js"></script>
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
