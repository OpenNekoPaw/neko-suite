/**
 * LLM Routing Manager - Intelligent routing for LLM requests
 *
 * Uses strategy chain pattern to select the best provider and model
 * based on context, capabilities, cost, and health status.
 */

import {
  BaseRoutingManager,
  createCandidate,
  type RoutingCandidate,
} from '../../core/router';
import type { ProviderRegistry } from '../../provider/provider-registry';
import type { ConfigManager } from '../../config/config-manager';
import type { HealthMonitor } from '../../core/health-monitor';
import type {
  LLMRoutingContext,
  LLMRoutingCandidate,
  LLMRoutingResult,
  LLMRoutingPreference,
} from './types';
import {
  LLMUserPreferenceStrategy,
  LLMHealthFilterStrategy,
  LLMCapabilityFilterStrategy,
  LLMContextWindowStrategy,
  LLMCostOptimizationStrategy,
  LLMLoadBalancingStrategy,
} from './strategies';

/**
 * LLM Routing Manager
 *
 * Selects the best provider and model for LLM requests based on:
 * - User preferences
 * - Provider health status
 * - Model capabilities
 * - Context window requirements
 * - Cost optimization
 * - Load balancing
 */
export class LLMRoutingManager extends BaseRoutingManager<
  LLMRoutingCandidate,
  LLMRoutingContext,
  LLMRoutingResult
> {
  private providerRegistry: ProviderRegistry;
  private configManager: ConfigManager;
  private healthMonitor?: HealthMonitor;

  constructor(
    providerRegistry: ProviderRegistry,
    configManager: ConfigManager,
    healthMonitor?: HealthMonitor
  ) {
    super();
    this.providerRegistry = providerRegistry;
    this.configManager = configManager;
    this.healthMonitor = healthMonitor;
    this.initializeDefaultStrategies();
  }

  /**
   * Initialize default routing strategies
   */
  private initializeDefaultStrategies(): void {
    this.registerStrategy(new LLMUserPreferenceStrategy());
    this.registerStrategy(new LLMHealthFilterStrategy());
    this.registerStrategy(new LLMCapabilityFilterStrategy());
    this.registerStrategy(new LLMContextWindowStrategy());
    this.registerStrategy(new LLMCostOptimizationStrategy());
    this.registerStrategy(new LLMLoadBalancingStrategy());
  }

  /**
   * Get initial candidates from provider registry
   */
  protected getCandidates(
    context: LLMRoutingContext
  ): RoutingCandidate<LLMRoutingCandidate>[] {
    const candidates: RoutingCandidate<LLMRoutingCandidate>[] = [];
    const providers = this.configManager.getEnabledProviders();

    for (const provider of providers) {
      // Skip providers without API key configured
      if (!provider.apiKey) {
        continue;
      }

      const models = this.configManager
        .getModelsByProvider(provider.id)
        .filter((m) => m.enabled);

      for (const model of models) {
        // Only include models with chat capability for LLM routing
        const caps = model.capabilities ?? [];
        if (caps.includes('chat') || caps.includes('completion')) {
          candidates.push(
            createCandidate({
              provider,
              model,
            })
          );
        }
      }
    }

    return candidates;
  }

  /**
   * Convert candidate to routing result
   */
  protected toResult(
    candidate: RoutingCandidate<LLMRoutingCandidate>,
    reason: string
  ): LLMRoutingResult {
    return {
      providerId: candidate.item.provider.id,
      modelId: candidate.item.model.id,
      provider: candidate.item.provider,
      model: candidate.item.model,
      score: candidate.score,
      reason,
    };
  }

  /**
   * Select provider with context
   */
  async selectProvider(
    context: LLMRoutingContext
  ): Promise<LLMRoutingResult | null> {
    // Inject health status if monitor is available
    if (this.healthMonitor && context.providerHealth.size === 0) {
      context = {
        ...context,
        providerHealth: this.healthMonitor.getHealthMap(),
      };
    }

    return super.selectProvider(context);
  }

  /**
   * Select fallback provider
   */
  async selectFallback(
    context: LLMRoutingContext,
    excludeProviders: string[]
  ): Promise<LLMRoutingResult | null> {
    if (!context.preference?.allowFallback) {
      return null;
    }

    const updatedContext: LLMRoutingContext = {
      ...context,
      preference: {
        ...context.preference,
        excludeTargets: [
          ...(context.preference.excludeTargets ?? []),
          ...excludeProviders,
        ],
      },
    };

    return this.selectProvider(updatedContext);
  }

  /**
   * Create routing context for a chat request
   */
  createChatContext(options: {
    estimatedInputTokens?: number;
    requireStream?: boolean;
    requireToolCalling?: boolean;
    requireVision?: boolean;
    requireJsonMode?: boolean;
    preference?: LLMRoutingPreference;
  }): LLMRoutingContext {
    return {
      taskType: 'chat',
      estimatedInputTokens: options.estimatedInputTokens,
      requireStream: options.requireStream,
      requireToolCalling: options.requireToolCalling,
      requireVision: options.requireVision,
      requireJsonMode: options.requireJsonMode,
      preference: options.preference,
      providerHealth: this.healthMonitor?.getHealthMap() ?? new Map(),
    };
  }

  /**
   * Create routing context for an embedding request
   */
  createEmbeddingContext(options: {
    preference?: LLMRoutingPreference;
  }): LLMRoutingContext {
    return {
      taskType: 'embedding',
      preference: options.preference,
      providerHealth: this.healthMonitor?.getHealthMap() ?? new Map(),
    };
  }

  /**
   * Quick route: select best provider for chat
   */
  async routeChat(options?: {
    estimatedTokens?: number;
    requireStream?: boolean;
    requireTools?: boolean;
    requireVision?: boolean;
    preference?: LLMRoutingPreference;
  }): Promise<LLMRoutingResult | null> {
    const context = this.createChatContext({
      estimatedInputTokens: options?.estimatedTokens,
      requireStream: options?.requireStream,
      requireToolCalling: options?.requireTools,
      requireVision: options?.requireVision,
      preference: options?.preference,
    });

    return this.selectProvider(context);
  }

  /**
   * Quick route: select best provider for embedding
   */
  async routeEmbedding(
    preference?: LLMRoutingPreference
  ): Promise<LLMRoutingResult | null> {
    const context = this.createEmbeddingContext({ preference });
    return this.selectProvider(context);
  }
}
