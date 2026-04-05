/**
 * Shared helper for document preview providers.
 *
 * Data flow: Extension Host registers file with neko-engine, sends URL to webview.
 * Webview connects directly to neko-engine via HTTP for file data.
 *
 * Message protocol:
 *   Extension → Webview:
 *     document:data    — { url } for direct HTTP loading
 *     epub:navigate    — chapter navigation
 *   Webview → Extension:
 *     ready            — webview mounted
 *     document:sendToAi — send selection to AI agent
 */

import * as vscode from 'vscode';
import type { AgentContextPayload } from '@neko/shared';
import type { PreviewEntry } from '../../utils/html';
import { getWebviewHtml } from '../../utils/html';
import { getLogger } from '../../utils/logger';
import type { StatusBarManager } from '../../ui/StatusBarManager';
import type { DocumentWebviewMessage } from '../../types/document-messages';

const logger = getLogger('DocumentProvider');

/**
 * Resolve a file path that may contain asset/media library variables.
 *
 * Paths from asset libraries may contain unresolved variables like "${A}/..."
 * which need to be expanded to absolute paths before passing to neko-engine.
 * Always attempts resolution — the command is a no-op for plain absolute paths.
 */
export async function resolveDocumentPath(fsPath: string): Promise<string> {
  try {
    const resolved = await vscode.commands.executeCommand<string>(
      'neko.assets.resolvePath',
      fsPath,
    );
    if (resolved && resolved !== fsPath) {
      logger.info(`Resolved path: ${fsPath} → ${resolved}`);
      return resolved;
    }
  } catch {
    // neko-assets not active — fall through to raw path
  }
  return fsPath;
}

/**
 * Configure a webview panel for document preview and wire up message handling.
 */
export async function setupDocumentWebview(
  document: vscode.CustomDocument,
  webviewPanel: vscode.WebviewPanel,
  extensionUri: vscode.Uri,
  entry: PreviewEntry,
  options?: {
    /** Called when the webview sends 'ready'. */
    onReady?: () => Promise<void>;
    /** Handle additional webview messages not covered by the default switch. */
    onMessage?: (msg: { type: string; payload: Record<string, unknown> }) => void;
    /** StatusBarManager for document info display. */
    statusBar?: StatusBarManager;
  },
): Promise<void> {
  const filePath = document.uri.fsPath;
  const fileName = filePath.split('/').pop() ?? filePath;

  // Configure webview
  webviewPanel.webview.options = {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')],
  };

  // Pin the editor tab
  vscode.commands.executeCommand('workbench.action.pinEditor');

  // Set HTML early
  webviewPanel.webview.html = getWebviewHtml({
    webview: webviewPanel.webview,
    extensionUri,
    entry,
  });

  // Handle messages from webview
  const messageDisposable = webviewPanel.webview.onDidReceiveMessage(
    async (msg: DocumentWebviewMessage | { type: string; payload: Record<string, unknown> }) => {
      const msgType = (msg as { type: string }).type;

      switch (msgType) {
        case 'ready': {
          if (options?.onReady) {
            await options.onReady();
          }
          break;
        }

        // ── Status bar update from webview ─────────────────────────────
        case 'document:statusUpdate': {
          const payload = (msg as { payload: Record<string, unknown> }).payload;
          if (options?.statusBar) {
            const format =
              entry === 'epub'
                ? 'epub'
                : entry === 'cbz'
                  ? 'cbz'
                  : entry === 'docx'
                    ? 'docx'
                    : 'pdf';
            options.statusBar.showDocument({
              fileName,
              format,
              pageCount: payload.pageCount as number | undefined,
              currentPage: payload.currentPage as number | undefined,
              fileSize: payload.fileSize as number | undefined,
              zoom: payload.zoom as number | undefined,
            });
          }
          break;
        }

        // ── Send selection to AI agent ──────────────────────────────────
        case 'document:sendToAi': {
          const { selectedText, pageNumber, chapterTitle, region, contentKind } = (
            msg as DocumentWebviewMessage & { type: 'document:sendToAi' }
          ).payload;
          const label = buildLabel(fileName, pageNumber, chapterTitle);
          const intent = buildIntent(contentKind, selectedText);
          const summary = buildSummary(contentKind, selectedText);
          const payload: AgentContextPayload = {
            type: 'document-selection',
            id: `doc:${filePath}:${pageNumber ?? 0}:${Date.now()}`,
            label,
            summary,
            data: {
              filePath,
              selectedText,
              pageNumber,
              chapterTitle,
              region,
              contentKind,
            },
            intent,
          };
          try {
            await vscode.commands.executeCommand('neko.agent.sendContext', payload);
          } catch {
            logger.warn('neko.agent.sendContext command not available');
            vscode.window.showWarningMessage(
              'AI Agent extension is not available. Please install neko-agent to use this feature.',
            );
          }
          break;
        }

        default: {
          if (options?.onMessage) {
            options.onMessage(msg as { type: string; payload: Record<string, unknown> });
          }
        }
      }
    },
  );

  // Cleanup
  webviewPanel.onDidDispose(() => {
    messageDisposable.dispose();
    options?.statusBar?.hide();
  });
}

/**
 * Register an open command for a document type.
 */
export function registerOpenCommand(
  context: vscode.ExtensionContext,
  commandId: string,
  viewType: string,
  fileFilters: Record<string, string[]>,
  dialogTitle: string,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(commandId, async () => {
      const fileUri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectMany: false,
        filters: fileFilters,
        title: dialogTitle,
      });
      if (fileUri && fileUri.length > 0) {
        await vscode.commands.executeCommand('vscode.openWith', fileUri[0], viewType);
      }
    }),
  );
}

function buildIntent(contentKind: string | undefined, selectedText: string | undefined): string {
  if (contentKind === 'image') return '请分析这个区域：';
  if (selectedText) return '请分析这段内容：';
  return '请分析这个文档：';
}

function buildSummary(contentKind: string | undefined, selectedText: string | undefined): string {
  if (contentKind === 'image') return 'Image region from document';
  return selectedText?.slice(0, 400) ?? 'Document selection';
}

function buildLabel(fileName: string, pageNumber?: number, chapterTitle?: string): string {
  let label = fileName;
  if (pageNumber != null) label += ` p.${pageNumber}`;
  if (chapterTitle) label += ` · ${chapterTitle}`;
  return label;
}

export function getErrorHtml(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    body {
      display: flex; align-items: center; justify-content: center;
      height: 100vh; margin: 0;
      background: var(--vscode-editor-background);
      color: var(--vscode-errorForeground, #f44);
      font-family: var(--vscode-font-family);
      font-size: 14px; text-align: center; padding: 20px;
    }
  </style>
</head>
<body><div><p>${message}</p></div></body>
</html>`;
}

/**
 * Error HTML for unresolved path variables — more descriptive than generic error.
 */
export function getUnresolvedVariableHtml(variable: string, filePath: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    body {
      display: flex; align-items: center; justify-content: center;
      height: 100vh; margin: 0;
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      font-size: 14px; padding: 40px;
    }
    .container { max-width: 520px; text-align: left; }
    .icon { font-size: 32px; margin-bottom: 12px; }
    h2 { margin: 0 0 8px; color: var(--vscode-errorForeground, #f44); font-size: 16px; }
    .path {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px; padding: 8px 12px; margin: 12px 0; border-radius: 4px;
      background: var(--vscode-textBlockQuote-background);
      color: var(--vscode-textBlockQuote-foreground);
      word-break: break-all;
    }
    .var { color: var(--vscode-charts-orange, #e89b17); font-weight: bold; }
    ol { padding-left: 20px; margin: 12px 0; line-height: 1.8; }
    .hint { opacity: 0.7; font-size: 12px; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">&#9888;</div>
    <h2>Media Library Not Configured</h2>
    <p>This file references media library <span class="var">\${${variable}}</span> which is not set up on this machine.</p>
    <div class="path">${filePath.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
    <p>To fix:</p>
    <ol>
      <li>Open <strong>.neko/settings.json</strong> in your project</li>
      <li>Add a media library entry with variable <span class="var">${variable}</span></li>
      <li>Set the path to the directory on this machine</li>
    </ol>
    <div class="hint">Or ensure the neko-assets extension is activated and the media library is configured.</div>
  </div>
</body>
</html>`;
}
