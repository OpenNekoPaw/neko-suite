/**
 * Configuration Reader
 *
 * Reads TOML configuration files from user and workspace locations.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parse, stringify, TomlError } from 'smol-toml';
import type { UnifiedConfig } from './types';
import { CONFIG_DIR_NAME, CONFIG_FILE_NAME } from './types';
import { tomlToUnifiedConfig, unifiedConfigToToml, type NekoTomlConfig } from './toml-config';
import { ConsoleLogger } from '../logger/console-logger';
import { LogLevel } from '../logger/types';

const logger = new ConsoleLogger('ConfigReader', LogLevel.Debug);

export type ConfigReadErrorCode =
  | 'empty'
  | 'invalidToml'
  | 'unsupportedVersion'
  | 'duplicateProviderId'
  | 'duplicateModelId'
  | 'readError';

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
  return result.status !== 'ok' && result.status !== 'missing';
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
 * Get canonical user config file path (~/.neko/config.toml)
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
 * Get canonical workspace config file path (.neko/config.toml in workDir)
 */
export function getWorkspaceConfigPath(workDir: string): string {
  return path.join(getWorkspaceConfigDir(workDir), CONFIG_FILE_NAME);
}

// =============================================================================
// Configuration Reading
// =============================================================================

/**
 * Read canonical TOML configuration from a file path with a typed result.
 *
 * @param filePath - Path to the TOML configuration file
 * @returns Typed read result that distinguishes missing, empty, invalid TOML, validation, and IO failures
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
      config: tomlToUnifiedConfig(parse(content) as NekoTomlConfig),
    };
  } catch (error) {
    const code = getConfigReadErrorCode(error);
    const diagnostic = buildConfigReadDiagnostic(code, filePath, error);
    logger.error(diagnostic.message, error);
    return { status: code, filePath, diagnostic };
  }
}

/**
 * Read user configuration with a typed result (~/.neko/config.toml)
 */
export function readUserConfigResult(): ConfigReadResult {
  return readConfigFileResult(getUserConfigPath());
}

/**
 * Read workspace configuration with a typed result (.neko/config.toml)
 */
export function readWorkspaceConfigResult(workDir: string): ConfigReadResult {
  return readConfigFileResult(getWorkspaceConfigPath(workDir));
}

// =============================================================================
// Configuration Writing
// =============================================================================

export function writeConfigFile(filePath: string, config: UnifiedConfig): void {
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, `${stringify(unifiedConfigToToml(config))}`, 'utf-8');
}

/**
 * Write user configuration (~/.neko/config.toml)
 *
 * @param config - Configuration to write
 */
export function writeUserConfig(config: UnifiedConfig): void {
  writeConfigFile(getUserConfigPath(), config);
}

/**
 * Write workspace configuration (.neko/config.toml)
 *
 * @param workDir - Workspace directory path
 * @param config - Configuration to write
 */
export function writeWorkspaceConfig(workDir: string, config: UnifiedConfig): void {
  writeConfigFile(getWorkspaceConfigPath(workDir), config);
}

function getConfigReadErrorCode(error: unknown): ConfigReadErrorCode {
  if (isTomlValidationError(error, 'unsupportedVersion')) return 'unsupportedVersion';
  if (isTomlValidationError(error, 'duplicateProviderId')) return 'duplicateProviderId';
  if (isTomlValidationError(error, 'duplicateModelId')) return 'duplicateModelId';
  return error instanceof TomlError ? 'invalidToml' : 'readError';
}

function isTomlValidationError(error: unknown, code: ConfigReadErrorCode): boolean {
  return (
    error instanceof Error &&
    error.name === 'TomlConfigValidationError' &&
    'issues' in error &&
    Array.isArray(error.issues) &&
    error.issues.some((issue) => issue?.code === code)
  );
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
    case 'invalidToml':
      return {
        code,
        filePath,
        message: `Configuration file contains invalid TOML: ${filePath}`,
        ...(detail !== undefined ? { detail } : {}),
      };
    case 'unsupportedVersion':
      return {
        code,
        filePath,
        message: `Configuration file uses an unsupported version: ${filePath}`,
        ...(detail !== undefined ? { detail } : {}),
      };
    case 'duplicateProviderId':
      return {
        code,
        filePath,
        message: `Configuration file contains duplicate provider IDs: ${filePath}`,
        ...(detail !== undefined ? { detail } : {}),
      };
    case 'duplicateModelId':
      return {
        code,
        filePath,
        message: `Configuration file contains duplicate model IDs: ${filePath}`,
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
