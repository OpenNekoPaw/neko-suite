/**
 * Config Message Handlers
 *
 * Handles: settingsData, projectFiles, configState, configChanged, mcpServerTestResult
 */

import { defineHandler } from './types';
import type { MessageHandler, HandlerRegistration } from './types';
import type {
  SettingsDataMessage,
  ProjectFilesMessage,
  ConfigStateMessage,
  ConfigStateWithStatusMessage,
  ConfigChangedMessage,
  ConnectionStateChangedMessage,
  ConnectionStatesMessage,
  GenerationProgressMessage,
  HooksDataMessage,
  MarketErrorMessage,
  MarketFeaturedMessage,
  MarketInstalledListMessage,
  MarketInstallProgressMessage,
  MarketInstallResultMessage,
  MarketSearchResultMessage,
  MarketUninstallResultMessage,
  MarketUpdatesMessage,
  McpServerTestResultMessage,
  PluginCommandsMessage,
  PluginsAvailableMessage,
  ProviderMutationResultMessage,
  SettingsUpdatedMessage,
  SkillsDataMessage,
  SsoErrorMessage,
  SsoSessionChangedMessage,
  ToolSkillsChangedMessage,
  ToolSkillsDataMessage,
} from './messages';
import { VSCodeMessages } from '@/components/hooks/useVSCode';
import {
  projectConfigStateMessage,
  projectMarketplaceError,
  projectMediaModelSelectionDefaults,
  projectPluginCommandsMessage,
  projectPluginsAvailableMessage,
  projectProjectFilesMessage,
  projectSettingsDataMessage,
  projectSettingsMutationError,
  projectSsoErrorMessage,
  projectSsoSessionChangedMessage,
} from '../presenters/config-message-presenter';

/**
 * Handle 'settingsData' message - Settings from extension
 */
const handleSettingsData: MessageHandler<'settingsData'> = (
  message: SettingsDataMessage,
  context,
) => {
  const projection = projectSettingsDataMessage(message);
  context.setSettings((prev) => ({
    ...prev,
    ...projection.settingsPatch,
  }));

  if (projection.selectedModel) {
    context.setSelectedModel(projection.selectedModel);
  }

  if (Object.keys(projection.defaultMediaModels).length > 0) {
    context.setMediaModelSelection((prev) => {
      const defaultProjection = projectMediaModelSelectionDefaults({
        selection: prev,
        defaults: projection.defaultMediaModels,
      });
      return defaultProjection.updated ? defaultProjection.selection : prev;
    });
  }
};

/**
 * Handle 'projectFiles' message - Project file list + optional canvas/story mention extras
 */
const handleProjectFiles: MessageHandler<'projectFiles'> = (
  message: ProjectFilesMessage,
  context,
) => {
  if (!context.isCurrentConversation(message.conversationId)) {
    return;
  }

  const projection = projectProjectFilesMessage(message);
  context.setProjectFiles(projection.projectFiles);
  context.setMentionItems(projection.mentionItems);
};

/**
 * Handle 'configState' message - Configuration from Platform
 * Uses platform-projected provider state for account/configuration UI.
 */
const handleConfigState: MessageHandler<'configState'> = (message: ConfigStateMessage, context) => {
  const settingsPatch = projectConfigStateMessage(message);
  if (settingsPatch) {
    context.setSettings((prev) => ({
      ...prev,
      ...settingsPatch,
    }));
  }
};

/**
 * Handle 'configStateWithStatus' message - Configuration plus connection state.
 * Connection state has no dedicated UI surface yet, so only provider state is
 * projected into settings here.
 */
const handleConfigStateWithStatus: MessageHandler<'configStateWithStatus'> = (
  message: ConfigStateWithStatusMessage,
  context,
) => {
  const settingsPatch = projectConfigStateMessage(message);
  if (settingsPatch) {
    context.setSettings((prev) => ({
      ...prev,
      ...settingsPatch,
    }));
  }
};

/**
 * Handle 'configChanged' message - Configuration changed
 */
const handleConfigChanged: MessageHandler<'configChanged'> = (
  _message: ConfigChangedMessage,
  _context,
) => {
  // Refresh both config AND settings when configuration changes
  // getConfig() updates configuredProviders, models, etc.
  // getSettings() updates chatModelOptions (model selector dropdown)
  VSCodeMessages.getConfig();
  VSCodeMessages.getSettings();
};

/**
 * Handle 'mcpServerTestResult' message - MCP server test result
 * Note: Actual handling is done via addEventListener in index.tsx
 * This handler just marks the message as handled for the registry
 */
const handleMCPServerTestResult: MessageHandler<'mcpServerTestResult'> = (
  _message: McpServerTestResultMessage,
  _context,
) => {
  // Handled by dedicated listener in index.tsx
};

/**
 * Handle 'pluginCommands' message - Plugin slash commands from external extensions
 */
const handlePluginCommands: MessageHandler<'pluginCommands'> = (
  message: PluginCommandsMessage,
  context,
) => {
  context.setPluginCommands(projectPluginCommandsMessage(message));
};

/**
 * Handle 'pluginsAvailable' message - installed neko-suite plugins for send-to actions
 */
const handlePluginsAvailable: MessageHandler<'pluginsAvailable'> = (
  message: PluginsAvailableMessage,
  context,
) => {
  context.setPluginsAvailable(projectPluginsAvailableMessage(message));
};

/**
 * Handle 'ssoSessionChanged' message - Account state from neko-auth bridge.
 */
const handleSsoSessionChanged: MessageHandler<'ssoSessionChanged'> = (
  message: SsoSessionChangedMessage,
  context,
) => {
  const projection = projectSsoSessionChangedMessage(message);
  context.updateSettings(projection.settingsPatch);
  if (projection.showOnboarding !== undefined) {
    context.setShowOnboarding(projection.showOnboarding);
  }
};

/**
 * Handle global SSO errors from the bridge.
 */
const handleSsoError: MessageHandler<'ssoError'> = (message: SsoErrorMessage, context) => {
  const projection = projectSsoErrorMessage(message);
  context.setGlobalError(projection.globalError);
  context.setShowOnboarding(projection.showOnboarding);
};

/**
 * Handle mutation acknowledgements that are already reflected by settings/config refreshes.
 */
const handleSettingsMutationAck: MessageHandler<
  'settingsUpdated' | 'modelAdded' | 'modelRemoved'
> = (message: SettingsUpdatedMessage | ProviderMutationResultMessage, context) => {
  const error = projectSettingsMutationError(message);
  if (error) context.setGlobalError(error);
};

/**
 * Consume bridge data that is extension-managed or has no UI surface yet.
 */
const handleBridgeStateOnlyMessage: MessageHandler<
  | 'connectionStates'
  | 'connectionStateChanged'
  | 'skillsData'
  | 'hooksData'
  | 'toolSkillsData'
  | 'toolSkillsChanged'
  | 'generationProgress'
> = (
  _message:
    | ConnectionStatesMessage
    | ConnectionStateChangedMessage
    | SkillsDataMessage
    | HooksDataMessage
    | ToolSkillsDataMessage
    | ToolSkillsChangedMessage
    | GenerationProgressMessage,
  _context,
) => {
  // Intentionally consumed to keep the protocol explicit and avoid unknown-message noise.
};

/**
 * Consume marketplace result messages. The in-chat marketplace UI is not mounted
 * today; errors still surface globally.
 */
const handleMarketplaceMessage: MessageHandler<
  | 'market:searchResult'
  | 'market:installProgress'
  | 'market:installResult'
  | 'market:uninstallResult'
  | 'market:installedList'
  | 'market:updates'
  | 'market:featured'
  | 'market:error'
> = (
  message:
    | MarketSearchResultMessage
    | MarketInstallProgressMessage
    | MarketInstallResultMessage
    | MarketUninstallResultMessage
    | MarketInstalledListMessage
    | MarketUpdatesMessage
    | MarketFeaturedMessage
    | MarketErrorMessage,
  context,
) => {
  const error = projectMarketplaceError(message);
  if (error) context.setGlobalError(error);
};

/**
 * Skills/hooks data handlers removed — webview does not consume this data.
 * Skills and hooks are managed internally by Extension (ConfigBridge accessors).
 */

/**
 * All config handler registrations
 */
export const configHandlers: HandlerRegistration[] = [
  defineHandler('settingsData', handleSettingsData),
  defineHandler('projectFiles', handleProjectFiles),
  defineHandler('configState', handleConfigState),
  defineHandler('configStateWithStatus', handleConfigStateWithStatus),
  defineHandler('configChanged', handleConfigChanged),
  defineHandler('settingsUpdated', handleSettingsMutationAck),
  defineHandler('modelAdded', handleSettingsMutationAck),
  defineHandler('modelRemoved', handleSettingsMutationAck),
  defineHandler('mcpServerTestResult', handleMCPServerTestResult),
  defineHandler('pluginCommands', handlePluginCommands),
  defineHandler('pluginsAvailable', handlePluginsAvailable),
  defineHandler('ssoSessionChanged', handleSsoSessionChanged),
  defineHandler('ssoError', handleSsoError),
  defineHandler('connectionStates', handleBridgeStateOnlyMessage),
  defineHandler('connectionStateChanged', handleBridgeStateOnlyMessage),
  defineHandler('skillsData', handleBridgeStateOnlyMessage),
  defineHandler('hooksData', handleBridgeStateOnlyMessage),
  defineHandler('toolSkillsData', handleBridgeStateOnlyMessage),
  defineHandler('toolSkillsChanged', handleBridgeStateOnlyMessage),
  defineHandler('generationProgress', handleBridgeStateOnlyMessage),
  defineHandler('market:searchResult', handleMarketplaceMessage),
  defineHandler('market:installProgress', handleMarketplaceMessage),
  defineHandler('market:installResult', handleMarketplaceMessage),
  defineHandler('market:uninstallResult', handleMarketplaceMessage),
  defineHandler('market:installedList', handleMarketplaceMessage),
  defineHandler('market:updates', handleMarketplaceMessage),
  defineHandler('market:featured', handleMarketplaceMessage),
  defineHandler('market:error', handleMarketplaceMessage),
];
