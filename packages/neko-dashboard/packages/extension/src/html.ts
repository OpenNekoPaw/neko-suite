import * as vscode from 'vscode';
import { getNonce } from './nonce';

export interface DashboardHtmlOptions {
  readonly webview: vscode.Webview;
  readonly extensionUri: vscode.Uri;
}

export function getDashboardHtml(options: DashboardHtmlOptions): string {
  const { webview, extensionUri } = options;
  const nonce = getNonce();
  const distUri = vscode.Uri.joinPath(extensionUri, 'dist', 'webview');
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'assets', 'index.js'));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'assets', 'index.css'));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    img-src ${webview.cspSource} data:;
    script-src 'nonce-${nonce}';
    style-src 'unsafe-inline' ${webview.cspSource};
    font-src ${webview.cspSource};
  " />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Neko Dashboard</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
}
