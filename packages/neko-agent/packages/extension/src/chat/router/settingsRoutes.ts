import type { WebviewToExtensionMessage } from '@neko-agent/types';
import type { ChatWebviewMessageRouterDeps } from './types';

export function tryHandleSettingsRoute(
  message: WebviewToExtensionMessage,
  deps: ChatWebviewMessageRouterDeps,
): boolean {
  switch (message.type) {
    case 'getSettings':
      void deps.settingsHandler.sendSettings(deps.webview);
      return true;

    case 'refreshConfigSnapshot':
      deps.refreshConfigSnapshot();
      return true;

    case 'updateSettings':
      void deps.settingsHandler.handleUpdateSettings(deps.webview, message.settings, {
        ...(message.conversationId ? { conversationId: message.conversationId } : {}),
      });
      return true;

    case 'getTabState':
      deps.sendTabState();
      return true;

    case 'updateTabState':
      deps.updateTabState(message);
      return true;

    default:
      return false;
  }
}
