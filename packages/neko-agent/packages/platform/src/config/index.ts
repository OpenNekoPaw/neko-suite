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
export { RETRY_TIMEOUT_PRESETS } from './retry-timeout-presets';
export { DEFAULT_USER_CONFIG, ensureUserConfig } from './default-config';
