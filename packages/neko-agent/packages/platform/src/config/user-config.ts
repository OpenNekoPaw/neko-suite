/**
 * User Configuration Storage
 *
 * File-based storage (~/.neko/config.json) shared with CLI.
 * Uses shared configuration module from @neko/shared for unified format.
 */

import type { Provider, Model } from '../types/provider';
import type { MCPServerPreset } from '../types/config';
import type { UnifiedConfig } from '@neko/shared';
// Node.js config reader - direct import
import {
  readUserConfig as readUserConfigFile,
  writeUserConfig as writeUserConfigFile,
  watchUserConfig as watchUserConfigFile,
  getUserConfigPath,
} from '@neko/shared/config/config-reader';
import { ensureUserConfig } from './default-config';

/**
 * User configuration structure
 */
export interface UserConfig {
  /** Custom providers */
  providers: Provider[];
  /** Custom models */
  models: Model[];
  /** Custom MCP servers */
  mcpServers: MCPServerPreset[];
  /** Provider overrides (e.g., API keys) */
  providerOverrides: Record<string, Partial<Provider>>;
  /** Model overrides */
  modelOverrides: Record<string, Partial<Model>>;
  /** MCP server overrides */
  mcpServerOverrides: Record<string, Partial<MCPServerPreset>>;
}

const DEFAULT_USER_CONFIG: UserConfig = {
  providers: [],
  models: [],
  mcpServers: [],
  providerOverrides: {},
  modelOverrides: {},
  mcpServerOverrides: {},
};

// =============================================================================
// Conversion Utilities
// =============================================================================

/**
 * Convert unified config to user config
 */
function unifiedToUserConfig(unified: UnifiedConfig | null): UserConfig {
  if (!unified) {
    return { ...DEFAULT_USER_CONFIG };
  }

  return {
    providers: (unified.providers as Provider[]) ?? [],
    models: (unified.models as Model[]) ?? [],
    mcpServers: (unified.mcpServers as MCPServerPreset[]) ?? [],
    providerOverrides: (unified.providerOverrides as Record<string, Partial<Provider>>) ?? {},
    modelOverrides: (unified.modelOverrides as Record<string, Partial<Model>>) ?? {},
    mcpServerOverrides:
      (unified.mcpServerOverrides as Record<string, Partial<MCPServerPreset>>) ?? {},
  };
}

/**
 * Convert user config to unified config for saving.
 * Preserves scalar fields (defaultProvider, maxTokens, etc.) from the existing file.
 */
function userToUnifiedConfig(user: UserConfig): UnifiedConfig {
  // Read existing file to preserve scalar fields not managed by UserConfig
  const existing = readUserConfigFile() ?? {};

  return {
    ...existing,
    providers: user.providers,
    models: user.models,
    mcpServers: user.mcpServers,
    providerOverrides: user.providerOverrides,
    modelOverrides: user.modelOverrides,
    mcpServerOverrides: user.mcpServerOverrides,
  };
}

// =============================================================================
// User Config Manager Interface
// =============================================================================

/**
 * Interface for user config managers
 */
export interface IUserConfigManager {
  load(): UserConfig;
  save(config: UserConfig): Promise<void>;
  updateProviderOverride(providerId: string, override: Partial<Provider>): Promise<void>;
  addProvider(provider: Provider): Promise<void>;
  removeProvider(providerId: string): Promise<void>;
  addModel(model: Model): Promise<void>;
  removeModel(modelId: string): Promise<void>;
  updateMCPServerOverride(serverId: string, override: Partial<MCPServerPreset>): Promise<void>;
  addMCPServer(server: MCPServerPreset): Promise<void>;
  removeMCPServer(serverId: string): Promise<void>;
  clear(): Promise<void>;

  /** Load raw UnifiedConfig (includes scalar fields like temperature, maxTokens, etc.) */
  loadRaw(): UnifiedConfig;
  /** Update a single scalar field in the config file */
  updateScalar<K extends keyof UnifiedConfig>(key: K, value: UnifiedConfig[K]): Promise<void>;
  /** Update multiple scalar fields in the config file */
  updateScalars(updates: Partial<UnifiedConfig>): Promise<void>;
}

// =============================================================================
// File-based User Config Manager
// =============================================================================

/**
 * User config manager using file storage (~/.neko/config.json)
 *
 * This implementation reads from and writes to the unified config file,
 * allowing configuration to be shared with cli.
 *
 * On construction, ensures the default config file exists (first-run generation).
 */
export class FileUserConfigManager implements IUserConfigManager {
  private stopWatching: (() => void) | null = null;
  private cachedConfig: UserConfig | null = null;
  private onChangeCallback: ((config: UserConfig) => void) | null = null;

  constructor() {
    // Ensure default config exists on first run
    ensureUserConfig();

    // Initialize file watcher
    this.stopWatching = watchUserConfigFile((unified) => {
      this.cachedConfig = unifiedToUserConfig(unified);
      if (this.onChangeCallback) {
        this.onChangeCallback(this.cachedConfig);
      }
    });
  }

  /**
   * Set callback for config changes
   */
  onChange(callback: (config: UserConfig) => void): void {
    this.onChangeCallback = callback;
  }

  /**
   * Load user configuration from file
   */
  load(): UserConfig {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    const unified = readUserConfigFile();
    this.cachedConfig = unifiedToUserConfig(unified);
    return this.cachedConfig;
  }

  /**
   * Save user configuration to file
   */
  async save(config: UserConfig): Promise<void> {
    const unified = userToUnifiedConfig(config);
    writeUserConfigFile(unified);
    this.cachedConfig = config;
  }

  // ==========================================================================
  // Provider Methods
  // ==========================================================================

  async updateProviderOverride(providerId: string, override: Partial<Provider>): Promise<void> {
    const config = this.load();
    config.providerOverrides[providerId] = {
      ...config.providerOverrides[providerId],
      ...override,
    };
    await this.save(config);
  }

  async addProvider(provider: Provider): Promise<void> {
    const config = this.load();
    const existing = config.providers.findIndex((p) => p.id === provider.id);
    if (existing >= 0) {
      config.providers[existing] = provider;
    } else {
      config.providers.push(provider);
    }
    await this.save(config);
  }

  async removeProvider(providerId: string): Promise<void> {
    const config = this.load();
    config.providers = config.providers.filter((p) => p.id !== providerId);
    delete config.providerOverrides[providerId];
    await this.save(config);
  }

  // ==========================================================================
  // Model Methods
  // ==========================================================================

  async addModel(model: Model): Promise<void> {
    const config = this.load();
    const existing = config.models.findIndex((m) => m.id === model.id);
    if (existing >= 0) {
      config.models[existing] = model;
    } else {
      config.models.push(model);
    }
    await this.save(config);
  }

  async removeModel(modelId: string): Promise<void> {
    const config = this.load();
    config.models = config.models.filter((m) => m.id !== modelId);
    delete config.modelOverrides[modelId];
    await this.save(config);
  }

  // ==========================================================================
  // MCP Server Methods
  // ==========================================================================

  async updateMCPServerOverride(
    serverId: string,
    override: Partial<MCPServerPreset>,
  ): Promise<void> {
    const config = this.load();
    config.mcpServerOverrides[serverId] = {
      ...config.mcpServerOverrides[serverId],
      ...override,
    };
    await this.save(config);
  }

  async addMCPServer(server: MCPServerPreset): Promise<void> {
    const config = this.load();
    const existing = config.mcpServers.findIndex((s) => s.id === server.id);
    if (existing >= 0) {
      config.mcpServers[existing] = server;
    } else {
      config.mcpServers.push(server);
    }
    await this.save(config);
  }

  async removeMCPServer(serverId: string): Promise<void> {
    const config = this.load();
    config.mcpServers = config.mcpServers.filter((s) => s.id !== serverId);
    delete config.mcpServerOverrides[serverId];
    await this.save(config);
  }

  // ==========================================================================
  // Scalar Field Methods
  // ==========================================================================

  loadRaw(): UnifiedConfig {
    return readUserConfigFile() ?? {};
  }

  async updateScalar<K extends keyof UnifiedConfig>(
    key: K,
    value: UnifiedConfig[K],
  ): Promise<void> {
    const raw = this.loadRaw();
    (raw as Record<string, unknown>)[key] = value;
    writeUserConfigFile(raw);
  }

  async updateScalars(updates: Partial<UnifiedConfig>): Promise<void> {
    const raw = this.loadRaw();
    Object.assign(raw, updates);
    writeUserConfigFile(raw);
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  async clear(): Promise<void> {
    await this.save({ ...DEFAULT_USER_CONFIG });
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    if (this.stopWatching) {
      this.stopWatching();
      this.stopWatching = null;
    }
  }
}

// Re-export path utility for convenience
export { getUserConfigPath };
