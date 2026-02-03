/**
 * Generic Config Service
 *
 * Integrates the platform configuration system with the VS Code extension.
 * Provides a thin wrapper over Platform ConfigManager for extension-specific needs.
 *
 * Uses the Platform API (ConfigManager) for all business logic.
 */

import * as vscode from 'vscode';
import type { Platform, ConfigManager, ConfigExportData, ConfigImportResult } from '@uniedit/platform';
import { VSCodeConfigStorage, createConfigWatcher } from './vscodeConfigStorage';

/**
 * Merged model config (simplified view for UI)
 */
export interface IMergedModelConfig {
  id: string;
  name: string;
  description?: string;
  category: string;
  icon?: string;
  capabilities?: string[];
  isConfigured: boolean;
  enabled: boolean;
  baseUrl?: string;
  website?: string;
  userConfig?: {
    apiKey?: string;
    baseUrl?: string;
  };
}

/**
 * Generic configuration service for the extension
 * Thin wrapper over Platform ConfigManager
 */
export class GenericConfigService implements vscode.Disposable {
  private configManager: ConfigManager;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private context: vscode.ExtensionContext,
    private platform: Platform
  ) {
    this.configManager = platform.config;

    // Watch for config changes
    const watcher = createConfigWatcher(() => this.reload());
    this.disposables.push(watcher);
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    this.configManager.reloadConfig();
  }

  /**
   * Reload configurations
   */
  async reload(): Promise<void> {
    // Configuration reloaded
  }

  /**
   * Get all available model configurations
   */
  getAllModels(): IMergedModelConfig[] {
    const config = this.configManager.getConfig();
    const models: IMergedModelConfig[] = [];

    for (const [id, model] of config.models) {
      const provider = config.providers.get(model.providerId);
      const isConfigured = !!(provider?.apiKey);

      models.push({
        id,
        name: model.name,
        description: undefined,
        category: 'chat',
        capabilities: model.capabilities as string[],
        isConfigured,
        enabled: model.enabled !== false,
        baseUrl: provider?.apiUrl,
      });
    }

    return models;
  }

  /**
   * Get model configuration by ID
   */
  getModel(id: string): IMergedModelConfig | undefined {
    const config = this.configManager.getConfig();
    const model = config.models.get(id);

    if (!model) {
      return undefined;
    }

    const provider = config.providers.get(model.providerId);
    const isConfigured = !!(provider?.apiKey);

    return {
      id,
      name: model.name,
      description: undefined,
      category: 'chat',
      capabilities: model.capabilities as string[],
      isConfigured,
      enabled: model.enabled !== false,
      baseUrl: provider?.apiUrl,
    };
  }

  /**
   * Get configured (ready to use) models
   */
  getConfiguredModels(): IMergedModelConfig[] {
    return this.getAllModels().filter(m => m.isConfigured);
  }

  /**
   * Get enabled models
   */
  getEnabledModels(): IMergedModelConfig[] {
    return this.getAllModels().filter(m => m.enabled && m.isConfigured);
  }

  /**
   * Configure a model with API key (delegates to Platform)
   */
  async configureModel(modelId: string, apiKey: string, baseUrl?: string): Promise<void> {
    const config = this.configManager.getConfig();
    const model = config.models.get(modelId);

    if (model) {
      await this.configManager.updateProviderOverride(model.providerId, {
        apiKey,
        apiUrl: baseUrl,
        enabled: true,
      });
    }
  }

  /**
   * Enable/disable a model (delegates to Platform)
   */
  async setModelEnabled(modelId: string, enabled: boolean): Promise<void> {
    await this.configManager.updateModelOverride(modelId, { enabled });
  }

  /**
   * Remove model configuration (delegates to Platform)
   */
  async removeModelConfig(modelId: string): Promise<void> {
    const config = this.configManager.getConfig();
    const model = config.models.get(modelId);

    if (model) {
      await this.configManager.removeProviderOverride(model.providerId);
    }
  }

  // -------------------------------------------------------------------------
  // Import/Export Methods (delegate to Platform)
  // -------------------------------------------------------------------------

  /**
   * Export configuration (without secrets) as JSON string
   */
  exportConfig(): string {
    const data = this.configManager.exportConfig({ includeSecrets: false });
    return JSON.stringify(data, null, 2);
  }

  /**
   * Export configuration with secrets as JSON string
   */
  exportConfigWithSecrets(): string {
    const data = this.configManager.exportConfig({ includeSecrets: true });
    return JSON.stringify(data, null, 2);
  }

  /**
   * Import configuration from JSON string (delegates to Platform)
   */
  async importConfig(
    jsonString: string,
    options: { overwrite?: boolean; includeSecrets?: boolean } = {}
  ): Promise<{ success: boolean; message: string }> {
    try {
      const data: ConfigExportData = JSON.parse(jsonString);
      const result = await this.configManager.importConfig(data, options);
      return { success: result.success, message: result.message };
    } catch (error) {
      return {
        success: false,
        message: `Failed to parse configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Add a custom model configuration (delegates to Platform)
   */
  async addCustomModel(configJson: string, apiKey?: string): Promise<{ success: boolean; message: string }> {
    try {
      const customConfig = JSON.parse(configJson);
      const result = await this.configManager.addCustomProvider({
        id: customConfig.id,
        name: customConfig.name,
        displayName: customConfig.displayName,
        type: customConfig.type || 'generic',
        baseUrl: customConfig.baseUrl,
        apiKey,
      });
      return { success: result.success, message: result.message };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to add custom model',
      };
    }
  }

  // -------------------------------------------------------------------------
  // Disposal
  // -------------------------------------------------------------------------

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}

/**
 * Create and initialize the generic config service
 */
export async function createGenericConfigService(
  context: vscode.ExtensionContext,
  platform: Platform
): Promise<GenericConfigService> {
  const service = new GenericConfigService(context, platform);
  await service.initialize();
  return service;
}
