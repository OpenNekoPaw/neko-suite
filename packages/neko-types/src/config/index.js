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
 * from the main entry point. Import it directly from '@neko/shared/config/config-reader'
 * in Node.js environments only.
 *
 * @example
 * ```typescript
 * // In browser/webview - use types and normalizer only
 * import {
 *   type UnifiedConfig,
 *   processConfig,
 * } from '@neko/shared';
 *
 * // In Node.js (extension, agent-cli) - import reader directly
 * import {
 *   readUserConfig,
 *   readWorkspaceConfig,
 * } from '@neko/shared/config/config-reader';
 * ```
 */
export { DEFAULT_CONFIG, CONFIG_DIR_NAME, CONFIG_FILE_NAME, } from './types';
// Normalizer (browser-safe - pure functions, no Node.js dependencies)
export { migrateLegacyFields, mergeConfigs, normalizeConfig, processConfig, } from './config-normalizer';
export { BaseConfigAdapter } from './config-adapter';
// NOTE: config-reader.ts is NOT exported here because it uses Node.js APIs.
// Import directly from '@neko/shared/config/config-reader' in Node.js environments.
//# sourceMappingURL=index.js.map