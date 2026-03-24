/**
 * MarketplaceProvider — VSCode WebviewViewProvider for the Marketplace panel.
 *
 * Registers as Activity Bar sidebar view, serves the React webview,
 * and routes market:* messages via MarketplaceHandler.
 */

import * as vscode from 'vscode';
import type { ILogger } from '@neko/shared';
import { MarketplaceService } from './MarketplaceService';
import { MarketplaceHandler } from './MarketplaceHandler';

export class MarketplaceProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'neko.marketplace';

  private _view?: vscode.WebviewView;
  private readonly _handler: MarketplaceHandler;
  private readonly _logger: ILogger;
  private readonly _disposables: vscode.Disposable[] = [];

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _service: MarketplaceService,
    logger: ILogger,
  ) {
    this._logger = logger.child('Provider');
    this._handler = new MarketplaceHandler(_service, this._logger.child('Handler'));
  }

  // ===========================================================================
  // WebviewViewProvider
  // ===========================================================================

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    this._setupMessageHandlers(webviewView.webview);
    this._logger.debug('Webview resolved');
  }

  // ===========================================================================
  // Public API (for commands)
  // ===========================================================================

  /** Send an arbitrary message to the webview */
  public sendMessage(msg: unknown): void {
    this._view?.webview.postMessage(msg);
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  private _setupMessageHandlers(webview: vscode.Webview): void {
    const postMessage = (msg: unknown) => webview.postMessage(msg);

    webview.onDidReceiveMessage(
      async (message: { type: string; [key: string]: unknown }) => {
        await this._handler.handleMessage(message, postMessage);
      },
      undefined,
      this._disposables,
    );
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();
    const locale = vscode.env.language;

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'assets', 'marketplace.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'assets', 'marketplace-style.css'),
    );

    return `<!DOCTYPE html>
<html lang="${locale}" data-vscode-locale="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:; media-src ${webview.cspSource} https: data:;">
  <title>Neko Marketplace</title>
  <link rel="stylesheet" type="text/css" href="${styleUri}">
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  public dispose(): void {
    this._disposables.forEach((d) => d.dispose());
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
