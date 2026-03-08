/**
 * Provider Registry - Adapter routing and model discovery
 *
 * Simplified to its core responsibility: mapping provider+model to the correct adapter.
 * Circuit breaker, rate limiting, and health check have been removed as they are
 * unnecessary for a single-user desktop application.
 */

import type { Model, ProviderType } from '../types/provider';
import type { Adapter } from '../types/adapter';
import type { ConfigManager } from '../config/config-manager';
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
   * Get adapter for provider, optionally considering model-specific protocol
   * @param providerId - The provider ID
   * @param model - Optional model config. If provided and has protocol, uses model.protocol instead of provider.type
   */
  getAdapter(providerId: string, model?: Model): Adapter | undefined {
    const provider = this.configManager.getProvider(providerId);
    if (!provider) return undefined;

    // Priority: model.protocol > inferred from model name (only for generic type) > provider.type
    // Only infer from model name when provider.type is 'generic', because other provider types
    // (like 'newapi') already specify which adapter to use, even if they serve GPT models.
    const inferredProtocol = provider.type === 'generic' ? this.inferProtocolFromModelName(model?.name) : undefined;
    const adapterType = model?.protocol || inferredProtocol || provider.type;
    return getAdapterRegistry().getForType(adapterType);
  }

  /**
   * Infer protocol type from model name
   */
  private inferProtocolFromModelName(modelName?: string): ProviderType | undefined {
    if (!modelName) return undefined;

    const name = modelName.toLowerCase();

    if (name.includes('claude') || name.includes('anthropic')) {
      return 'anthropic';
    }
    if (name.includes('gemini') || name.includes('palm') || name.includes('bard')) {
      return 'google';
    }
    if (
      name.includes('gpt-') ||
      name.includes('o1') ||
      name.includes('dall-e') ||
      name.includes('whisper') ||
      name.includes('tts-')
    ) {
      return 'openai';
    }

    return undefined;
  }

  /**
   * Check if provider is available (always true in simplified version)
   */
  isProviderAvailable(_providerId: string, _sessionId?: string): boolean {
    return true;
  }

  /**
   * @deprecated No-op. Circuit breaker session cleanup has been removed.
   */
  cleanupSession(_sessionId: string): void {
    // No-op: circuit breaker has been removed
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    // No-op: no resources to clean up
  }
}
