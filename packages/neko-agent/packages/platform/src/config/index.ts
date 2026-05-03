/**
 * Configuration Module - Public API
 */

export { ConfigManager, type ConfigManagerOptions, type MergedConfig } from './config-manager';
export {
  FileUserConfigManager,
  type UserConfig,
  type IUserConfigManager,
  getUserConfigPath,
} from './user-config';
export {
  loadWorkspaceConfig,
  saveWorkspaceConfig,
  watchWorkspaceConfig,
  getWorkspaceConfigPath,
  type WorkspaceConfig,
} from './workspace-config';
export {
  type ConfigExportData,
  type ConfigImportResult,
  type CustomProviderConfig,
} from './config-export-service';
export {
  buildAssistantConfigState,
  buildAssistantConfiguredProviderViews,
  buildAssistantProviderViews,
  buildAssistantSettingsResetScalars,
  buildAssistantProviderMutationSettingsUpdate,
  buildAssistantRuntimeSettingsSnapshot,
  buildAssistantSettingsSnapshot,
  buildDefaultMediaModelOptionIds,
  mapAssistantSettingsToUnifiedScalars,
  mapWebviewSettingsToUnifiedScalars,
  selectAssistantDefaultProvider,
  selectAssistantProvider,
  type AssistantConfigState,
  type AssistantConfiguredProviderView,
  type AssistantExecutionMode,
  type AssistantProviderModelView,
  type AssistantProviderMutation,
  type AssistantProviderSelection,
  type AssistantProviderView,
  type AssistantRuntimeSettingsSnapshot,
  type AssistantSettingsData,
  type AssistantSettingsSnapshot,
} from './assistant-config';
export {
  refreshOllamaModels,
  type OllamaModelRefreshConfig,
  type OllamaModelRefreshLogger,
  type OllamaModelRefreshProviderRegistry,
  type RefreshOllamaModelsInput,
  type RefreshOllamaModelsResult,
} from './ollama-model-refresh';
export {
  buildAssistantStatusBarPresentation,
  type AssistantStatusBarPresentation,
  type BuildAssistantStatusBarPresentationInput,
} from './assistant-status-bar';
export {
  runAssistantProviderConfigMutationRuntime,
  runAssistantProviderConfigMutationNotificationRuntime,
  runAssistantProviderMutationRuntime,
  type AssistantProviderConfigInput,
  type AssistantProviderConfigMutationNotificationEffects,
  type AssistantProviderConfigMutationNotificationResult,
  type AssistantProviderMutationNotificationMessage,
  type AssistantProviderMutationConfigRuntime,
  type AssistantProviderMutationOperationResult,
  type AssistantProviderMutationRuntimeEffects,
  type AssistantProviderMutationRuntimeRequest,
  type AssistantProviderMutationRuntimeResult,
} from './assistant-provider-mutation-runtime';
export {
  buildAssistantSettingsRuntimeDataMessage,
  runAssistantSettingsUpdateRuntime,
  type AssistantSettingsRuntimeEffects,
} from './assistant-settings-runtime';
export {
  buildProviderCredentialImports,
  runProviderCredentialConfigFileChangeRuntime,
  runProviderCredentialConfigFileImportRuntime,
  type ProviderCredentialConfigFileChangeRuntimeEffects,
  type ProviderCredentialConfigFileChangeRuntimeResult,
  type ProviderCredentialConfigFileImportLogger,
  type ProviderCredentialConfigFileImportRuntime,
  type ProviderCredentialConfigFileImportRuntimeEffects,
  type ProviderCredentialConfigFileImportRuntimeInput,
  type ProviderCredentialConfigFileImportRuntimeResult,
  type ProviderCredentialImportApplyResult,
  type ProviderCredentialImportFailure,
  type ProviderCredentialImport,
} from './config-file-import';
export {
  MCP_CONFIGURATION_UNAVAILABLE_MESSAGE,
  buildMCPServerAddedMessage,
  buildMCPServerAddFailureMessage,
  buildMCPStdioServerPreset,
  parseMCPArgsInput,
  runAddMCPStdioServerRuntime,
  type AddMCPStdioServerInput,
  type AddMCPStdioServerResult,
  type BuildMCPStdioServerPresetInput,
  type MCPServerConfigWriter,
} from './mcp-server-config';
export { RETRY_TIMEOUT_PRESETS } from './retry-timeout-presets';
export { DEFAULT_USER_CONFIG, ensureUserConfig } from './default-config';
