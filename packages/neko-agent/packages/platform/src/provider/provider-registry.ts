/**
 * Provider Registry - Adapter routing and model discovery
 *
 * Simplified to its core responsibility: mapping provider+model to the correct adapter.
 * Circuit breaker, rate limiting, and health check have been removed as they are
 * unnecessary for a single-user desktop application.
 */

import type { Model } from '../types/provider';
import type { Adapter } from '../types/adapter';
import type { ConfigManager } from '../config/config-manager';
import type { ProviderProtocolProfile, ProviderType } from '@neko/shared';
import { getAdapterRegistry } from '../llm/adapter/adapter-registry';

/**
 * Provider registry for adapter routing and model discovery
 */
export class ProviderRegistry {
  private configManager: ConfigManager;

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
  }

  /**
   * Get adapter for provider, optionally considering an explicit model protocol profile
   * @param providerId - The provider ID
   * @param model - Optional model config. If provided and has protocolProfile, uses that request protocol instead of provider defaults.
   */
  getAdapter(providerId: string, model?: Model): Adapter | undefined {
    const provider = this.configManager.getProvider(providerId);
    if (!provider) return undefined;

    const adapterType =
      mapProtocolProfileToAdapterType(
        model?.protocolProfile ?? provider.protocolProfile,
        provider.type,
      ) ??
      model?.protocol ??
      provider.type;
    return getAdapterRegistry().getForType(adapterType);
  }

  /**
   * Check if provider is available (always true in simplified version)
   */
  isProviderAvailable(_providerId: string, _sessionId?: string): boolean {
    return true;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    // No-op: no resources to clean up
  }
}

function mapProtocolProfileToAdapterType(
  profile: ProviderProtocolProfile | undefined,
  providerType: ProviderType,
): ProviderType | undefined {
  switch (profile) {
    case 'anthropic':
      return 'anthropic';
    case 'google':
      return 'google';
    case 'ollama':
      return 'ollama';
    case 'newapi':
      return 'newapi';
    case 'openai-chat':
    case 'openai-responses':
      if (providerType === 'openai' || providerType === 'generic') {
        return providerType;
      }
      return undefined;
    case undefined:
      return undefined;
  }
}
