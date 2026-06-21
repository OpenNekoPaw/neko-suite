/**
 * Config Message Handlers
 *
 * Handles: settingsData, projectFiles, configState, configChanged
 */

import { defineHandler } from './types';
import type { MessageHandler, HandlerRegistration } from './types';
import type {
  SettingsDataMessage,
  ProjectFilesMessage,
  ConfigStateMessage,
  ConfigChangedMessage,
  PluginCommandsMessage,
  PluginsAvailableMessage,
  ProviderMutationResultMessage,
  SettingsUpdatedMessage,
  SsoErrorMessage,
  SsoSessionChangedMessage,
} from './messages';
import {
  projectConfigStateMessage,
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

  context.setSelectedModel(projection.selectedModel ?? 'auto');

  if (Object.keys(projection.defaultMediaModels).length > 0) {
    context.setMediaModelSelection((prev) => {
      const defaultProjection = projectMediaModelSelectionDefaults({
        selection: prev,
        defaults: projection.defaultMediaModels,
      });
      return defaultProjection.updated ? defaultProjection.selection : prev;
    });
  }

  if (projection.configDiagnostic) {
    context.setGlobalError(projection.configDiagnostic.message);
  }
};

/**
 * Handle 'projectFiles' message - Project file list + optional canvas/story mention extras
 */
const handleProjectFiles: MessageHandler<'projectFiles'> = (
  message: ProjectFilesMessage,
  context,
) => {
  const isEntryRoleplayResult = message.purpose === 'roleplay' && !message.conversationId;
  if (!isEntryRoleplayResult && !context.isCurrentConversation(message.conversationId)) {
    return;
  }
  const currentFilter = context.mentionSearchFilterRef?.current ?? context.mentionSearchFilter;
  if (message.filter !== undefined && message.filter !== currentFilter) {
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
 * Handle 'configChanged' message - Configuration changed
 */
const handleConfigChanged: MessageHandler<'configChanged'> = (
  _message: ConfigChangedMessage,
  _context,
) => {
  // Deprecated: Agent config is snapshot-loaded on session/tab open, not file-watch refresh.
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
 * All config handler registrations
 */
export const configHandlers: HandlerRegistration[] = [
  defineHandler('settingsData', handleSettingsData),
  defineHandler('projectFiles', handleProjectFiles),
  defineHandler('configState', handleConfigState),
  defineHandler('configChanged', handleConfigChanged),
  defineHandler('settingsUpdated', handleSettingsMutationAck),
  defineHandler('modelAdded', handleSettingsMutationAck),
  defineHandler('modelRemoved', handleSettingsMutationAck),
  defineHandler('pluginCommands', handlePluginCommands),
  defineHandler('pluginsAvailable', handlePluginsAvailable),
  defineHandler('ssoSessionChanged', handleSsoSessionChanged),
  defineHandler('ssoError', handleSsoError),
];
