/**
 * Shared helper for document preview providers.
 *
 * Encapsulates the common pattern:
 * - Read file as base64 and send to webview
 * - Handle 'document:sendToAi' by building AgentContextPayload
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import type { AgentContextPayload } from '@neko/shared';
import type { PreviewEntry } from '../../utils/html';
import { getWebviewHtml } from '../../utils/html';
import { getLogger } from '../../utils/logger';
import type { DocumentWebviewMessage } from '../../types/document-messages';

const logger = getLogger('DocumentProvider');

export interface DocumentProviderOptions {
  /** The viewType string, e.g. 'neko.pdfPreview' */
  viewType: string;
  /** The webview entry point name */
  entry: PreviewEntry;
  /** File extension filters for open dialog */
  fileFilters: Record<string, string[]>;
  /** Dialog title */
  dialogTitle: string;
}

/**
 * Configure a webview panel for document preview and wire up message handling.
 *
 * @param onReady  Optional override for how document data is sent on 'ready'.
 *                 Defaults to reading the file as base64.
 * @param extraLocalRoots  Additional directories to add to localResourceRoots
 *                         (e.g. the EPUB file's parent for direct URL access).
 */
export async function setupDocumentWebview(
  document: vscode.CustomDocument,
  webviewPanel: vscode.WebviewPanel,
  extensionUri: vscode.Uri,
  entry: PreviewEntry,
  options?: {
    onReady?: () => Promise<void>;
    extraLocalRoots?: vscode.Uri[];
    /** Handle additional webview messages not covered by the default switch. */
    onMessage?: (msg: { type: string; payload: Record<string, unknown> }) => void;
  },
): Promise<void> {
  const filePath = document.uri.fsPath;
  const fileName = filePath.split('/').pop() ?? filePath;

  // Configure webview
  webviewPanel.webview.options = {
    enableScripts: true,
    localResourceRoots: [
      vscode.Uri.joinPath(extensionUri, 'dist', 'webview'),
      ...(options?.extraLocalRoots ?? []),
    ],
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (msg: DocumentWebviewMessage | { type: string; payload: Record<string, unknown> }) => {
      switch ((msg as { type: string }).type) {
        case 'ready': {
          // Use custom onReady if provided (e.g. URL-based loading for EPUB)
          if (options?.onReady) {
            await options.onReady();
            break;
          }
          // Default: read file and send as base64
          try {
            const buffer = await fs.readFile(filePath);
            const data = buffer.toString('base64');
            await webviewPanel.webview.postMessage({
              type: 'document:data',
              payload: { data, fileName, fileSize: buffer.byteLength },
            });
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to read file ${filePath}:`, error);
            webviewPanel.webview.html = getErrorHtml(`Failed to read file: ${errMsg}`);
          }
          break;
        }

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
            // neko-agent may not be installed — graceful degradation
            logger.warn('neko.agent.sendContext command not available');
            vscode.window.showWarningMessage(
              'AI Agent extension is not available. Please install neko-agent to use this feature.',
            );
          }
          break;
        }

        default: {
          // Forward unknown messages to the provider's custom handler (e.g. epub:rangeTestResult)
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

function getErrorHtml(message: string): string {
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
