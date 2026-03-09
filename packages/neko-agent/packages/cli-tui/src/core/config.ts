/**
 * Configuration Manager
 *
 * Handles loading and saving CLI configuration from:
 * 1. Environment variables
 * 2. Config file (~/.neko/config.json) - User global config
 * 3. Project config (.neko/config.json) - Workspace config
 * 4. Command line arguments
 *
 * Config file locations:
 * - User: ~/.neko/config.json
 * - Workspace: .neko/config.json (in current working directory)
 *
 * Priority (highest to lowest):
 * 1. Command line arguments
 * 2. Environment variables
 * 3. Workspace config (.neko/config.json)
 * 4. User config (~/.neko/config.json)
 * 5. Default values
 *
 * Uses shared configuration module from @neko/shared for unified
 * configuration format with platform package.
 */

import * as fs from 'node:fs';
import type { CLIConfig, ProviderConfig } from './types';
import { DEFAULT_CLI_CONFIG, PROVIDERS } from './types';
// Config processing (browser-safe)
import { migrateLegacyFields, mergeConfigs, type UnifiedConfig } from '@neko/shared';
// Config reading (Node.js only - direct import)
import {
  getUserConfigDir,
  getUserConfigPath,
  getWorkspaceConfigDir,
  getWorkspaceConfigPath,
  getConfigLocations,
  readUserConfig,
  readWorkspaceConfig,
  readConfigFile,
  writeUserConfig as writeUserConfigFile,
  writeWorkspaceConfig as writeWorkspaceConfigFile,
} from '@neko/shared/config/config-reader.ts';

// Re-export path utilities for backward compatibility
export {
  getUserConfigDir,
  getUserConfigPath,
  getWorkspaceConfigDir,
  getWorkspaceConfigPath,
  getConfigLocations,
};

// Legacy aliases for backward compatibility
export const getGlobalConfigDir = getUserConfigDir;
export const getGlobalConfigPath = getUserConfigPath;
export const getProjectConfigPath = getWorkspaceConfigPath;

// =============================================================================
// Internal Types
// =============================================================================

/**
 * Provider configuration in legacy config file format
 */
interface LegacyProviderConfigFile {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  models?: (string | { id: string; name?: string })[];
}

// =============================================================================
// Environment Variable Handling
// =============================================================================

/**
 * Get API key from environment
 */
function getApiKeyFromEnv(provider: string): string | undefined {
  const providerConfig = PROVIDERS[provider];
  if (providerConfig) {
    return process.env[providerConfig.envKey];
  }
  // Fallback to generic key
  return process.env['NEKO_API_KEY'] ?? process.env['LLM_API_KEY'];
}

// =============================================================================
// Provider Configuration Helpers
// =============================================================================

/**
 * Get provider config from unified config (supports both array and legacy object format)
 */
function getProviderFromUnifiedConfig(
  providerId: string,
  config: UnifiedConfig | null,
): { apiKey?: string; baseUrl?: string; defaultModel?: string } | undefined {
  if (!config) return undefined;

  // New array format
  if (Array.isArray(config.providers)) {
    const provider = config.providers.find((p) => p.id === providerId);
    if (provider) {
      return {
        apiKey: provider.apiKey,
        baseUrl: provider.apiUrl,
        defaultModel: undefined, // Models are separate in new format
      };
    }
  }

  // Legacy object format (providers as Record<string, LegacyProviderConfigFile>)
  const legacyProviders = config.providers as unknown as
    | Record<string, LegacyProviderConfigFile>
    | undefined;
  if (legacyProviders && !Array.isArray(legacyProviders)) {
    const legacyProvider = legacyProviders[providerId];
    if (legacyProvider) {
      return {
        apiKey: legacyProvider.apiKey,
        baseUrl: legacyProvider.baseUrl,
        defaultModel: legacyProvider.defaultModel,
      };
    }
  }

  return undefined;
}

/**
 * Get default model for a provider from config
 */
function getDefaultModelFromConfig(
  providerId: string,
  config: UnifiedConfig | null,
): string | undefined {
  if (!config) return undefined;

  // Check models array for provider's models
  if (Array.isArray(config.models)) {
    const providerModels = config.models.filter((m) => m.providerId === providerId);
    // Return first enabled model or first model
    const enabledModel = providerModels.find((m) => m.enabled !== false);
    if (enabledModel) return enabledModel.id;
    if (providerModels.length > 0) return providerModels[0]?.id;
  }

  // Check legacy provider config
  const providerConfig = getProviderFromUnifiedConfig(providerId, config);
  if (providerConfig?.defaultModel) {
    return providerConfig.defaultModel;
  }

  return undefined;
}

/**
 * Get default model for a provider (from config or built-in)
 */
function getDefaultModelForProvider(
  provider: string,
  workspaceConfig: UnifiedConfig | null,
  userConfig: UnifiedConfig | null,
): string | undefined {
  // Try workspace config first
  const workspaceModel = getDefaultModelFromConfig(provider, workspaceConfig);
  if (workspaceModel) return workspaceModel;

  // Try user config
  const userModel = getDefaultModelFromConfig(provider, userConfig);
  if (userModel) return userModel;

  // Fall back to built-in default
  return PROVIDERS[provider]?.defaultModel;
}

// =============================================================================
// Configuration Loading
// =============================================================================

/**
 * Convert unified config to CLI config
 */
function unifiedToCliConfig(
  unified: UnifiedConfig,
  workDir: string,
  userConfig: UnifiedConfig | null,
  workspaceConfig: UnifiedConfig | null,
): CLIConfig {
  const provider = unified.defaultProvider ?? unified.provider ?? DEFAULT_CLI_CONFIG.provider;

  // Get provider-specific config
  const workspaceProviderConfig = getProviderFromUnifiedConfig(provider, workspaceConfig);
  const userProviderConfig = getProviderFromUnifiedConfig(provider, userConfig);

  // Get API key: env > workspace config > user config > legacy top-level
  const envApiKey = getApiKeyFromEnv(provider);
  const apiKey =
    envApiKey ?? workspaceProviderConfig?.apiKey ?? userProviderConfig?.apiKey ?? unified.apiKey;

  // Get base URL: workspace config > user config > built-in
  const baseUrl =
    workspaceProviderConfig?.baseUrl ??
    userProviderConfig?.baseUrl ??
    unified.baseUrl ??
    PROVIDERS[provider]?.baseUrl;

  // Get model
  const model =
    unified.defaultModel ??
    unified.model ??
    getDefaultModelForProvider(provider, workspaceConfig, userConfig) ??
    DEFAULT_CLI_CONFIG.model;

  // Convert MCP servers
  const mcpServers =
    unified.mcpServers?.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description ?? '',
      category: s.category ?? ('other' as const),
      transport: s.transport ?? ('stdio' as const),
      command: s.command,
      args: s.args,
      env: s.env,
      enabled: s.enabled ?? true,
    })) ?? [];

  return {
    provider,
    model,
    apiKey,
    baseUrl,
    maxTokens: unified.maxTokens ?? DEFAULT_CLI_CONFIG.maxTokens,
    temperature: unified.temperature ?? DEFAULT_CLI_CONFIG.temperature,
    verbose: unified.verbose ?? DEFAULT_CLI_CONFIG.verbose,
    workDir,
    mcpServers,
    skillsDir: unified.skillsDir,
    outputFormat: unified.outputFormat ?? DEFAULT_CLI_CONFIG.outputFormat,
  };
}

/**
 * Load CLI configuration
 *
 * Priority (highest to lowest):
 * 1. Command line arguments (passed as overrides)
 * 2. Environment variables
 * 3. Workspace config (.neko/config.json)
 * 4. User config (~/.neko/config.json)
 * 5. Default values
 */
export function loadConfig(
  workDir: string = process.cwd(),
  overrides: Partial<CLIConfig> = {},
): CLIConfig {
  // Read config files using shared module
  const userConfig = readUserConfig();
  const workspaceConfig = readWorkspaceConfig(workDir);

  // Migrate legacy fields
  const migratedUser = userConfig ? migrateLegacyFields(userConfig) : null;
  const migratedWorkspace = workspaceConfig ? migrateLegacyFields(workspaceConfig) : null;

  // Merge configs (workspace takes precedence over user)
  let mergedConfig: UnifiedConfig = {};
  if (migratedUser) {
    mergedConfig = mergeConfigs(mergedConfig, migratedUser);
  }
  if (migratedWorkspace) {
    mergedConfig = mergeConfigs(mergedConfig, migratedWorkspace);
  }

  // Convert to CLI config
  let config = unifiedToCliConfig(mergedConfig, workDir, migratedUser, migratedWorkspace);

  // Determine final provider (may be overridden)
  const finalProvider = overrides.provider ?? config.provider;

  // Re-fetch provider-specific config for final provider
  if (finalProvider !== config.provider) {
    const workspaceProviderConfig = getProviderFromUnifiedConfig(finalProvider, migratedWorkspace);
    const userProviderConfig = getProviderFromUnifiedConfig(finalProvider, migratedUser);

    // Update API key for new provider
    const envApiKey = getApiKeyFromEnv(finalProvider);
    config.apiKey =
      envApiKey ?? workspaceProviderConfig?.apiKey ?? userProviderConfig?.apiKey ?? config.apiKey;

    // Update base URL for new provider
    config.baseUrl =
      workspaceProviderConfig?.baseUrl ??
      userProviderConfig?.baseUrl ??
      PROVIDERS[finalProvider]?.baseUrl ??
      config.baseUrl;

    // Update model for new provider
    const defaultModel = getDefaultModelForProvider(finalProvider, migratedWorkspace, migratedUser);
    if (defaultModel) {
      config.model = defaultModel;
    }
  }

  // Apply overrides (command line arguments)
  if (overrides.provider !== undefined) config.provider = overrides.provider;
  if (overrides.model !== undefined) config.model = overrides.model;
  if (overrides.apiKey !== undefined) config.apiKey = overrides.apiKey;
  if (overrides.baseUrl !== undefined) config.baseUrl = overrides.baseUrl;
  if (overrides.maxTokens !== undefined) config.maxTokens = overrides.maxTokens;
  if (overrides.temperature !== undefined) config.temperature = overrides.temperature;
  if (overrides.verbose !== undefined) config.verbose = overrides.verbose;
  if (overrides.outputFormat !== undefined) config.outputFormat = overrides.outputFormat;
  if (overrides.skillsDir !== undefined) config.skillsDir = overrides.skillsDir;

  // Re-check API key after provider override
  if (overrides.provider && !overrides.apiKey) {
    const newEnvKey = getApiKeyFromEnv(overrides.provider);
    if (newEnvKey) {
      config.apiKey = newEnvKey;
    }
  }

  return config;
}

// =============================================================================
// Configuration Saving
// =============================================================================

/**
 * Save config to user config file (~/.neko/config.json)
 */
export function saveUserConfig(config: Partial<UnifiedConfig>): void {
  const existingConfig = readUserConfig() ?? {};
  const newConfig = mergeConfigs(existingConfig, config);
  writeUserConfigFile(newConfig);
}

// Legacy alias
export const saveGlobalConfig = saveUserConfig;

/**
 * Save config to workspace config file (.neko/config.json)
 */
export function saveWorkspaceConfig(workDir: string, config: Partial<UnifiedConfig>): void {
  const existingConfig = readWorkspaceConfig(workDir) ?? {};
  const newConfig = mergeConfigs(existingConfig, config);
  writeWorkspaceConfigFile(workDir, newConfig);
}

// =============================================================================
// Provider Configuration
// =============================================================================

/**
 * Set provider configuration in user config (new unified format)
 */
export function setProviderConfig(
  providerId: string,
  config: { apiKey?: string; baseUrl?: string },
): void {
  const existingConfig = readUserConfig() ?? {};
  const providers = existingConfig.providers ?? [];

  // Find existing provider or create new one
  const existingIndex = providers.findIndex((p) => p.id === providerId);

  if (existingIndex >= 0) {
    // Update existing provider
    const existing = providers[existingIndex];
    if (existing) {
      if (config.apiKey !== undefined) existing.apiKey = config.apiKey;
      if (config.baseUrl !== undefined) existing.apiUrl = config.baseUrl;
    }
  } else {
    // Add new provider
    providers.push({
      id: providerId,
      name: providerId,
      displayName: providerId.charAt(0).toUpperCase() + providerId.slice(1),
      type: inferProviderType(providerId),
      apiUrl: config.baseUrl ?? getDefaultApiUrl(providerId),
      apiKey: config.apiKey,
      enabled: true,
    });
  }

  saveUserConfig({ providers });
}

/**
 * Set provider API key in user config
 */
export function setProviderApiKey(provider: string, apiKey: string, baseUrl?: string): void {
  setProviderConfig(provider, {
    apiKey,
    ...(baseUrl ? { baseUrl } : {}),
  });
}

/**
 * Add model to provider in user config
 */
export function addProviderModel(
  providerId: string,
  model: string | { id: string; name?: string },
): void {
  const existingConfig = readUserConfig() ?? {};
  const models = existingConfig.models ?? [];

  const modelId = typeof model === 'string' ? model : model.id;
  const modelName = typeof model === 'string' ? model : (model.name ?? model.id);

  // Check if model already exists
  const exists = models.some((m) => m.id === modelId);

  if (!exists) {
    models.push({
      id: modelId,
      name: modelId,
      displayName: modelName,
      providerId,
      capabilities: ['chat'],
      enabled: true,
    });
    saveUserConfig({ models });
  }
}

/**
 * Set default model for provider in user config
 */
export function setProviderDefaultModel(providerId: string, modelId: string): void {
  // In unified format, we set defaultModel at top level
  // and ensure the model exists
  addProviderModel(providerId, modelId);
  saveUserConfig({ defaultModel: modelId });
}

// =============================================================================
// Provider Queries
// =============================================================================

/**
 * Get available models for a provider
 */
export function getProviderModels(providerId: string, workDir: string = process.cwd()): string[] {
  const userConfig = readUserConfig();
  const workspaceConfig = readWorkspaceConfig(workDir);

  // Get models from unified config
  const allModels: string[] = [];

  // Check workspace config models
  if (workspaceConfig?.models) {
    const providerModels = workspaceConfig.models
      .filter((m) => m.providerId === providerId)
      .map((m) => m.id);
    allModels.push(...providerModels);
  }

  // Check user config models
  if (userConfig?.models) {
    const providerModels = userConfig.models
      .filter((m) => m.providerId === providerId)
      .map((m) => m.id);
    for (const modelId of providerModels) {
      if (!allModels.includes(modelId)) {
        allModels.push(modelId);
      }
    }
  }

  // Check legacy provider config
  const legacyWorkspace = getProviderFromUnifiedConfig(providerId, workspaceConfig);
  const legacyUser = getProviderFromUnifiedConfig(providerId, userConfig);

  // Legacy format had models in provider config
  // This is handled by migrateLegacyFields, but we check raw config for backward compat

  // Fall back to built-in models if no config
  if (allModels.length === 0) {
    return PROVIDERS[providerId]?.models ?? [];
  }

  return allModels;
}

/**
 * Get provider configuration
 */
export function getProviderConfig(providerId: string): ProviderConfig | undefined {
  return PROVIDERS[providerId];
}

/**
 * List available providers
 */
export function listProviders(): ProviderConfig[] {
  return Object.values(PROVIDERS);
}

/**
 * List configured providers (from config files)
 */
export function listConfiguredProviders(workDir: string = process.cwd()): string[] {
  const userConfig = readUserConfig();
  const workspaceConfig = readWorkspaceConfig(workDir);

  const providers = new Set<string>();

  // Add built-in providers
  Object.keys(PROVIDERS).forEach((p) => providers.add(p));

  // Add configured providers from unified format
  if (userConfig?.providers) {
    for (const p of userConfig.providers) {
      providers.add(p.id);
    }
  }
  if (workspaceConfig?.providers) {
    for (const p of workspaceConfig.providers) {
      providers.add(p.id);
    }
  }

  return Array.from(providers);
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate configuration
 */
export function validateConfig(config: CLIConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.apiKey) {
    const providerConfig = PROVIDERS[config.provider];
    const envKey = providerConfig?.envKey ?? 'NEKO_API_KEY';
    errors.push(
      `API key not found for provider "${config.provider}". ` +
        `Set ${envKey} environment variable, use --api-key option, ` +
        `or configure in ~/.neko/config.json`,
    );
  }

  // Custom providers don't need to be in PROVIDERS
  // Just warn if using unknown provider without baseUrl
  if (!PROVIDERS[config.provider] && !config.baseUrl) {
    errors.push(
      `Unknown provider "${config.provider}" requires baseUrl. ` +
        `Configure baseUrl in ~/.neko/config.json or use --base-url option.`,
    );
  }

  if (!config.model) {
    errors.push('Model is required. Use --model option or configure in config file.');
  }

  if (config.temperature < 0 || config.temperature > 2) {
    errors.push(`Temperature must be between 0 and 2, got ${config.temperature}.`);
  }

  if (!Number.isInteger(config.maxTokens) || config.maxTokens <= 0) {
    errors.push(`maxTokens must be a positive integer, got ${config.maxTokens}.`);
  }

  const validFormats = ['text', 'json', 'markdown'];
  if (!validFormats.includes(config.outputFormat)) {
    errors.push(
      `outputFormat must be one of ${validFormats.join(', ')}, got "${config.outputFormat}".`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Infer provider type from name
 */
function inferProviderType(
  name: string,
): 'anthropic' | 'openai' | 'google' | 'azure' | 'ollama' | 'generic' {
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
