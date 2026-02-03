/**
 * Configuration Normalizer
 *
 * Normalizes and merges configuration from different sources.
 * Handles legacy field migration and format conversion.
 */
import type { UnifiedConfig, NormalizedConfig } from './types';
/**
 * Migrate legacy fields in configuration
 *
 * Handles:
 * - provider → defaultProvider
 * - model → defaultModel
 * - providers object → providers array
 * - apiKey/baseUrl → providers[].apiKey/apiUrl
 */
export declare function migrateLegacyFields(config: UnifiedConfig): UnifiedConfig;
/**
 * Merge two configurations (later config takes precedence)
 *
 * @param base - Base configuration
 * @param override - Override configuration (takes precedence)
 * @returns Merged configuration
 */
export declare function mergeConfigs(base: UnifiedConfig, override: UnifiedConfig): UnifiedConfig;
/**
 * Normalize unified configuration to internal format
 *
 * @param config - Unified configuration (after migration and merging)
 * @returns Normalized configuration
 */
export declare function normalizeConfig(config: UnifiedConfig): NormalizedConfig;
/**
 * Process configuration through the full pipeline
 *
 * 1. Migrate legacy fields
 * 2. Merge user and workspace configs
 * 3. Normalize to internal format
 *
 * @param userConfig - User configuration (~/.neko/config.json)
 * @param workspaceConfig - Workspace configuration (.neko/config.json)
 * @returns Normalized configuration
 */
export declare function processConfig(userConfig: UnifiedConfig | null, workspaceConfig: UnifiedConfig | null): NormalizedConfig;
//# sourceMappingURL=config-normalizer.d.ts.map