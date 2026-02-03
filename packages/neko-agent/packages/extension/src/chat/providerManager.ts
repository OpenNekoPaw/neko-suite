/**
 * Provider Manager
 *
 * Manages AI provider configurations using the new Platform API.
 * Provides a UI-friendly interface for provider management.
 */

import * as vscode from 'vscode';
import type { Platform } from '@uniedit/platform';
import { getBuiltinProviderTemplates } from '@uniedit/platform';
import type { ProviderTemplate } from '@uniedit/shared';
import { ProviderConfig, ConfiguredProvider, ProviderInfo, ProviderTemplateInfo } from './types';

/**
 * Provider Manager using new Platform API
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

    return providers.map(provider => ({
      id: provider.id,
      name: provider.name,
      type: provider.type,
      models: models
        .filter(m => m.providerId === provider.id)
        .map(m => ({
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
      .filter(p => {
        const override = userConfig.providerOverrides[p.id];
        // Provider is configured if it has apiKey from override or from merged config
        return override?.apiKey || p.apiKey;
      })
      .map(provider => {
        const override = userConfig.providerOverrides[provider.id] || {};
        return {
          id: provider.id,
          type: provider.type,
          name: provider.name,
          enabled: provider.enabled !== false,
          apiKey: override.apiKey || provider.apiKey,
          baseUrl: override.apiUrl || provider.apiUrl,
          models: models
            .filter(m => m.providerId === provider.id)
            .map(m => ({
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
  getDefaultProvider(): { id: string; isConfigured: boolean; getDefaultModel: () => string } | undefined {
    const config = this._platform.config.getConfig();
    const userConfig = this._platform.config.getUserConfig();
    const providers = Array.from(config.providers.values());
    const models = Array.from(config.models.values());

    // Find an enabled provider that has an API key configured
    // The apiKey is already merged in config.providers from user.providers or providerOverrides
    const provider = providers.find(p => {
      if (p.enabled === false) return false;
      // Provider is configured if it has an apiKey (from merged config)
      return !!p.apiKey;
    });

    if (!provider) return undefined;

    const providerModels = models.filter(m => m.providerId === provider.id && m.enabled !== false);
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
  getProvider(providerId: string): { id: string; isConfigured: boolean; getDefaultModel: () => string } | undefined {
    const config = this._platform.config.getConfig();
    const provider = config.providers.get(providerId);

    if (!provider) return undefined;

    // Check if provider has API key configured (already merged in config.providers)
    const isConfigured = !!provider.apiKey;

    const models = Array.from(config.models.values()).filter(m => m.providerId === provider.id);
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

  /**
   * Get provider templates for dropdown selection
   * Templates are predefined provider configurations that users can choose from
   */
  getProviderTemplates(): ProviderTemplateInfo[] {
    const templates = getBuiltinProviderTemplates();
    return templates.map(t => ({
      id: t.id,
      name: t.name,
      displayName: t.displayName || t.name,
      type: t.type,
      apiUrl: t.apiUrl || '',
    }));
  }
}
