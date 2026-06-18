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

export type ConfigReadErrorCode = 'empty' | 'invalidJson' | 'readError';

export interface ConfigReadDiagnostic {
  readonly code: ConfigReadErrorCode;
  readonly filePath: string;
  readonly message: string;
  readonly detail?: string;
}

export type ConfigReadResult =
  | {
      readonly status: 'ok';
      readonly filePath: string;
      readonly config: UnifiedConfig;
    }
  | {
      readonly status: 'missing';
      readonly filePath: string;
    }
  | {
      readonly status: ConfigReadErrorCode;
      readonly filePath: string;
      readonly diagnostic: ConfigReadDiagnostic;
    };

export function isConfigReadError(
  result: ConfigReadResult,
): result is Extract<ConfigReadResult, { readonly status: ConfigReadErrorCode }> {
  return (
    result.status === 'empty' || result.status === 'invalidJson' || result.status === 'readError'
  );
}

export function getConfigReadDiagnostic(
  result: ConfigReadResult,
): ConfigReadDiagnostic | undefined {
  return isConfigReadError(result) ? result.diagnostic : undefined;
}

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
 * Read configuration from a file path with a typed result.
 *
 * @param filePath - Path to the configuration file
 * @returns Typed read result that distinguishes missing, empty, invalid JSON, and IO failures
 */
export function readConfigFileResult(filePath: string): ConfigReadResult {
  try {
    if (!fs.existsSync(filePath)) {
      return { status: 'missing', filePath };
    }

    const content = fs.readFileSync(filePath, 'utf-8').trim();
    if (!content) {
      return {
        status: 'empty',
        filePath,
        diagnostic: buildConfigReadDiagnostic('empty', filePath),
      };
    }
    return {
      status: 'ok',
      filePath,
      config: JSON.parse(content) as UnifiedConfig,
    };
  } catch (error) {
    const code = error instanceof SyntaxError ? 'invalidJson' : 'readError';
    const diagnostic = buildConfigReadDiagnostic(code, filePath, error);
    logger.error(diagnostic.message, error);
    return { status: code, filePath, diagnostic };
  }
}

/**
 * Read configuration from a file path.
 *
 * Compatibility helper for older explicit config tooling. New Agent runtime paths
 * should use readConfigFileResult so invalid files cannot be confused with
 * missing files.
 *
 * @param filePath - Path to the configuration file
 * @returns Parsed configuration or null if file doesn't exist or is invalid
 */
export function readConfigFile(filePath: string): UnifiedConfig | null {
  const result = readConfigFileResult(filePath);
  return result.status === 'ok' ? result.config : null;
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
 * Read user configuration with a typed result (~/.neko/config.json)
 */
export function readUserConfigResult(): ConfigReadResult {
  return readConfigFileResult(getUserConfigPath());
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

/**
 * Read workspace configuration with a typed result (.neko/config.json)
 */
export function readWorkspaceConfigResult(workDir: string): ConfigReadResult {
  return readConfigFileResult(getWorkspaceConfigPath(workDir));
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
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const debouncedRead = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const config = readConfigFile(filePath);
      callback(config);
    }, 100);
  };

  try {
    watcher = fs.watch(filePath, (eventType) => {
      if (eventType === 'change') {
        debouncedRead();
      }
    });
  } catch {
    const dir = path.dirname(filePath);
    const filename = path.basename(filePath);

    if (fs.existsSync(dir)) {
      watcher = fs.watch(dir, (_eventType, changedFilename) => {
        if (changedFilename === filename) {
          debouncedRead();
        }
      });
    }
  }

  return () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    if (watcher) {
      watcher.close();
    }
  };
}

function buildConfigReadDiagnostic(
  code: ConfigReadErrorCode,
  filePath: string,
  error?: unknown,
): ConfigReadDiagnostic {
  const detail =
    error instanceof Error ? error.message : error === undefined ? undefined : String(error);
  switch (code) {
    case 'empty':
      return {
        code,
        filePath,
        message: `Configuration file is empty: ${filePath}`,
        ...(detail !== undefined ? { detail } : {}),
      };
    case 'invalidJson':
      return {
        code,
        filePath,
        message: `Configuration file contains invalid JSON: ${filePath}`,
        ...(detail !== undefined ? { detail } : {}),
      };
    case 'readError':
      return {
        code,
        filePath,
        message: `Failed to read configuration file: ${filePath}`,
        ...(detail !== undefined ? { detail } : {}),
      };
  }
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
