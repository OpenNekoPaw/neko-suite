/**
 * Platform Bootstrap for CLI
 *
 * Creates a Platform instance configured for CLI/TUI use.
 * Handles env var API key injection since Platform's ConfigManager
 * only reads from config files.
 */

import {
  createPlatform,
  FileUserConfigManager,
  toSharedService,
  type Platform,
} from '@neko/platform';
import type { IService, IToolRegistry } from '@neko/shared';

// Well-known env var names per provider
const ENV_KEY_MAP: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
};

export interface CLIPlatformOptions {
  workspacePath?: string;
  toolRegistry: IToolRegistry;
}

export interface CLIPlatformResult {
  platform: Platform;
  service: IService;
}

/**
 * Collect API keys from environment variables for known providers.
 */
function collectEnvApiKeys(): Record<string, string> {
  const keys: Record<string, string> = {};
  for (const [providerId, envKey] of Object.entries(ENV_KEY_MAP)) {
    const value = process.env[envKey];
    if (value) {
      keys[providerId] = value;
    }
  }
  // Generic fallback keys
  const generic = process.env['NEKO_API_KEY'] ?? process.env['LLM_API_KEY'];
  if (generic) {
    keys['_generic'] = generic;
  }
  return keys;
}

/**
 * Create a Platform instance for CLI use.
 *
 * - Initializes FileUserConfigManager for ~/.neko/config.json
 * - Injects env var API keys at runtime (not persisted to disk)
 * - Returns an IService ready for AgentSession
 */
export function createCLIPlatform(options: CLIPlatformOptions): CLIPlatformResult {
  const userConfigManager = new FileUserConfigManager();

  const platform = createPlatform({
    userConfigManager,
    workspacePath: options.workspacePath,
    toolRegistry: options.toolRegistry,
  });

  // Inject env var API keys at runtime (not persisted)
  const envKeys = collectEnvApiKeys();
  for (const [providerId, apiKey] of Object.entries(envKeys)) {
    if (providerId === '_generic') continue;
    const provider = platform.config.getProvider(providerId);
    if (provider && !provider.apiKey) {
      platform.config.setRuntimeProviderOverride(providerId, { apiKey });
    }
  }

  // Apply generic key to any provider still missing an API key
  const genericKey = envKeys['_generic'];
  if (genericKey) {
    for (const provider of platform.config.getEnabledProviders()) {
      if (!provider.apiKey) {
        platform.config.setRuntimeProviderOverride(provider.id, {
          apiKey: genericKey,
        });
      }
    }
  }

  const service = toSharedService(platform.createService());
  return { platform, service };
}
