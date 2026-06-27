import * as vscode from 'vscode';
import { type WebviewToExtensionMessage } from '@neko-agent/types';
import { buildRuntimePluginSlashCommandDispatch } from '@neko/agent/runtime';
import { getLogger } from '../../base';
import { sendGeneratedAssetToPlugin } from '../../services/pluginTransferBridge';
import type { ChatWebviewMessageRouterDeps } from './types';
import { resolveRequiredConversationId } from './conversationId';

const logger = getLogger('ChatWebviewMessageRouter');

export function tryHandleFileAndPluginRoute(
  message: WebviewToExtensionMessage,
  deps: ChatWebviewMessageRouterDeps,
): boolean {
  switch (message.type) {
    case 'openFile':
      deps.fileOperationHandler.handleOpenFile(message.filePath);
      return true;

    case 'revealDocumentLocator':
      deps.fileOperationHandler.handleRevealDocumentLocator({
        filePath: message.filePath,
        locator: message.locator,
        ...(message.source ? { source: message.source } : {}),
      });
      return true;

    case 'revealFile':
      deps.fileOperationHandler.handleRevealFile(message.filePath);
      return true;

    case 'revealAsset':
      deps.fileOperationHandler.handleRevealAsset(message.assetId);
      return true;

    case 'openConfigFile':
      deps.fileOperationHandler.handleOpenConfigFile();
      return true;

    case 'openUrl':
      deps.fileOperationHandler.handleOpenUrl(message.url);
      return true;

    case 'revealContextSource': {
      const nav = message.navigationData;
      const filePath = nav?.['filePath'] ?? nav?.['path'];
      const resolvedPath = nav?.['resolvedPath'];
      const assetId =
        message.contextType === 'asset'
          ? (nav?.['assetId'] ??
            (nav?.['partition'] === 'asset-library' ? nav?.['sourceId'] : undefined) ??
            stripAssetIdPrefix(message.contextId))
          : undefined;
      if (assetId) {
        deps.fileOperationHandler.handleRevealAsset(assetId);
      } else if (
        message.contextType === 'media' &&
        nav?.['partition'] === 'media-library' &&
        filePath
      ) {
        void vscode.commands.executeCommand(
          'neko.assets.revealMediaLibraryFile',
          resolvedPath ?? filePath,
        );
      } else if (filePath) {
        deps.fileOperationHandler.handleOpenFile(resolvedPath ?? filePath);
      } else if (message.contextType === 'canvas-node' && nav?.['nodeId']) {
        void vscode.commands.executeCommand('neko.canvas.selectNodeFromOutline', nav['nodeId']);
      }
      return true;
    }

    case 'downloadSvg':
      deps.fileOperationHandler.handleDownloadSvg(message.svg, message.filename);
      return true;

    case 'sendToPlugin':
      void sendGeneratedAssetToPlugin(
        message.target,
        message.assetPath,
        message.mediaType,
        message.payload,
      );
      return true;

    case 'dnd:start':
      deps.dndBroker.setPayload(message.asset);
      return true;

    case 'invokePluginSlashCommand':
      if (!resolveRequiredConversationId(deps.webview, message, 'invoke plugin slash command')) {
        return true;
      }
      const dispatch = buildRuntimePluginSlashCommandDispatch(message);
      vscode.commands
        .executeCommand(dispatch.command, dispatch.invocation)
        .then(undefined, (err) => {
          logger.warn(`Plugin slash command ${message.extensionId}/${message.commandId} failed`, {
            error: err,
          });
        });
      return true;

    default:
      return false;
  }
}

function stripAssetIdPrefix(contextId: string): string | undefined {
  const prefix = 'asset:';
  return contextId.startsWith(prefix) ? contextId.slice(prefix.length) : contextId || undefined;
}
