/**
 * Provider Manager
 *
 * Manages AI provider configurations using the Platform API.
 * Provides a UI-friendly interface for provider management.
 */

import * as vscode from 'vscode';
import type { Platform } from '@neko/platform';
import { ProviderConfig, ConfiguredProvider, ProviderInfo } from './types';

/**
 * Provider Manager using Platform API
 */
export class ProviderManager {
  private readonly _platform: Platform;

  constructor(_context: vscode.ExtensionContext, platform: Platform) {
    this._platform = platform;
  }

  /**
   * Get all available providers from config
   */
  getAllProviders(): ProviderInfo[] {
    const config = this._platform.config.getConfig();
    const providers = Array.from(config.providers.values());
    const models = Array.from(config.models.values());

    return providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      type: provider.type,
      models: models
        .filter((m) => m.providerId === provider.id)
        .map((m) => ({
          id: m.id,
          name: m.name,
          enabled: m.enabled !== false,
        })),
      enabled: provider.enabled !== false,
    }));
  }

  /**
   * Get configured providers with API keys
   */
  getConfiguredProviders(): ConfiguredProvider[] {
    const config = this._platform.config.getConfig();
    const userConfig = this._platform.config.getUserConfig();
    const providers = Array.from(config.providers.values());
    const models = Array.from(config.models.values());

    return providers
      .filter((p) => {
        const override = userConfig.providerOverrides[p.id];
        // Provider is configured if it has apiKey from override or from merged config
        return override?.apiKey || p.apiKey;
      })
      .map((provider) => {
        const override = userConfig.providerOverrides[provider.id] || {};
        return {
          id: provider.id,
          type: provider.type,
          name: provider.name,
          enabled: provider.enabled !== false,
          apiKey: override.apiKey || provider.apiKey,
          baseUrl: override.apiUrl || provider.apiUrl,
          models: models
            .filter((m) => m.providerId === provider.id)
            .map((m) => ({
              id: m.id,
              name: m.name,
              enabled: m.enabled !== false,
            })),
        };
      });
  }

  /**
   * Get the default provider
   */
  getDefaultProvider():
    | { id: string; isConfigured: boolean; getDefaultModel: () => string }
    | undefined {
    const config = this._platform.config.getConfig();
    const providers = Array.from(config.providers.values());
    const models = Array.from(config.models.values());

    // Find an enabled provider that has an API key configured
    const provider = providers.find((p) => {
      if (p.enabled === false) return false;
      return !!p.apiKey;
    });

    if (!provider) return undefined;

    const providerModels = models.filter(
      (m) => m.providerId === provider.id && m.enabled !== false,
    );
    const defaultModel = providerModels[0]?.id || '';

    return {
      id: provider.id,
      isConfigured: true,
      getDefaultModel: () => defaultModel,
    };
  }

  /**
   * Get provider by ID
   */
  getProvider(
    providerId: string,
  ): { id: string; isConfigured: boolean; getDefaultModel: () => string } | undefined {
    const config = this._platform.config.getConfig();
    const provider = config.providers.get(providerId);

    if (!provider) return undefined;

    const isConfigured = !!provider.apiKey;

    const models = Array.from(config.models.values()).filter((m) => m.providerId === provider.id);
    const defaultModel = models[0]?.id || '';

    return {
      id: provider.id,
      isConfigured,
      getDefaultModel: () => defaultModel,
    };
  }

  /**
   * Add or update a provider configuration
   */
  async addProvider(model: ProviderConfig): Promise<{ success: boolean; error?: string }> {
    try {
      await this._platform.config.updateProviderOverride(model.type, {
        apiKey: model.apiKey,
        apiUrl: model.baseUrl,
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Remove a provider configuration
   */
  async removeProvider(providerType: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this._platform.config.removeProviderOverride(providerType);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Toggle provider enabled state
   */
  async toggleProvider(providerType: string, enabled: boolean): Promise<void> {
    await this._platform.config.updateProviderOverride(providerType, { enabled });
  }

  /**
   * Toggle model enabled state
   */
  async toggleModel(_providerType: string, modelId: string, enabled: boolean): Promise<void> {
    await this._platform.config.updateModelOverride(modelId, { enabled });
  }
}
