/**
 * Unified Configuration Module
 *
 * Shared configuration format for agent-cli and platform.
 *
 * File locations:
 * - User config: ~/.neko/config.json
 * - Workspace config: .neko/config.json
 *
 * NOTE: config-reader.ts uses Node.js APIs (fs, path, os) and is NOT exported
 * from the main entry point. Import it directly from '@uniedit/shared/config/config-reader'
 * in Node.js environments only.
 *
 * @example
 * ```typescript
 * // In browser/webview - use types and normalizer only
 * import {
 *   type UnifiedConfig,
 *   processConfig,
 * } from '@uniedit/shared';
 *
 * // In Node.js (extension, agent-cli) - import reader directly
 * import {
 *   readUserConfig,
 *   readWorkspaceConfig,
 * } from '@uniedit/shared/config/config-reader';
 * ```
 */
export type { UnifiedConfig, NormalizedConfig, GroupConfig, TemplatePresetConfig, } from './types';
export { DEFAULT_CONFIG, CONFIG_DIR_NAME, CONFIG_FILE_NAME, } from './types';
export { migrateLegacyFields, mergeConfigs, normalizeConfig, processConfig, } from './config-normalizer';
export type { ValidationError, ValidationResult, IConfigAdapter, ConfigChangeType, ConfigChangeEvent, ConfigChangeListener, Disposable, IUnifiedConfigManager, } from './config-adapter';
export { BaseConfigAdapter } from './config-adapter';
//# sourceMappingURL=index.d.ts.map