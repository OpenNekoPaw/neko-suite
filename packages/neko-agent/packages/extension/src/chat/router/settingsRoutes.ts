import type { WebviewToExtensionMessage } from '@neko-agent/types';
import type { ChatWebviewMessageRouterDeps } from './types';

export function tryHandleSettingsRoute(
  message: WebviewToExtensionMessage,
  deps: ChatWebviewMessageRouterDeps,
): boolean {
  switch (message.type) {
    case 'getSettings':
      deps.settingsHandler.sendSettings(deps.webview);
      return true;

    case 'refreshConfigSnapshot':
      deps.refreshConfigSnapshot();
      return true;

    case 'updateSettings':
      void deps.settingsHandler.handleUpdateSettings(deps.webview, message.settings);
      return true;

    case 'getTabState':
      deps.sendTabState();
      return true;

    case 'updateTabState':
      deps.updateTabState(message.openTabs, message.activeTabId);
      return true;

    default:
      return false;
  }
}
