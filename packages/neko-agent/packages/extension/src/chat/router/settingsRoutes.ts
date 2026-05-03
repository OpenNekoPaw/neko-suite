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

    case 'addModel':
      deps.providerHandler.handleAddModel(message.model);
      return true;

    case 'removeModel':
      deps.providerHandler.handleRemoveModel(message.modelType);
      return true;

    case 'toggleProvider':
      deps.providerHandler.handleToggleProvider(message.providerType, message.enabled);
      return true;

    case 'toggleModel':
      deps.providerHandler.handleToggleModel(
        message.providerType,
        message.modelId,
        message.enabled,
      );
      return true;

    case 'addMCPServer':
      deps.integrationHandler.addMCPServer();
      return true;

    case 'testMCPServer':
      deps.integrationHandler.handleTestMCPServer(webview, message.server);
      return true;

    default:
      return false;
  }
}
