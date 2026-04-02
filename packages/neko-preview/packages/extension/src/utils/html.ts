/**
 * Webview HTML Generator
 *
 * Generates HTML for video/audio preview webviews.
 * Supports both dev mode (Vite HMR) and production mode (bundled assets).
 */

import * as vscode from 'vscode';
import { getNonce } from './nonce';

/** Supported preview entry points */
export type PreviewEntry = 'video' | 'audio' | 'pdf' | 'cbz' | 'epub' | 'docx';

/** Document entries that do not require engine streaming */
const DOCUMENT_ENTRIES = new Set<PreviewEntry>(['pdf', 'cbz', 'epub', 'docx']);

export interface WebviewHtmlOptions {
  /** Webview instance */
  webview: vscode.Webview;
  /** Extension URI for resolving local resources */
  extensionUri: vscode.Uri;
  /** Entry point */
  entry: PreviewEntry;
  /** Whether to use Vite dev server */
  devMode?: boolean;
  /** Vite dev server port */
  devPort?: number;
}

/**
 * Generate HTML content for the preview webview
 */
export function getWebviewHtml(options: WebviewHtmlOptions): string {
  const { webview, extensionUri, entry, devMode = false, devPort = 5174 } = options;
  const nonce = getNonce();

  if (devMode) {
    return getDevHtml(nonce, entry, devPort);
  }

  return getProdHtml(webview, extensionUri, nonce, entry);
}

/**
 * Dev mode: connect to Vite dev server for HMR
 */
/** Display names for entry types */
const ENTRY_TITLES: Record<PreviewEntry, string> = {
  video: 'Video Preview',
  audio: 'Audio Preview',
  pdf: 'PDF Preview',
  cbz: 'CBZ Preview',
  epub: 'EPUB Preview',
  docx: 'DOCX Preview',
};

function getDevHtml(nonce: string, entry: PreviewEntry, devPort: number): string {
  const devUrl = `http://localhost:${devPort}`;
  const isDocument = DOCUMENT_ENTRIES.has(entry);
  // Documents don't need WebSocket streaming to engine; PDF needs worker-src for pdfjs
  const connectSrc = isDocument
    ? `connect-src http://localhost:${devPort};`
    : `connect-src ws://localhost:${devPort} ws://127.0.0.1:* http://localhost:${devPort} http://127.0.0.1:*;`;
  const workerSrc = entry === 'pdf' ? `worker-src blob:;` : '';
  const frameSrc = entry === 'epub' ? `frame-src blob: ${devUrl};` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta http-equiv="Content-Security-Policy" content="
		default-src 'none';
		${connectSrc}
		img-src ${devUrl} data: blob:;
		media-src blob:;
		script-src 'nonce-${nonce}' ${devUrl};
		style-src 'unsafe-inline' ${devUrl};
		font-src ${devUrl};
		${workerSrc}
		${frameSrc}
	" />
	<title>${ENTRY_TITLES[entry]}</title>
</head>
<body>
	<div id="root"></div>
	<script nonce="${nonce}" type="module" src="${devUrl}/@vite/client"></script>
	<script nonce="${nonce}" type="module" src="${devUrl}/src/${entry}/main.tsx"></script>
</body>
</html>`;
}

/**
 * Production mode: load bundled assets from dist
 */
function getProdHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  nonce: string,
  entry: PreviewEntry,
): string {
  const distUri = vscode.Uri.joinPath(extensionUri, 'dist', 'webview');
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'assets', `${entry}.js`));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'assets', 'style.css'));

  const isDocument = DOCUMENT_ENTRIES.has(entry);
  // Documents don't need WebSocket streaming to engine
  const connectSrc = isDocument ? '' : `connect-src ws://127.0.0.1:* http://127.0.0.1:*;`;
  // PDF needs worker-src for pdfjs-dist Web Worker
  const workerSrc = entry === 'pdf' ? `worker-src blob: ${webview.cspSource};` : '';
  // EPUB uses iframe for chapter rendering
  const frameSrc = entry === 'epub' ? `frame-src blob: ${webview.cspSource};` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta http-equiv="Content-Security-Policy" content="
		default-src 'none';
		${connectSrc}
		img-src ${webview.cspSource} data: blob:;
		media-src blob:;
		script-src 'nonce-${nonce}';
		style-src 'unsafe-inline' ${webview.cspSource};
		font-src ${webview.cspSource};
		${workerSrc}
		${frameSrc}
	" />
	<link rel="stylesheet" href="${styleUri}" />
	<title>${ENTRY_TITLES[entry]}</title>
</head>
<body>
	<div id="root"></div>
	<script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
}
