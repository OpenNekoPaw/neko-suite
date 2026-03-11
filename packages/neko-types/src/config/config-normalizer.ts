/**
 * Configuration Normalizer
 *
 * Normalizes and merges configuration from different sources.
 * Handles legacy field migration and format conversion.
 */

import type { ProviderConfig } from '../types/config';
import type { UnifiedConfig, NormalizedConfig } from './types';
import { DEFAULT_CONFIG } from './types';

// =============================================================================
// Legacy Format Migration
// =============================================================================

/**
 * Legacy provider configuration format (agent-cli old format)
 *
 * Old format used object keyed by provider name:
 * ```json
 * {
 *   "providers": {
 *     "anthropic": { "apiKey": "...", "defaultModel": "..." },
 *     "openai": { "apiKey": "...", "defaultModel": "..." }
 *   }
 * }
 * ```
 */
interface LegacyProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  models?: (string | { id: string; name?: string })[];
}

/**
 * Check if providers is in legacy object format
 */
function isLegacyProvidersFormat(
  providers: unknown,
): providers is Record<string, LegacyProviderConfig> {
  if (!providers || typeof providers !== 'object') {
    return false;
  }
  // Array format is the new format
  if (Array.isArray(providers)) {
    return false;
  }
  // Object format is legacy
  return true;
}

/**
 * Convert legacy providers object format to array format
 */
function convertLegacyProviders(
  legacyProviders: Record<string, LegacyProviderConfig>,
): ProviderConfig[] {
  const providers: ProviderConfig[] = [];

  for (const [name, config] of Object.entries(legacyProviders)) {
    providers.push({
      id: name,
      name: name,
      displayName: capitalizeFirst(name),
      type: inferProviderType(name),
      apiUrl: config.baseUrl ?? getDefaultApiUrl(name),
      apiKey: config.apiKey,
      enabled: true,
    });
  }

  return providers;
}

/**
 * Infer provider type from name
 */
function inferProviderType(name: string): ProviderConfig['type'] {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('anthropic') || lowerName.includes('claude')) {
    return 'anthropic';
  }
  if (lowerName.includes('openai') || lowerName.includes('gpt')) {
    return 'openai';
  }
  if (lowerName.includes('google') || lowerName.includes('gemini')) {
    return 'google';
  }
  if (lowerName.includes('azure')) {
    return 'azure';
  }
  if (lowerName.includes('ollama')) {
    return 'ollama';
  }
  if (lowerName.includes('deepseek')) {
    return 'generic';
  }
  return 'generic';
}

/**
 * Get default API URL for known providers
 */
function getDefaultApiUrl(name: string): string {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('anthropic')) {
    return 'https://api.anthropic.com';
  }
  if (lowerName.includes('openai')) {
    return 'https://api.openai.com/v1';
  }
  if (lowerName.includes('deepseek')) {
    return 'https://api.deepseek.com';
  }
  if (lowerName.includes('ollama')) {
    return 'http://localhost:11434';
  }
  return '';
}

/**
 * Capitalize first letter
 */
function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// =============================================================================
// Configuration Migration
// =============================================================================

/**
 * Migrate legacy fields in configuration
 *
 * Handles:
 * - provider → defaultProvider
 * - model → defaultModel
 * - providers object → providers array
 * - apiKey/baseUrl → providers[].apiKey/apiUrl
 */
export function migrateLegacyFields(config: UnifiedConfig): UnifiedConfig {
  const migrated = { ...config };

  // Migrate provider → defaultProvider
  if (config.provider && !config.defaultProvider) {
    migrated.defaultProvider = config.provider;
  }

  // Migrate model → defaultModel
  if (config.model && !config.defaultModel) {
    migrated.defaultModel = config.model;
  }

  // Migrate legacy providers object format to array format
  if (isLegacyProvidersFormat(config.providers)) {
    migrated.providers = convertLegacyProviders(config.providers);
  }

  // Migrate top-level apiKey/baseUrl to default provider
  if ((config.apiKey || config.baseUrl) && migrated.providers) {
    const defaultProviderId = migrated.defaultProvider ?? 'anthropic';
    const existingProvider = migrated.providers.find((p) => p.id === defaultProviderId);

    if (existingProvider) {
      if (config.apiKey && !existingProvider.apiKey) {
        existingProvider.apiKey = config.apiKey;
      }
      if (config.baseUrl && !existingProvider.apiUrl) {
        existingProvider.apiUrl = config.baseUrl;
      }
    } else {
      // Create provider entry for legacy apiKey/baseUrl
      migrated.providers.push({
        id: defaultProviderId,
        name: defaultProviderId,
        displayName: capitalizeFirst(defaultProviderId),
        type: inferProviderType(defaultProviderId),
        apiUrl: config.baseUrl ?? getDefaultApiUrl(defaultProviderId),
        apiKey: config.apiKey,
        enabled: true,
      });
    }
  }

  return migrated;
}

// =============================================================================
// Configuration Merging
// =============================================================================

/**
 * Merge two configurations (later config takes precedence)
 *
 * @param base - Base configuration
 * @param override - Override configuration (takes precedence)
 * @returns Merged configuration
 */
export function mergeConfigs(base: UnifiedConfig, override: UnifiedConfig): UnifiedConfig {
  const merged: UnifiedConfig = { ...base };

  // Merge scalar fields (override takes precedence)
  if (override.defaultProvider !== undefined) {
    merged.defaultProvider = override.defaultProvider;
  }
  if (override.defaultModel !== undefined) {
    merged.defaultModel = override.defaultModel;
  }
  if (override.maxTokens !== undefined) {
    merged.maxTokens = override.maxTokens;
  }
  if (override.temperature !== undefined) {
    merged.temperature = override.temperature;
  }
  if (override.skillsDir !== undefined) {
    merged.skillsDir = override.skillsDir;
  }
  if (override.verbose !== undefined) {
    merged.verbose = override.verbose;
  }
  if (override.outputFormat !== undefined) {
    merged.outputFormat = override.outputFormat;
  }

  // Merge array fields (combine and dedupe by ID)
  merged.providers = mergeArrayById(base.providers, override.providers);
  merged.models = mergeArrayById(base.models, override.models);
  merged.mcpServers = mergeArrayById(base.mcpServers, override.mcpServers);

  // Merge override objects
  merged.providerOverrides = mergeOverrides(base.providerOverrides, override.providerOverrides);
  merged.modelOverrides = mergeOverrides(base.modelOverrides, override.modelOverrides);
  merged.mcpServerOverrides = mergeOverrides(base.mcpServerOverrides, override.mcpServerOverrides);

  return merged;
}

/**
 * Merge arrays by ID (later items override earlier ones with same ID)
 */
function mergeArrayById<T extends { id: string }>(base?: T[], override?: T[]): T[] | undefined {
  if (!base && !override) {
    return undefined;
  }

  const map = new Map<string, T>();

  // Add base items
  if (base) {
    for (const item of base) {
      map.set(item.id, item);
    }
  }

  // Override with later items
  if (override) {
    for (const item of override) {
      const existing = map.get(item.id);
      if (existing) {
        // Merge item properties
        map.set(item.id, { ...existing, ...item });
      } else {
        map.set(item.id, item);
      }
    }
  }

  return Array.from(map.values());
}

/**
 * Merge override objects
 */
function mergeOverrides<T>(
  base?: Record<string, Partial<T>>,
  override?: Record<string, Partial<T>>,
): Record<string, Partial<T>> | undefined {
  if (!base && !override) {
    return undefined;
  }

  const merged: Record<string, Partial<T>> = { ...base };

  if (override) {
    for (const [key, value] of Object.entries(override)) {
      merged[key] = { ...merged[key], ...value };
    }
  }

  return merged;
}

// =============================================================================
// Configuration Normalization
// =============================================================================

/**
 * Apply overrides to items
 */
function applyOverrides<T extends { id: string }>(
  items: T[],
  overrides?: Record<string, Partial<T>>,
): T[] {
  if (!overrides) {
    return items;
  }

  return items.map((item) => {
    const override = overrides[item.id];
    if (override) {
      return { ...item, ...override };
    }
    return item;
  });
}

/**
 * Convert array to Map by ID
 */
function arrayToMap<T extends { id: string }>(items?: T[]): Map<string, T> {
  const map = new Map<string, T>();
  if (items) {
    for (const item of items) {
      map.set(item.id, item);
    }
  }
  return map;
}

/**
 * Normalize unified configuration to internal format
 *
 * @param config - Unified configuration (after migration and merging)
 * @returns Normalized configuration
 */
export function normalizeConfig(config: UnifiedConfig): NormalizedConfig {
  // Apply overrides to items
  const providers = applyOverrides(config.providers ?? [], config.providerOverrides);
  const models = applyOverrides(config.models ?? [], config.modelOverrides);
  const mcpServers = applyOverrides(config.mcpServers ?? [], config.mcpServerOverrides);

  return {
    defaultProvider: config.defaultProvider ?? DEFAULT_CONFIG.defaultProvider,
    defaultModel: config.defaultModel ?? DEFAULT_CONFIG.defaultModel,
    maxTokens: config.maxTokens ?? DEFAULT_CONFIG.maxTokens,
    temperature: config.temperature ?? DEFAULT_CONFIG.temperature,
    skillsDir: config.skillsDir,
    verbose: config.verbose ?? DEFAULT_CONFIG.verbose,
    outputFormat: config.outputFormat ?? DEFAULT_CONFIG.outputFormat,
    providers: arrayToMap(providers),
    models: arrayToMap(models),
    mcpServers: arrayToMap(mcpServers),
  };
}

// =============================================================================
// Full Configuration Processing Pipeline
// =============================================================================

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
export function processConfig(
  userConfig: UnifiedConfig | null,
  workspaceConfig: UnifiedConfig | null,
): NormalizedConfig {
  // Start with empty config
  let config: UnifiedConfig = {};

  // Merge user config (if exists)
  if (userConfig) {
    const migratedUser = migrateLegacyFields(userConfig);
    config = mergeConfigs(config, migratedUser);
  }

  // Merge workspace config (takes precedence)
  if (workspaceConfig) {
    const migratedWorkspace = migrateLegacyFields(workspaceConfig);
    config = mergeConfigs(config, migratedWorkspace);
  }

  // Normalize to internal format
  return normalizeConfig(config);
}
