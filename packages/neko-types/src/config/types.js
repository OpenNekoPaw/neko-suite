/**
 * Unified Configuration Types
 *
 * Shared configuration format for agent-cli and platform.
 * File locations:
 * - User config: ~/.neko/config.json
 * - Workspace config: .neko/config.json
 */
// =============================================================================
// Configuration Defaults
// =============================================================================
/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
    defaultProvider: 'anthropic',
    defaultModel: 'claude-sonnet-4-20250514',
    maxTokens: 8192,
    temperature: 0.7,
    verbose: false,
    outputFormat: 'text',
};
// =============================================================================
// Configuration File Paths
// =============================================================================
/** Config directory name */
export const CONFIG_DIR_NAME = '.neko';
/** Config file name */
export const CONFIG_FILE_NAME = 'config.json';
//# sourceMappingURL=types.js.map