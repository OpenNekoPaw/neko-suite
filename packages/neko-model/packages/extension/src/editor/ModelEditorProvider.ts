import * as vscode from 'vscode';
import { EngineClient } from '@neko/neko-client';

/**
 * Custom editor provider for 3D model files (.gltf, .glb, .vrm)
 *
 * Manages the lifecycle of:
 * - Webview panel (R3F 3D viewport)
 * - EngineClient connection (Rust backend for scene ECS)
 * - Bidirectional message passing between webview and engine
 */
export class ModelEditorProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = 'neko.modelEditor';

  private activeWebviewPanel: vscode.WebviewPanel | undefined;
  private engineClient: EngineClient | undefined;

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

    // Try to connect to engine backend
    await this.ensureEngineClient();
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

  /**
   * Ensure EngineClient is connected to the Rust backend.
   * Falls back gracefully — webview works standalone (R3F only) without engine.
   */
  private async ensureEngineClient(): Promise<EngineClient | undefined> {
    if (this.engineClient) {
      return this.engineClient;
    }

    try {
      const result = await vscode.commands.executeCommand<{ port: number }>(
        'neko.engine.ensureFrameServer',
      );
      if (result) {
        this.engineClient = new EngineClient(result.port);
      }
    } catch {
      // Engine extension not installed or not running — standalone mode
    }

    return this.engineClient;
  }

  private async handleWebviewMessage(
    message: { type: string; [key: string]: unknown },
    webviewPanel: vscode.WebviewPanel,
    document: vscode.CustomDocument,
  ): Promise<void> {
    switch (message.type) {
      case 'ready': {
        // Send model file URI to webview for R3F direct loading
        const modelUri = webviewPanel.webview.asWebviewUri(document.uri);
        webviewPanel.webview.postMessage({
          type: 'loadModel',
          uri: modelUri.toString(),
          filePath: document.uri.fsPath,
        });

        // Also load in engine backend if available
        await this.loadModelInEngine(document.uri.fsPath, webviewPanel);
        break;
      }

      case 'requestEnginePort': {
        const client = await this.ensureEngineClient();
        if (client) {
          webviewPanel.webview.postMessage({
            type: 'enginePort',
            port: client.port,
          });
        }
        break;
      }

      case 'updateTransform': {
        const client = await this.ensureEngineClient();
        if (!client) break;

        const { nodeId, position, rotation, scale } = message as {
          type: string;
          nodeId: string;
          position: [number, number, number];
          rotation: [number, number, number, number];
          scale: [number, number, number];
        };

        try {
          await client.updateSceneTransform(nodeId, position, rotation, scale);
        } catch (err) {
          this.logError('updateTransform', err);
        }
        break;
      }

      case 'playAnimation': {
        // Animation playback is handled client-side by R3F useAnimations.
        // Engine backend tick is optional for future server-side animation.
        break;
      }

      case 'pauseAnimation':
      case 'stopAnimation': {
        // Handled client-side
        break;
      }

      default:
        break;
    }
  }

  /**
   * Load a model file into the Rust ECS backend and send the snapshot to webview.
   */
  private async loadModelInEngine(
    filePath: string,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    const client = await this.ensureEngineClient();
    if (!client) return;

    try {
      const data = await client.loadModel(filePath);
      webviewPanel.webview.postMessage({
        type: 'sceneSnapshot',
        snapshot: data,
      });
    } catch (err) {
      this.logError('loadModel', err);
    }
  }

  private logError(action: string, err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ModelEditorProvider] ${action} failed: ${msg}`);
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
