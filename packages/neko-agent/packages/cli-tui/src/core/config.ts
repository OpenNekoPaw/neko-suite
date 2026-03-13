/**
 * Configuration Manager
 *
 * Thin wrapper over Platform ConfigManager for CLI use.
 * Handles env var API keys and CLI arg overrides, then maps
 * the merged Platform config into the CLIConfig read-only view.
 *
 * Priority (highest to lowest):
 * 1. Command line arguments
 * 2. Environment variables
 * 3. Platform ConfigManager (user + workspace merge)
 * 4. Default values
 */

import { ConfigManager, FileUserConfigManager, type ConfigManagerOptions } from '@neko/platform';
import type { CLIConfig } from './types';
import { DEFAULT_CLI_CONFIG } from './types';
// Config path utilities (Node.js only - re-exported for backward compat)
import {
  getUserConfigDir,
  getUserConfigPath,
  getWorkspaceConfigDir,
  getWorkspaceConfigPath,
  getConfigLocations,
  readUserConfig,
  readWorkspaceConfig,
} from '@neko/shared/config/config-reader.ts';

// Re-export path utilities for backward compatibility
export {
  getUserConfigDir,
  getUserConfigPath,
  getWorkspaceConfigDir,
  getWorkspaceConfigPath,
  getConfigLocations,
};

// Legacy aliases
export const getGlobalConfigDir = getUserConfigDir;
export const getGlobalConfigPath = getUserConfigPath;
export const getProjectConfigPath = getWorkspaceConfigPath;

// =============================================================================
// Environment Variable Handling
// =============================================================================

/** Well-known env var names per provider type */
const ENV_KEY_MAP: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  google: 'GOOGLE_API_KEY',
  azure: 'AZURE_OPENAI_API_KEY',
};

/**
 * Get API key from environment for a given provider ID or type.
 */
export function getApiKeyFromEnv(providerIdOrType: string): string | undefined {
  const envKey = ENV_KEY_MAP[providerIdOrType];
  if (envKey) {
    const val = process.env[envKey];
    if (val) return val;
  }
  // Generic fallback
  return process.env['NEKO_API_KEY'] ?? process.env['LLM_API_KEY'];
}

// =============================================================================
// ConfigManager Factory (shared across load/save)
// =============================================================================

/**
 * Create a ConfigManager for the given workDir.
 * Callers should dispose() when done if not long-lived.
 */
export function createConfigManager(workDir?: string): ConfigManager {
  const opts: ConfigManagerOptions = {
    userConfigManager: new FileUserConfigManager(),
    workspacePath: workDir,
  };
  return new ConfigManager(opts);
}

// =============================================================================
// Configuration Loading
// =============================================================================

/** Media generation capabilities used to identify media models */
const MEDIA_CAPABILITIES = new Set([
  'text_to_image',
  'image_to_image',
  'text_to_video',
  'image_to_video',
  'video_to_video',
  'text_to_audio',
  'text_to_music',
  'workflow',
  'image_generation',
  'video_generation',
]);

/**
 * Load CLI configuration.
 *
 * Creates a temporary ConfigManager, reads merged providers/models,
 * injects env var API keys, applies CLI arg overrides, and returns CLIConfig.
 */
export function loadConfig(
  workDir: string = process.cwd(),
  overrides: Partial<CLIConfig> = {},
): CLIConfig {
  const cm = createConfigManager(workDir);

  try {
    // Determine provider: override > first enabled provider with apiKey > default
    const providerId = overrides.provider ?? findDefaultProvider(cm) ?? DEFAULT_CLI_CONFIG.provider;
    const provider = cm.getProvider(providerId);
    const providerType = provider?.type ?? DEFAULT_CLI_CONFIG.providerType;

    // API key: env > config
    const envApiKey = getApiKeyFromEnv(providerId) ?? getApiKeyFromEnv(providerType);
    const apiKey = overrides.apiKey ?? envApiKey ?? provider?.apiKey;

    // Read scalar fields from raw UnifiedConfig (not UserConfig which lacks them)
    const rawUser = readUserConfig() ?? {};
    const rawWorkspace = readWorkspaceConfig(workDir) ?? {};

    // Model: override > defaultModel scalar > first enabled model for provider > default
    const model =
      overrides.model ??
      rawWorkspace.defaultModel ??
      rawUser.defaultModel ??
      findDefaultModel(cm, providerId) ??
      DEFAULT_CLI_CONFIG.model;

    // Base URL
    const baseUrl = overrides.baseUrl ?? provider?.apiUrl;

    // MCP servers → MCPServerConfig[]
    const mcpServers = cm.getEnabledMCPServers().map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description ?? '',
      category: s.category ?? ('other' as const),
      transport: s.transport ?? ('stdio' as const),
      command: s.command,
      args: s.args,
      env: s.env,
      enabled: s.enabled ?? true,
    }));

    // Media models
    const mediaModels = cm
      .getEnabledModels()
      .filter((m) => {
        const caps = m.capabilities ?? [];
        return caps.some((c) => MEDIA_CAPABILITIES.has(c as string));
      })
      .map((m) => m.id);

    // Workspace overrides user for scalars
    const maxTokens =
      overrides.maxTokens ??
      rawWorkspace.maxTokens ??
      rawUser.maxTokens ??
      DEFAULT_CLI_CONFIG.maxTokens;
    const temperature =
      overrides.temperature ??
      rawWorkspace.temperature ??
      rawUser.temperature ??
      DEFAULT_CLI_CONFIG.temperature;
    const skillsDir = overrides.skillsDir ?? rawWorkspace.skillsDir ?? rawUser.skillsDir;
    const thinkingBudget =
      rawWorkspace.thinkingBudget ?? rawUser.thinkingBudget ?? DEFAULT_CLI_CONFIG.thinkingBudget;

    const config: CLIConfig = {
      provider: providerId,
      providerType,
      model,
      mediaModels,
      apiKey,
      baseUrl,
      maxTokens,
      temperature,
      verbose: overrides.verbose ?? DEFAULT_CLI_CONFIG.verbose,
      workDir,
      mcpServers,
      skillsDir,
      outputFormat: overrides.outputFormat ?? DEFAULT_CLI_CONFIG.outputFormat,
      thinkingBudget,
    };

    return config;
  } finally {
    cm.dispose();
  }
}

/**
 * Find the first enabled provider that has an API key (env or config).
 */
function findDefaultProvider(cm: ConfigManager): string | undefined {
  for (const p of cm.getEnabledProviders()) {
    const envKey = getApiKeyFromEnv(p.id) ?? getApiKeyFromEnv(p.type);
    if (envKey ?? p.apiKey) return p.id;
  }
  return undefined;
}

/**
 * Find the first enabled model for a provider.
 */
function findDefaultModel(cm: ConfigManager, providerId: string): string | undefined {
  const models = cm.getModelsByProvider(providerId);
  const enabled = models.find((m) => m.enabled !== false);
  return enabled?.name ?? enabled?.id ?? models[0]?.name ?? models[0]?.id;
}

// =============================================================================
// Provider / Model Queries (delegate to ConfigManager)
// =============================================================================

/**
 * Provider info returned by listProviders / getProviderInfo.
 * Replaces the old ProviderConfig type.
 */
export interface ProviderInfo {
  id: string;
  name: string;
  displayName: string;
  type: string;
  apiUrl: string;
  hasApiKey: boolean;
  models: string[];
}

/**
 * List all enabled providers with their models.
 */
export function listProviders(workDir?: string): ProviderInfo[] {
  const cm = createConfigManager(workDir);
  try {
    return cm.getEnabledProviders().map((p) => {
      const models = cm.getModelsByProvider(p.id).map((m) => m.name ?? m.id);
      const envKey = getApiKeyFromEnv(p.id) ?? getApiKeyFromEnv(p.type);
      return {
        id: p.id,
        name: p.name,
        displayName: p.displayName ?? p.name,
        type: p.type,
        apiUrl: p.apiUrl,
        hasApiKey: Boolean(envKey ?? p.apiKey),
        models,
      };
    });
  } finally {
    cm.dispose();
  }
}

/**
 * Get available models for a provider.
 */
export function getProviderModels(providerId: string, workDir?: string): string[] {
  const cm = createConfigManager(workDir);
  try {
    return cm.getModelsByProvider(providerId).map((m) => m.name ?? m.id);
  } finally {
    cm.dispose();
  }
}

/**
 * List configured provider IDs.
 */
export function listConfiguredProviders(workDir?: string): string[] {
  const cm = createConfigManager(workDir);
  try {
    return cm.getProviders().map((p) => p.id);
  } finally {
    cm.dispose();
  }
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate configuration.
 */
export function validateConfig(config: CLIConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.apiKey) {
    errors.push(
      `API key not found for provider "${config.provider}". ` +
        `Set the appropriate environment variable (e.g. ANTHROPIC_API_KEY), ` +
        `use --api-key option, or configure in ~/.neko/config.json`,
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

  return { valid: errors.length === 0, errors };
}
