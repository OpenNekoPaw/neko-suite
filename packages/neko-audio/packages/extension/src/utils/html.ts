/**
 * Webview HTML Generator for Audio Editor
 *
 * Generates HTML for audio editor webview.
 * Supports both dev mode (Vite HMR) and production mode (bundled assets).
 */

import * as vscode from 'vscode';
import { getNonce } from './nonce';

export interface WebviewHtmlOptions {
  /** Webview instance */
  webview: vscode.Webview;
  /** Extension URI for resolving local resources */
  extensionUri: vscode.Uri;
  /** Whether to use Vite dev server */
  devMode?: boolean;
  /** Vite dev server port */
  devPort?: number;
}

/**
 * Generate HTML content for the audio editor webview
 */
export function getWebviewHtml(options: WebviewHtmlOptions): string {
  const { webview, extensionUri, devMode = false, devPort = 5175 } = options;
  const nonce = getNonce();

  if (devMode) {
    return getDevHtml(nonce, devPort);
  }

  return getProdHtml(webview, extensionUri, nonce);
}

/**
 * Dev mode: connect to Vite dev server for HMR
 */
function getDevHtml(nonce: string, devPort: number): string {
  const devUrl = `http://localhost:${devPort}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta http-equiv="Content-Security-Policy" content="
		default-src 'none';
		connect-src ws://localhost:${devPort} ws://127.0.0.1:* http://localhost:${devPort} http://127.0.0.1:*;
		img-src ${devUrl} data: blob:;
		media-src blob: mediastream:;
		script-src 'nonce-${nonce}' ${devUrl};
		style-src 'unsafe-inline' ${devUrl};
		font-src ${devUrl};
	" />
	<title>Audio Editor</title>
</head>
<body>
	<div id="root"></div>
	<script nonce="${nonce}" type="module" src="${devUrl}/@vite/client"></script>
	<script nonce="${nonce}" type="module" src="${devUrl}/src/editor/main.tsx"></script>
</body>
</html>`;
}

/**
 * Production mode: load bundled assets from dist
 */
function getProdHtml(webview: vscode.Webview, extensionUri: vscode.Uri, nonce: string): string {
  const distUri = vscode.Uri.joinPath(extensionUri, 'dist', 'webview');
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'assets', 'editor.js'));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'assets', 'style.css'));

  return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta http-equiv="Content-Security-Policy" content="
		default-src 'none';
		connect-src ws://127.0.0.1:* http://127.0.0.1:*;
		img-src ${webview.cspSource} data: blob:;
		media-src blob: mediastream:;
		script-src 'nonce-${nonce}';
		style-src 'unsafe-inline' ${webview.cspSource};
		font-src ${webview.cspSource};
	" />
	<link rel="stylesheet" href="${styleUri}" />
	<title>Audio Editor</title>
</head>
<body>
	<div id="root"></div>
	<script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
}
