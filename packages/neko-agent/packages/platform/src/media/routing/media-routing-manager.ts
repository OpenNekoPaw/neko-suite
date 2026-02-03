/**
 * Media Routing Manager
 *
 * Manages provider and model selection for media generation requests
 */

import type { Provider, Model } from '../../types/provider';
import type {
  MediaGenerationType,
  MediaRoutingResult,
  MediaRoutingStrategy,
  MediaRoutingCandidate,
  MediaRoutingContext,
  RoutingPreference,
} from '../types';
import type { ProviderRegistry } from '../../provider/provider-registry';
import type { ConfigManager } from '../../config/config-manager';
import { getMediaAdapterRegistry } from '../adapters/media-adapter-registry';
import {
  UserPreferenceStrategy,
  HealthFilterStrategy,
  CapabilityFilterStrategy,
  LoadBalancingStrategy,
} from './strategies';

/**
 * Media routing manager
 */
export class MediaRoutingManager {
  private providerRegistry: ProviderRegistry;
  private configManager: ConfigManager;
  private strategies: MediaRoutingStrategy[] = [];

  constructor(providerRegistry: ProviderRegistry, configManager: ConfigManager) {
    this.providerRegistry = providerRegistry;
    this.configManager = configManager;

    // Register default strategies
    this.registerStrategy(new UserPreferenceStrategy());
    this.registerStrategy(new HealthFilterStrategy());
    this.registerStrategy(new CapabilityFilterStrategy());
    this.registerStrategy(new LoadBalancingStrategy());
  }

  /**
   * Register a routing strategy
   */
  registerStrategy(strategy: MediaRoutingStrategy): void {
    this.strategies.push(strategy);
    // Sort by priority (higher first)
    this.strategies.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Select best provider and model for the given generation type
   */
  async selectProvider(
    generationType: MediaGenerationType,
    preference?: RoutingPreference,
    providerId?: string,
    modelId?: string
  ): Promise<MediaRoutingResult | null> {
    console.log('[MediaRouting] selectProvider called:', {
      generationType,
      providerId,
      modelId,
      hasPreference: !!preference,
    });

    // If specific provider and model are specified, use them directly
    if (providerId && modelId) {
      const provider = this.configManager.getProvider(providerId);
      const model = this.configManager.getModel(modelId);
      if (provider && model) {
        console.log('[MediaRouting] Using specified provider/model:', { providerId, modelId });
        return {
          providerId,
          modelId,
          score: 100,
          reason: 'User specified provider and model',
        };
      }
    }

    // Build routing context
    const context = await this.buildContext(generationType, preference);

    // Get initial candidates
    let candidates = this.getCandidates(providerId, modelId);

    console.log('[MediaRouting] Initial candidates:', {
      count: candidates.length,
      candidates: candidates.map(c => ({
        provider: c.provider.id,
        providerType: c.provider.type,
        model: c.model.id,
        modelCapabilities: c.model.capabilities,
      })),
    });

    if (candidates.length === 0) {
      console.log('[MediaRouting] No candidates found. Checking enabled providers...');
      const enabledProviders = this.configManager.getEnabledProviders();
      const adapterRegistry = getMediaAdapterRegistry();
      console.log('[MediaRouting] Enabled providers:', enabledProviders.map(p => ({
        id: p.id,
        type: p.type,
        hasMediaAdapter: adapterRegistry.has(p.type),
      })));
      console.log('[MediaRouting] Registered adapter types:', adapterRegistry.listTypes());
      return null;
    }

    // Apply strategies in order
    for (const strategy of this.strategies) {
      // Filter phase
      candidates = strategy.filter(candidates, context);
      if (candidates.length === 0) {
        return null;
      }

      // Score phase
      candidates = strategy.score(candidates, context);
    }

    // Sort by score and select best
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    return {
      providerId: best.provider.id,
      modelId: best.model.id,
      score: best.score,
      reason: this.buildSelectionReason(best),
    };
  }

  /**
   * Select fallback provider (excluding already tried ones)
   */
  async selectFallback(
    generationType: MediaGenerationType,
    preference?: RoutingPreference,
    excludeProviders: string[] = []
  ): Promise<MediaRoutingResult | null> {
    if (!preference?.allowFallback) {
      return null;
    }

    const updatedPreference: RoutingPreference = {
      ...preference,
      excludeProviders: [
        ...(preference.excludeProviders || []),
        ...excludeProviders,
      ],
    };

    return this.selectProvider(generationType, updatedPreference);
  }

  /**
   * Build routing context
   */
  private async buildContext(
    generationType: MediaGenerationType,
    preference?: RoutingPreference
  ): Promise<MediaRoutingContext> {
    // Get provider health status (uses providerRegistry for health checks)
    const providerHealth = new Map<string, boolean>();
    const providers = this.configManager.getEnabledProviders();

    for (const provider of providers) {
      const status = this.providerRegistry.getProviderStatus(provider.id);
      providerHealth.set(provider.id, status?.available ?? true);
    }

    return {
      generationType,
      preference,
      providerHealth,
    };
  }

  /**
   * Get initial candidates
   */
  private getCandidates(
    providerId?: string,
    modelId?: string
  ): MediaRoutingCandidate[] {
    const candidates: MediaRoutingCandidate[] = [];
    const adapterRegistry = getMediaAdapterRegistry();

    // Get enabled providers
    let providers: Provider[];
    if (providerId) {
      const provider = this.configManager.getProvider(providerId);
      providers = provider ? [provider] : [];
    } else {
      providers = this.configManager.getEnabledProviders();
    }

    // Filter to providers that have media adapters
    providers = providers.filter((p) => adapterRegistry.has(p.type));

    for (const provider of providers) {
      // Get models for this provider
      let models: Model[];
      if (modelId) {
        const model = this.configManager.getModel(modelId);
        models = model && model.providerId === provider.id ? [model] : [];
      } else {
        models = this.configManager
          .getModelsByProvider(provider.id)
          .filter((m) => m.enabled);
      }

      for (const model of models) {
        candidates.push({
          provider,
          model,
          score: 0,
          scoreBreakdown: {},
        });
      }
    }

    return candidates;
  }

  /**
   * Build human-readable selection reason
   */
  private buildSelectionReason(candidate: MediaRoutingCandidate): string {
    const parts: string[] = [];

    for (const [strategy, score] of Object.entries(candidate.scoreBreakdown)) {
      if (score > 0) {
        parts.push(`${strategy}: +${score.toFixed(1)}`);
      }
    }

    return parts.length > 0
      ? `Selected based on: ${parts.join(', ')}`
      : 'Default selection';
  }
}
