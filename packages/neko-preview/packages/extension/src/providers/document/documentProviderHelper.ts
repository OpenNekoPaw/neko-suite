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
 */
export async function setupDocumentWebview(
  document: vscode.CustomDocument,
  webviewPanel: vscode.WebviewPanel,
  extensionUri: vscode.Uri,
  entry: PreviewEntry,
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
    async (msg: DocumentWebviewMessage) => {
      switch (msg.type) {
        case 'ready': {
          // Read file and send as base64
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
          const { selectedText, pageNumber, chapterTitle, imageDataUrl } = msg.payload;
          const label = buildLabel(fileName, pageNumber, chapterTitle);
          const payload: AgentContextPayload = {
            type: 'document-selection',
            id: `doc:${filePath}:${pageNumber ?? 0}:${Date.now()}`,
            label,
            summary: selectedText?.slice(0, 400) ?? 'Image selection',
            data: { filePath, selectedText, pageNumber, chapterTitle, imageDataUrl },
            intent: selectedText ? '请分析这段内容：' : '请分析这张图片：',
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
