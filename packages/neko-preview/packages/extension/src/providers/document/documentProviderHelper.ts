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
import type { DocumentWebviewMessage } from '../../types/document-messages';

const logger = getLogger('DocumentProvider');

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

        // ── Send selection to AI agent ──────────────────────────────────
        case 'document:sendToAi': {
          const { selectedText, pageNumber, chapterTitle, imageDataUrl, images, contentKind } = (
            msg as DocumentWebviewMessage & { type: 'document:sendToAi' }
          ).payload;
          const label = buildLabel(fileName, pageNumber, chapterTitle);
          const intent = buildIntent(contentKind, selectedText);
          const summary = buildSummary(contentKind, selectedText, images?.length);
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
              imageDataUrl,
              images,
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
  if (contentKind === 'mixed') return '请分析以下图文内容：';
  if (contentKind === 'image') return '请分析这些图片：';
  if (contentKind === 'text' || selectedText) return '请分析这段内容：';
  return '请分析这张图片：';
}

function buildSummary(
  contentKind: string | undefined,
  selectedText: string | undefined,
  imageCount: number | undefined,
): string {
  if (contentKind === 'mixed' && selectedText) {
    const textSnippet = selectedText.slice(0, 300);
    return imageCount
      ? `${textSnippet}… (+${imageCount} image${imageCount > 1 ? 's' : ''})`
      : textSnippet;
  }
  if (contentKind === 'image' || (!selectedText && imageCount)) {
    return `${imageCount ?? 0} image${(imageCount ?? 0) > 1 ? 's' : ''} from document`;
  }
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
