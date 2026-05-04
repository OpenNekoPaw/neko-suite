import * as vscode from 'vscode';
import { NEKO_MARKET_OPEN_SKILLS_COMMAND, type WebviewToExtensionMessage } from '@neko-agent/types';
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

    case 'revealFile':
      deps.fileOperationHandler.handleRevealFile(message.filePath);
      return true;

    case 'openConfigFile':
      deps.fileOperationHandler.handleOpenConfigFile();
      return true;

    case 'openUrl':
      deps.fileOperationHandler.handleOpenUrl(message.url);
      return true;

    case 'downloadSvg':
      deps.fileOperationHandler.handleDownloadSvg(message.svg, message.filename);
      return true;

    case 'sendToPlugin':
      void sendGeneratedAssetToPlugin(message.target, message.assetPath);
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

    case 'openMarketplace':
      vscode.commands.executeCommand(NEKO_MARKET_OPEN_SKILLS_COMMAND).then(undefined, () => {
        // neko-market extension not installed; no user-facing action is needed.
      });
      return true;

    default:
      return false;
  }
}
