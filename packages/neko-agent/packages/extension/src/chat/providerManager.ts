/**
 * Provider Manager
 *
 * Manages AI provider configurations using the Platform API.
 * Provides a UI-friendly interface for provider management.
 */

import type {
  AssistantConfiguredProviderView,
  AssistantProviderSelection,
  AssistantProviderView,
  Platform,
} from '@neko/platform';
import type { AccountAiCatalogSnapshot } from '@neko/shared';
import type { AccountAiCatalogCache } from '../services/accountAiCatalogCache';

/**
 * Provider Manager using Platform API
 */
export class ProviderManager {
  private readonly _platform: Platform;

  constructor(
    platform: Platform,
    private readonly accountAiCatalog?: AccountAiCatalogCache,
  ) {
    this._platform = platform;
  }

  /**
   * Get all available providers from config
   */
  getAllProviders(): AssistantProviderView[] {
    return this._platform.config.getAssistantProviderViews();
  }

  /**
   * Get configured providers with API keys
   */
  getConfiguredProviders(): AssistantConfiguredProviderView[] {
    return this._platform.config.getAssistantConfiguredProviderViews();
  }

  /**
   * Get the default provider
   */
  getDefaultProvider(): AssistantProviderSelection | undefined {
    return this._platform.config.getAssistantDefaultProvider();
  }

  /**
   * Get provider by ID
   */
  getProvider(providerId: string): AssistantProviderSelection | undefined {
    const accountProvider = this.getAccountProvider(providerId);
    if (accountProvider) return accountProvider;
    return this._platform.config.getAssistantProvider(providerId);
  }

  private getAccountProvider(providerId: string): AssistantProviderSelection | undefined {
    const snapshot = this.accountAiCatalog?.getCachedSnapshot();
    if (!snapshot || snapshot.provider.id !== providerId) return undefined;
    return buildAccountProviderSelection(snapshot);
  }
}

function buildAccountProviderSelection(
  snapshot: AccountAiCatalogSnapshot,
): AssistantProviderSelection {
  const allowed = new Set(snapshot.entitlement.allowedModelIds);
  const disabled = new Set(snapshot.entitlement.disabledModelIds ?? []);
  const modelIds = snapshot.models
    .filter((model) => model.enabled !== false)
    .filter((model) => allowed.has(model.id) && !disabled.has(model.id))
    .map((model) => model.id);
  return {
    id: snapshot.provider.id,
    isConfigured: snapshot.status === 'available' && modelIds.length > 0,
    defaultModel: snapshot.defaults?.chat ?? modelIds[0] ?? '',
    modelIds,
    source: 'account-gateway',
    accountCatalogAvailable: snapshot.status === 'available',
    entitledModelIds: [...allowed],
    modelCapabilities: Object.fromEntries(
      snapshot.models.map((model) => [model.id, [...model.capabilities]]),
    ),
  };
}
