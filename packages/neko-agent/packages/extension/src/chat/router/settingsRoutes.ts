import type { WebviewToExtensionMessage } from '@neko-agent/types';
import type { ChatWebviewMessageRouterDeps } from './types';

export function tryHandleSettingsRoute(
  message: WebviewToExtensionMessage,
  deps: ChatWebviewMessageRouterDeps,
): boolean {
  const { webview } = deps;

  switch (message.type) {
    case 'getSettings':
      deps.settingsHandler.sendSettings(webview);
      return true;

    case 'updateSettings':
      void deps.settingsHandler.handleUpdateSettings(webview, message.settings);
      return true;

    case 'getTabState':
      deps.sendTabState();
      return true;

    case 'updateTabState':
      deps.updateTabState(message.openTabs, message.activeTabId);
      return true;

    case 'testMCPServer':
      deps.integrationHandler.handleTestMCPServer(webview, message.server);
      return true;

    default:
      return false;
  }
}
