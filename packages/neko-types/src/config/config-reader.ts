/**
 * Configuration Reader
 *
 * Reads configuration files from user and workspace locations.
 * Provides utilities for path resolution and file watching.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { UnifiedConfig } from './types';
import { CONFIG_DIR_NAME, CONFIG_FILE_NAME } from './types';
import { ConsoleLogger } from '../logger/console-logger';
import { LogLevel } from '../logger/types';

const logger = new ConsoleLogger('ConfigReader', LogLevel.Debug);

// =============================================================================
// Path Utilities
// =============================================================================

/**
 * Get user config directory (~/.neko)
 */
export function getUserConfigDir(): string {
  return path.join(os.homedir(), CONFIG_DIR_NAME);
}

/**
 * Get user config file path (~/.neko/config.json)
 */
export function getUserConfigPath(): string {
  return path.join(getUserConfigDir(), CONFIG_FILE_NAME);
}

/**
 * Get workspace config directory (.neko in workDir)
 */
export function getWorkspaceConfigDir(workDir: string): string {
  return path.join(workDir, CONFIG_DIR_NAME);
}

/**
 * Get workspace config file path (.neko/config.json in workDir)
 */
export function getWorkspaceConfigPath(workDir: string): string {
  return path.join(getWorkspaceConfigDir(workDir), CONFIG_FILE_NAME);
}

// =============================================================================
// Configuration Reading
// =============================================================================

/**
 * Read configuration from a file path
 *
 * @param filePath - Path to the configuration file
 * @returns Parsed configuration or null if file doesn't exist or is invalid
 */
export function readConfigFile(filePath: string): UnifiedConfig | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as UnifiedConfig;
  } catch (error) {
    // Log error but don't throw - return null for missing/invalid config
    logger.error(`Failed to read config from ${filePath}`, error);
    return null;
  }
}

/**
 * Read user configuration (~/.neko/config.json)
 *
 * @returns User configuration or null if not found
 */
export function readUserConfig(): UnifiedConfig | null {
  return readConfigFile(getUserConfigPath());
}

/**
 * Read workspace configuration (.neko/config.json)
 *
 * @param workDir - Workspace directory path
 * @returns Workspace configuration or null if not found
 */
export function readWorkspaceConfig(workDir: string): UnifiedConfig | null {
  return readConfigFile(getWorkspaceConfigPath(workDir));
}

// =============================================================================
// Configuration Writing
// =============================================================================

/**
 * Write configuration to a file path
 *
 * @param filePath - Path to the configuration file
 * @param config - Configuration to write
 */
/**
 * Clean config object by removing undefined values, empty arrays, and empty objects.
 * This keeps the output config.json minimal.
 */
function cleanConfig(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value as object).length === 0
    )
      continue;
    result[key] = value;
  }
  return result;
}

export function writeConfigFile(filePath: string, config: UnifiedConfig): void {
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const cleaned = cleanConfig(config as unknown as Record<string, unknown>);
  fs.writeFileSync(filePath, JSON.stringify(cleaned, null, 2), 'utf-8');
}

/**
 * Write user configuration (~/.neko/config.json)
 *
 * @param config - Configuration to write
 */
export function writeUserConfig(config: UnifiedConfig): void {
  writeConfigFile(getUserConfigPath(), config);
}

/**
 * Write workspace configuration (.neko/config.json)
 *
 * @param workDir - Workspace directory path
 * @param config - Configuration to write
 */
export function writeWorkspaceConfig(workDir: string, config: UnifiedConfig): void {
  writeConfigFile(getWorkspaceConfigPath(workDir), config);
}

// =============================================================================
// Configuration Watching
// =============================================================================

/**
 * Watch configuration file for changes
 *
 * @param filePath - Path to the configuration file
 * @param callback - Callback when file changes
 * @returns Cleanup function to stop watching
 */
export function watchConfigFile(
  filePath: string,
  callback: (config: UnifiedConfig | null) => void,
): () => void {
  let watcher: fs.FSWatcher | null = null;

  try {
    // Try to watch the file directly
    watcher = fs.watch(filePath, (eventType) => {
      if (eventType === 'change') {
        const config = readConfigFile(filePath);
        callback(config);
      }
    });
  } catch {
    // File doesn't exist yet, watch directory instead
    const dir = path.dirname(filePath);
    const filename = path.basename(filePath);

    if (fs.existsSync(dir)) {
      watcher = fs.watch(dir, (_eventType, changedFilename) => {
        if (changedFilename === filename) {
          const config = readConfigFile(filePath);
          callback(config);
        }
      });
    }
  }

  return () => {
    if (watcher) {
      watcher.close();
    }
  };
}

/**
 * Watch user configuration for changes
 *
 * @param callback - Callback when config changes
 * @returns Cleanup function to stop watching
 */
export function watchUserConfig(callback: (config: UnifiedConfig | null) => void): () => void {
  return watchConfigFile(getUserConfigPath(), callback);
}

/**
 * Watch workspace configuration for changes
 *
 * @param workDir - Workspace directory path
 * @param callback - Callback when config changes
 * @returns Cleanup function to stop watching
 */
export function watchWorkspaceConfig(
  workDir: string,
  callback: (config: UnifiedConfig | null) => void,
): () => void {
  return watchConfigFile(getWorkspaceConfigPath(workDir), callback);
}

// =============================================================================
// Configuration Location Info
// =============================================================================

/**
 * Configuration location information
 */
export interface ConfigLocationInfo {
  dir: string;
  file: string;
  exists: boolean;
}

/**
 * Get configuration file locations info
 *
 * @param workDir - Workspace directory path (defaults to cwd)
 * @returns Information about user and workspace config locations
 */
export function getConfigLocations(workDir: string = process.cwd()): {
  user: ConfigLocationInfo;
  workspace: ConfigLocationInfo;
} {
  const userFile = getUserConfigPath();
  const workspaceFile = getWorkspaceConfigPath(workDir);

  return {
    user: {
      dir: getUserConfigDir(),
      file: userFile,
      exists: fs.existsSync(userFile),
    },
    workspace: {
      dir: getWorkspaceConfigDir(workDir),
      file: workspaceFile,
      exists: fs.existsSync(workspaceFile),
    },
  };
}
