/**
 * Explicit Agent config migration helpers.
 *
 * Normal Agent startup must not call these helpers. They are for user-invoked
 * JSON-to-TOML migration commands and diagnostics only.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ModelConfig, ProviderConfig } from '../types/config';
import type { ConfigReadDiagnostic } from './config-reader';
import { readLegacyJsonConfigFileResult, type ConfigReadResult } from './config-reader';
import { serializeUnifiedConfigToToml } from './toml-config';
import type { UnifiedConfig } from './types';

export type LegacyConfigMigrationStatus =
  | 'migrated'
  | 'missingLegacyJson'
  | 'tomlAlreadyExists'
  | 'invalidLegacyJson'
  | 'readError'
  | 'writeError';

export interface LegacyConfigMigrationResult {
  readonly status: LegacyConfigMigrationStatus;
  readonly legacyJsonPath: string;
  readonly tomlPath: string;
  readonly backupPath?: string;
  readonly diagnostic?: ConfigReadDiagnostic | LegacyConfigMigrationDiagnostic;
}

export interface LegacyConfigMigrationDiagnostic {
  readonly code: LegacyConfigMigrationStatus;
  readonly filePath: string;
  readonly message: string;
  readonly detail?: string;
}

export interface LegacyConfigMigrationOptions {
  readonly legacyJsonPath: string;
  readonly tomlPath: string;
  readonly backupPath?: string;
}

const ACCOUNT_GATEWAY_PROVIDER_ID = 'neko-account-gateway';

export function migrateLegacyJsonConfigToToml(
  options: LegacyConfigMigrationOptions,
): LegacyConfigMigrationResult {
  const backupPath = options.backupPath ?? `${options.legacyJsonPath}.bak`;

  if (fs.existsSync(options.tomlPath)) {
    return {
      status: 'tomlAlreadyExists',
      legacyJsonPath: options.legacyJsonPath,
      tomlPath: options.tomlPath,
      backupPath,
      diagnostic: buildMigrationDiagnostic(
        'tomlAlreadyExists',
        options.tomlPath,
        `TOML configuration already exists: ${options.tomlPath}. Remove it before migrating legacy JSON.`,
      ),
    };
  }

  const legacyRead = readLegacyJsonConfigFileResult(options.legacyJsonPath);
  if (legacyRead.status === 'missing') {
    return {
      status: 'missingLegacyJson',
      legacyJsonPath: options.legacyJsonPath,
      tomlPath: options.tomlPath,
      backupPath,
      diagnostic: buildMigrationDiagnostic(
        'missingLegacyJson',
        options.legacyJsonPath,
        `Legacy JSON configuration does not exist: ${options.legacyJsonPath}`,
      ),
    };
  }
  if (legacyRead.status !== 'ok') {
    return {
      status: legacyRead.status === 'invalidJson' ? 'invalidLegacyJson' : 'readError',
      legacyJsonPath: options.legacyJsonPath,
      tomlPath: options.tomlPath,
      backupPath,
      diagnostic: legacyRead.diagnostic,
    };
  }

  try {
    const migrated = sanitizeLegacyUnifiedConfig(legacyRead.config);
    fs.mkdirSync(path.dirname(options.tomlPath), { recursive: true });
    fs.writeFileSync(options.tomlPath, serializeUnifiedConfigToToml(migrated), 'utf-8');
    renameLegacyJsonToBackup(options.legacyJsonPath, backupPath);
    return {
      status: 'migrated',
      legacyJsonPath: options.legacyJsonPath,
      tomlPath: options.tomlPath,
      backupPath,
    };
  } catch (error) {
    return {
      status: 'writeError',
      legacyJsonPath: options.legacyJsonPath,
      tomlPath: options.tomlPath,
      backupPath,
      diagnostic: buildMigrationDiagnostic(
        'writeError',
        options.tomlPath,
        `Failed to migrate legacy JSON configuration to TOML: ${options.tomlPath}`,
        error,
      ),
    };
  }
}

export function sanitizeLegacyUnifiedConfig(config: UnifiedConfig): UnifiedConfig {
  const providers = filterAccountGatewayProviders(config.providers);
  const models = filterAccountGatewayModels(config.models);
  const providerIds = new Set(providers?.map((provider) => provider.id) ?? []);
  const modelIds = new Set(models?.map((model) => model.id) ?? []);

  return removeUndefined({
    defaultProvider:
      config.defaultProvider && providerIds.has(config.defaultProvider)
        ? config.defaultProvider
        : undefined,
    defaultModel:
      config.defaultModel && modelIds.has(config.defaultModel) ? config.defaultModel : undefined,
    defaultMediaModels: filterDefaultMediaModels(config.defaultMediaModels, modelIds),
    maxTokens: config.maxTokens,
    temperature: config.temperature,
    skillsDir: config.skillsDir,
    verbose: config.verbose,
    outputFormat: config.outputFormat,
    thinkingBudget: config.thinkingBudget,
    customSystemPrompt: config.customSystemPrompt,
    autoExecuteTools: config.autoExecuteTools,
    streamResponses: config.streamResponses,
    showToolCalls: config.showToolCalls,
    executionMode: config.executionMode,
    providers,
    models,
    mcpServers: cloneArray(config.mcpServers),
    providerOverrides: filterRecord(config.providerOverrides, providerIds),
    modelOverrides: filterRecord(config.modelOverrides, modelIds),
    mcpServerOverrides: config.mcpServerOverrides,
    auth: config.auth,
    credentials: filterCredentials(config.credentials, providerIds),
    market: config.market,
  });
}

function renameLegacyJsonToBackup(legacyJsonPath: string, backupPath: string): void {
  if (!fs.existsSync(legacyJsonPath)) return;
  if (fs.existsSync(backupPath)) {
    throw new Error(`Backup file already exists: ${backupPath}`);
  }
  fs.renameSync(legacyJsonPath, backupPath);
}

function filterAccountGatewayProviders(
  providers?: readonly ProviderConfig[],
): ProviderConfig[] | undefined {
  const filtered = cloneArray(providers)?.filter(
    (provider) => provider.id !== ACCOUNT_GATEWAY_PROVIDER_ID,
  );
  return filtered && filtered.length > 0 ? filtered : undefined;
}

function filterAccountGatewayModels(models?: readonly ModelConfig[]): ModelConfig[] | undefined {
  const filtered = cloneArray(models)?.filter(
    (model) =>
      model.providerId !== ACCOUNT_GATEWAY_PROVIDER_ID &&
      !model.id.startsWith(`${ACCOUNT_GATEWAY_PROVIDER_ID}:`),
  );
  return filtered && filtered.length > 0 ? filtered : undefined;
}

function filterDefaultMediaModels(
  defaults: UnifiedConfig['defaultMediaModels'],
  modelIds: ReadonlySet<string>,
): UnifiedConfig['defaultMediaModels'] {
  if (!defaults) return undefined;
  const filtered = Object.fromEntries(
    Object.entries(defaults).filter(
      ([, modelId]) => typeof modelId === 'string' && modelIds.has(modelId),
    ),
  ) as UnifiedConfig['defaultMediaModels'];
  return filtered && Object.keys(filtered).length > 0 ? filtered : undefined;
}

function filterCredentials(
  credentials: UnifiedConfig['credentials'],
  providerIds: ReadonlySet<string>,
): UnifiedConfig['credentials'] {
  const apiKeys = filterRecord(credentials?.apiKeys, providerIds);
  return apiKeys ? { apiKeys } : undefined;
}

function filterRecord<T>(
  value: Record<string, T> | undefined,
  allowedKeys: ReadonlySet<string>,
): Record<string, T> | undefined {
  if (!value) return undefined;
  const filtered = Object.fromEntries(
    Object.entries(value).filter(([key]) => allowedKeys.has(key)),
  ) as Record<string, T>;
  return Object.keys(filtered).length > 0 ? filtered : undefined;
}

function cloneArray<T extends object>(items?: readonly T[]): T[] | undefined {
  return items ? items.map((item) => ({ ...item })) : undefined;
}

function removeUndefined<T extends Record<string, unknown>>(value: T): T {
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) {
      delete value[key];
    }
  }
  return value;
}

function buildMigrationDiagnostic(
  code: LegacyConfigMigrationStatus,
  filePath: string,
  message: string,
  error?: unknown,
): LegacyConfigMigrationDiagnostic {
  const detail =
    error instanceof Error ? error.message : error === undefined ? undefined : String(error);
  return {
    code,
    filePath,
    message,
    ...(detail !== undefined ? { detail } : {}),
  };
}

export type LegacyJsonConfigReadResult = ConfigReadResult;
