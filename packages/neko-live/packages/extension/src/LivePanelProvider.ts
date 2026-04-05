/**
 * LivePanelProvider — VSCode WebviewViewProvider for the Live Preview panel.
 *
 * Manages VMC receiver lifecycle, routes tracking data to webview,
 * and handles avatar selection commands.
 */

import * as vscode from 'vscode';
import type { ILogger } from '@neko/shared';
import { VmcReceiver } from './vmc/VmcReceiver';

export class LivePanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'neko.livePreview';

  private view?: vscode.WebviewView;
  private vmcReceiver?: VmcReceiver;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly logger: ILogger;

  constructor(
    private readonly extensionUri: vscode.Uri,
    logger: ILogger,
  ) {
    this.logger = logger.child('LivePanel');
  }

  // ─── WebviewViewProvider ────────────────────────────────────────────────

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this.extensionUri,
        ...(vscode.workspace.workspaceFolders?.map((f) => f.uri) ?? []),
      ],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
    this.setupMessageHandlers(webviewView.webview);

    webviewView.onDidDispose(
      () => {
        this.stopVmc();
      },
      null,
      this.disposables,
    );

    this.logger.debug('Webview resolved');
  }

  // ─── Public API (for commands) ──────────────────────────────────────────

  public async selectAvatar(): Promise<void> {
    const result = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectMany: false,
      filters: { 'VRM Models': ['vrm'], '3D Models': ['glb', 'gltf'] },
      title: 'Select Avatar Model',
    });

    if (result?.[0]) {
      const webviewUri = this.view?.webview.asWebviewUri(result[0]);
      if (webviewUri) {
        this.postMessage({ type: 'avatarSelected', uri: webviewUri.toString() });
      }
    }
  }

  public startVmc(): void {
    const port = vscode.workspace.getConfiguration('neko.live').get<number>('vmcPort', 39539);
    this.stopVmc(); // Stop existing receiver if any

    this.vmcReceiver = new VmcReceiver(port, this.logger);

    this.vmcReceiver.on('tracking', (data) => {
      this.postMessage({ type: 'vmcTrackingData', data });
    });

    this.vmcReceiver.on('error', (err) => {
      vscode.window.showErrorMessage(`VMC receiver error: ${err.message}`);
    });

    this.vmcReceiver.on('started', () => {
      this.postMessage({ type: 'trackingStatus', mode: 'vmc', active: true });
    });

    this.vmcReceiver.on('stopped', () => {
      this.postMessage({ type: 'trackingStatus', mode: 'vmc', active: false });
    });

    this.vmcReceiver.start().catch((err: Error) => {
      this.logger.error('Failed to start VMC receiver', err);
      vscode.window.showErrorMessage(`Failed to start VMC on port ${port}: ${err.message}`);
    });
  }

  public stopVmc(): void {
    if (this.vmcReceiver) {
      this.vmcReceiver.stop();
      this.vmcReceiver = undefined;
    }
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private setupMessageHandlers(webview: vscode.Webview): void {
    webview.onDidReceiveMessage(
      async (message: { type: string; [key: string]: unknown }) => {
        switch (message.type) {
          case 'ready':
            this.logger.debug('Webview ready');
            break;

          case 'startVmcReceiver':
            this.startVmc();
            break;

          case 'stopVmcReceiver':
            this.stopVmc();
            break;

          case 'selectAvatar':
            await this.selectAvatar();
            break;

          case 'setTrackingMode': {
            const mode = message.mode as string;
            this.logger.info(`Tracking mode set to: ${mode}`);
            break;
          }

          default:
            this.logger.warn(`Unknown message type: ${message.type}`);
        }
      },
      undefined,
      this.disposables,
    );
  }

  private postMessage(msg: unknown): void {
    this.view?.webview.postMessage(msg);
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();
    const locale = vscode.env.language;

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'assets', 'index.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'assets', 'index.css'),
    );

    return `<!DOCTYPE html>
<html lang="${locale}" data-vscode-locale="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'wasm-unsafe-eval'; img-src ${webview.cspSource} https: data: blob:; media-src ${webview.cspSource} https: data:; connect-src ws://127.0.0.1:* http://127.0.0.1:*; worker-src blob:;">
  <title>Neko Live</title>
  <link rel="stylesheet" type="text/css" href="${styleUri}">
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  public dispose(): void {
    this.stopVmc();
    this.disposables.forEach((d) => d.dispose());
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
