/**
 * Configuration Module - Public API
 */

export { ConfigManager, type ConfigManagerOptions, type MergedConfig, type ConfigChangeEvent, type ConfigChangeListener } from './config-manager';
export {
  loadBuiltinPresets,
  getBuiltinProvider,
  getBuiltinProviderTemplates,
  getBuiltinProviderTemplate,
  getBuiltinModel,
  getBuiltinGroup,
  getBuiltinRetryTimeoutPreset,
  getBuiltinMCPServer,
  getBuiltinWorkflow,
  getBuiltinPrompt,
  type BuiltinPresets,
} from './builtin-presets';
export {
  UserConfigManager,
  FileUserConfigManager,
  type UserConfig,
  type UserConfigStorage,
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
