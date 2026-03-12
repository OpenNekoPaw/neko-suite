/**
 * Configuration Manager
 *
 * Providers/models: user config only (~/.neko/config.json).
 * MCP servers: user + workspace merge (.neko/config.json overrides by id).
 */

import type { Provider, Model } from '../types/provider';
import type { RetryTimeoutPreset, BuiltinPresetName } from '../types/error';
import type { MCPServerPreset } from '../types/config';
import type { ChatModelOption } from '@neko/shared';
import { type UserConfig, type IUserConfigManager } from './user-config';
import {
  loadWorkspaceConfig,
  watchWorkspaceConfig,
  type WorkspaceConfig,
} from './workspace-config';
import { RETRY_TIMEOUT_PRESETS } from './retry-timeout-presets';
import { ChatModelService } from './chat-model-service';
import {
  ConfigExportService,
  type ConfigExportData,
  type ConfigImportResult,
  type CustomProviderConfig,
} from './config-export-service';

/**
 * Merged configuration
 */
export interface MergedConfig {
  providers: Map<string, Provider>;
  models: Map<string, Model>;
  retryTimeoutPresets: Map<string, RetryTimeoutPreset>;
  mcpServers: Map<string, MCPServerPreset>;
}

/**
 * Configuration manager options
 */
export interface ConfigManagerOptions {
  userConfigManager?: IUserConfigManager;
  workspacePath?: string;
}

/**
 * ConfigManager - Unified configuration management
 *
 * - Providers/Models: user config only (~/.neko/config.json)
 * - MCP Servers: user + workspace merge (workspace overrides by id)
 */
export class ConfigManager {
  private userConfigManager: IUserConfigManager | null = null;
  private workspaceConfig: WorkspaceConfig | null = null;
  private workspacePath: string | null = null;
  private stopWatching: (() => void) | null = null;
  private configMerged = false;
  private cachedConfig: MergedConfig | null = null;

  // Merged data
  private providers: Map<string, Provider> = new Map();
  private models: Map<string, Model> = new Map();
  private mcpServers: Map<string, MCPServerPreset> = new Map();

  // Specialized services
  private readonly chatModelService = new ChatModelService();
  private readonly configExportService = new ConfigExportService();

  constructor(options: ConfigManagerOptions = {}) {
    this.userConfigManager = options.userConfigManager ?? null;

    if (options.workspacePath) {
      this.workspacePath = options.workspacePath;
      this.workspaceConfig = loadWorkspaceConfig(options.workspacePath);
      this.stopWatching = watchWorkspaceConfig(options.workspacePath, (config) => {
        this.workspaceConfig = config;
        this.invalidateCache();
      });
    }
  }

  /**
   * Get merged configuration
   */
  getConfig(): MergedConfig {
    this.ensureMerged();
    if (this.cachedConfig) {
      return this.cachedConfig;
    }
    this.cachedConfig = {
      providers: new Map(this.providers),
      models: new Map(this.models),
      retryTimeoutPresets: new Map(Object.entries(RETRY_TIMEOUT_PRESETS)),
      mcpServers: new Map(this.mcpServers),
    };
    return this.cachedConfig;
  }

  /**
   * Get user configuration (for extension layer)
   */
  getUserConfig(): UserConfig {
    return (
      this.userConfigManager?.load() ?? {
        providers: [],
        models: [],
        mcpServers: [],
        providerOverrides: {},
        modelOverrides: {},
        mcpServerOverrides: {},
      }
    );
  }

  // ==========================================================================
  // Provider Methods
  // ==========================================================================

  getProvider(id: string): Provider | undefined {
    this.ensureMerged();
    return this.providers.get(id);
  }

  getProviders(): Provider[] {
    this.ensureMerged();
    return Array.from(this.providers.values());
  }

  getEnabledProviders(): Provider[] {
    this.ensureMerged();
    return Array.from(this.providers.values()).filter((p) => p.enabled !== false);
  }

  async setProvider(provider: Provider): Promise<void> {
    this.ensureUserConfigManager();
    await this.userConfigManager!.addProvider(provider);
    this.invalidateCache();
  }

  async removeProvider(providerId: string): Promise<void> {
    this.ensureUserConfigManager();
    await this.userConfigManager!.removeProvider(providerId);
    this.invalidateCache();
  }

  async setProviderApiKey(providerId: string, apiKey: string): Promise<void> {
    this.ensureUserConfigManager();
    await this.userConfigManager!.updateProviderOverride(providerId, {
      apiKey,
    } as Partial<Provider>);
    this.invalidateCache();
  }

  async updateProviderOverride(providerId: string, override: Partial<Provider>): Promise<void> {
    this.ensureUserConfigManager();
    await this.userConfigManager!.updateProviderOverride(providerId, override);
    this.invalidateCache();
  }

  async removeProviderOverride(providerId: string): Promise<void> {
    this.ensureUserConfigManager();
    const config = this.userConfigManager!.load();
    delete config.providerOverrides[providerId];
    await this.userConfigManager!.save(config);
    this.invalidateCache();
  }

  // ==========================================================================
  // Model Methods
  // ==========================================================================

  getModel(id: string): Model | undefined {
    this.ensureMerged();
    return this.models.get(id);
  }

  getModels(): Model[] {
    this.ensureMerged();
    return Array.from(this.models.values());
  }

  getEnabledModels(): Model[] {
    this.ensureMerged();
    return Array.from(this.models.values()).filter((m) => m.enabled !== false);
  }

  getModelsByProvider(providerId: string): Model[] {
    this.ensureMerged();
    return Array.from(this.models.values()).filter((m) => m.providerId === providerId);
  }

  /**
   * Get chat model options for UI model selector
   * Returns a list of enabled models with 'auto' as the first option
   * Only includes models from providers with API key configured
   */
  getChatModelOptions(): ChatModelOption[] {
    this.ensureMerged();
    return this.chatModelService.getChatModelOptions(
      this.getEnabledProviders(),
      this.getEnabledModels(),
    );
  }

  async setModel(model: Model): Promise<void> {
    this.ensureUserConfigManager();
    await this.userConfigManager!.addModel(model);
    this.invalidateCache();
  }

  async removeModel(modelId: string): Promise<void> {
    this.ensureUserConfigManager();
    await this.userConfigManager!.removeModel(modelId);
    this.invalidateCache();
  }

  async updateModelOverride(modelId: string, override: Partial<Model>): Promise<void> {
    this.ensureUserConfigManager();
    const config = this.userConfigManager!.load();
    config.modelOverrides[modelId] = {
      ...config.modelOverrides[modelId],
      ...override,
    };
    await this.userConfigManager!.save(config);
    this.invalidateCache();
  }

  // ==========================================================================
  // MCP Server Methods
  // ==========================================================================

  getMCPServer(id: string): MCPServerPreset | undefined {
    this.ensureMerged();
    return this.mcpServers.get(id);
  }

  getMCPServers(): MCPServerPreset[] {
    this.ensureMerged();
    return Array.from(this.mcpServers.values());
  }

  getEnabledMCPServers(): MCPServerPreset[] {
    this.ensureMerged();
    return Array.from(this.mcpServers.values()).filter((s) => s.enabled !== false);
  }

  async setMCPServer(server: MCPServerPreset): Promise<void> {
    this.ensureUserConfigManager();
    await this.userConfigManager!.addMCPServer(server);
    this.invalidateCache();
  }

  async removeMCPServer(serverId: string): Promise<void> {
    this.ensureUserConfigManager();
    await this.userConfigManager!.removeMCPServer(serverId);
    this.invalidateCache();
  }

  async updateMCPServerOverride(
    serverId: string,
    override: Partial<MCPServerPreset>,
  ): Promise<void> {
    this.ensureUserConfigManager();
    await this.userConfigManager!.updateMCPServerOverride(serverId, override);
    this.invalidateCache();
  }

  // ==========================================================================
  // Retry/Timeout Preset Methods
  // ==========================================================================

  getRetryTimeoutPreset(name: BuiltinPresetName): RetryTimeoutPreset | undefined {
    return RETRY_TIMEOUT_PRESETS[name];
  }

  // ==========================================================================
  // Import/Export Methods
  // ==========================================================================

  exportConfig(options: { includeSecrets?: boolean } = {}): ConfigExportData {
    const config = this.getConfig();
    return this.configExportService.exportConfig(config.providers, config.models, options);
  }

  async importConfig(
    data: ConfigExportData,
    options: { overwrite?: boolean; includeSecrets?: boolean } = {},
  ): Promise<ConfigImportResult> {
    return this.configExportService.importConfig(data, this, options);
  }

  async addCustomProvider(config: CustomProviderConfig): Promise<ConfigImportResult> {
    return this.configExportService.addCustomProvider(config, this);
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  reloadConfig(): void {
    this.invalidateCache();
  }

  dispose(): void {
    if (this.stopWatching) {
      this.stopWatching();
      this.stopWatching = null;
    }
    this.configMerged = false;
    this.cachedConfig = null;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private invalidateCache(): void {
    this.configMerged = false;
    this.cachedConfig = null;
  }

  private ensureUserConfigManager(): void {
    if (!this.userConfigManager) {
      throw new Error('User config storage not available');
    }
  }

  /**
   * Merge user config + workspace MCP config into flat Maps.
   *
   * - Providers/Models: user config only (no workspace layer)
   * - MCP Servers: user + workspace merge (workspace overrides by id)
   */
  private ensureMerged(): void {
    if (this.configMerged) {
      return;
    }

    const userConfig = this.userConfigManager?.load();
    const workspace = this.workspaceConfig;

    // --- Providers (user only) ---
    this.providers.clear();
    this.mergeArrayToMap(this.providers, userConfig?.providers);
    this.applyOverrides(this.providers, userConfig?.providerOverrides);

    // --- Models (user only) ---
    this.models.clear();
    this.mergeArrayToMap(this.models, userConfig?.models);
    this.applyOverrides(this.models, userConfig?.modelOverrides);

    // --- MCP Servers (user + workspace) ---
    this.mcpServers.clear();
    this.mergeArrayToMap(this.mcpServers, userConfig?.mcpServers);
    this.applyOverrides(this.mcpServers, userConfig?.mcpServerOverrides);
    this.mergeArrayToMap(this.mcpServers, workspace?.mcpServers);
    this.applyOverrides(this.mcpServers, workspace?.mcpServerOverrides);

    // Substitute workspace path in MCP server configurations
    this.substituteMCPWorkspacePath();

    this.configMerged = true;
  }

  /**
   * Merge an array of items into a Map by id.
   * Items with existing ids are fully replaced.
   */
  private mergeArrayToMap<T extends { id: string }>(target: Map<string, T>, items?: T[]): void {
    if (!items) return;
    for (const item of items) {
      target.set(item.id, { ...item });
    }
  }

  /**
   * Apply overrides to existing items in the Map.
   * Only modifies items that already exist.
   */
  private applyOverrides<T extends { id: string }>(
    target: Map<string, T>,
    overrides?: Record<string, Partial<T>>,
  ): void {
    if (!overrides) return;
    for (const [id, override] of Object.entries(overrides)) {
      const existing = target.get(id);
      if (existing) {
        target.set(id, { ...existing, ...override });
      }
    }
  }

  /**
   * Substitute ${workspaceFolder} placeholder in MCP server configurations.
   */
  private substituteMCPWorkspacePath(): void {
    if (!this.workspacePath) return;

    this.mcpServers.forEach((server, id) => {
      if (!server.args) return;
      const updatedArgs = server.args.map((arg) =>
        arg.replace(/\$\{workspaceFolder\}/g, this.workspacePath!),
      );
      this.mcpServers.set(id, { ...server, args: updatedArgs });
    });
  }
}
