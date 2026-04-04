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
  // Documents connect to neko-engine local HTTP file server (127.0.0.1:*)
  // for Range requests. EPUB also needs blob: for epub.js chapter loading.
  const connectSrc = isDocument
    ? entry === 'epub'
      ? `connect-src blob: http://localhost:${devPort} http://127.0.0.1:*;`
      : `connect-src http://localhost:${devPort} http://127.0.0.1:*;`
    : `connect-src ws://localhost:${devPort} ws://127.0.0.1:* http://localhost:${devPort} http://127.0.0.1:*;`;
  const workerSrc = entry === 'pdf' ? `worker-src blob:;` : '';
  const frameSrc = entry === 'epub' ? `frame-src blob: ${devUrl};` : '';
  // epubjs in directory mode loads CSS and fonts from our local HTTP server
  const styleSrc =
    entry === 'epub'
      ? `style-src 'unsafe-inline' blob: ${devUrl} http://127.0.0.1:*;`
      : `style-src 'unsafe-inline' ${devUrl};`;
  const fontSrc =
    entry === 'epub' ? `font-src ${devUrl} http://127.0.0.1:* data:;` : `font-src ${devUrl};`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta http-equiv="Content-Security-Policy" content="
		default-src 'none';
		${connectSrc}
		img-src ${devUrl} data: blob: http://127.0.0.1:*;
		media-src blob:;
		script-src 'nonce-${nonce}' ${devUrl};
		${styleSrc}
		${fontSrc}
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
  // Documents connect to neko-engine local HTTP file server (127.0.0.1:*)
  // for Range requests. EPUB also needs blob: for epub.js chapter loading.
  const connectSrc = isDocument
    ? entry === 'epub'
      ? `connect-src blob: ${webview.cspSource} http://127.0.0.1:*;`
      : `connect-src http://127.0.0.1:*;`
    : `connect-src ws://127.0.0.1:* http://127.0.0.1:*;`;
  // PDF needs worker-src for pdfjs-dist Web Worker
  const workerSrc = entry === 'pdf' ? `worker-src blob: ${webview.cspSource};` : '';
  // EPUB uses iframe for chapter rendering
  const frameSrc = entry === 'epub' ? `frame-src blob: ${webview.cspSource};` : '';
  // epubjs in directory mode loads CSS and fonts from our local HTTP server
  const styleSrc =
    entry === 'epub'
      ? `style-src 'unsafe-inline' blob: ${webview.cspSource} http://127.0.0.1:*;`
      : `style-src 'unsafe-inline' ${webview.cspSource};`;
  const fontSrc =
    entry === 'epub'
      ? `font-src ${webview.cspSource} http://127.0.0.1:* data:;`
      : `font-src ${webview.cspSource};`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta http-equiv="Content-Security-Policy" content="
		default-src 'none';
		${connectSrc}
		img-src ${webview.cspSource} data: blob: http://127.0.0.1:*;
		media-src blob:;
		script-src 'nonce-${nonce}';
		${styleSrc}
		${fontSrc}
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
