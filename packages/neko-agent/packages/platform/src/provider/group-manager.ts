/**
 * Group Manager - Model routing and grouping
 *
 * Uses shared selection strategies from core/selection-strategy.ts
 */

import type { Group, RoutingResult, FallbackTrigger } from '../types/group';
import type { Model, ProviderStatus } from '../types/provider';
import type { ErrorCategory } from '../types/error';
import { ConfigManager } from '../config/config-manager';
import { ProviderRegistry } from './provider-registry';
import {
  type ISelectionStrategy,
  type SelectionContext,
  PrioritySelectionStrategy,
  RoundRobinSelectionStrategy,
  WeightedSelectionStrategy,
} from '../core/selection-strategy';

/**
 * Group manager for model routing
 */
export class GroupManager {
  private configManager: ConfigManager;
  private providerRegistry: ProviderRegistry;
  private roundRobinState: Map<string, number> = new Map();
  private strategies: Map<string, ISelectionStrategy<string>> = new Map();

  constructor(configManager: ConfigManager, providerRegistry: ProviderRegistry) {
    this.configManager = configManager;
    this.providerRegistry = providerRegistry;
    this.initializeStrategies();
  }

  /**
   * Initialize selection strategies
   */
  private initializeStrategies(): void {
    this.strategies.set('priority', new PrioritySelectionStrategy());
    this.strategies.set('round-robin', new RoundRobinSelectionStrategy());
    this.strategies.set(
      'weighted',
      new WeightedSelectionStrategy((id: string) => id)
    );
  }

  /**
   * Get group by ID
   */
  getGroup(id: string): Group | undefined {
    return this.configManager.getGroup(id);
  }

  /**
   * Get all groups
   */
  getGroups(): Group[] {
    return this.configManager.getGroups();
  }

  /**
   * Get enabled groups
   */
  getEnabledGroups(): Group[] {
    return this.configManager.getEnabledGroups();
  }

  /**
   * Route to a model based on group strategy
   */
  route(groupId: string, excludeModels: string[] = []): RoutingResult | null {
    const group = this.getGroup(groupId);
    if (!group || !group.enabled) {
      return null;
    }

    const availableModels = group.models.filter(
      (modelId) => !excludeModels.includes(modelId) && this.isModelAvailable(modelId)
    );

    if (availableModels.length === 0) {
      return null;
    }

    const selectedModelId = this.selectModel(group, availableModels);
    if (!selectedModelId) {
      return null;
    }

    const model = this.configManager.getModel(selectedModelId);
    if (!model) {
      return null;
    }

    return {
      modelId: selectedModelId,
      providerId: model.providerId,
      attempt: excludeModels.length + 1,
      reason: `Selected by ${group.strategy.type} strategy`,
    };
  }

  /**
   * Route to next model for fallback
   */
  routeFallback(
    groupId: string,
    errorCategory: ErrorCategory,
    excludeModels: string[]
  ): RoutingResult | null {
    const group = this.getGroup(groupId);
    if (!group || !group.enabled) {
      return null;
    }

    // Check if fallback is enabled and error triggers fallback
    if (!group.fallback.enabled) {
      return null;
    }

    if (!this.shouldTriggerFallback(errorCategory, group.fallback.triggerOn)) {
      return null;
    }

    // Check max attempts
    if (excludeModels.length >= group.fallback.maxAttempts) {
      return null;
    }

    return this.route(groupId, excludeModels);
  }

  /**
   * Get all models in a group
   */
  getGroupModels(groupId: string): Model[] {
    const group = this.getGroup(groupId);
    if (!group) return [];

    return group.models
      .map((modelId) => this.configManager.getModel(modelId))
      .filter((m): m is Model => m !== undefined);
  }

  /**
   * Reset round-robin index for a group
   */
  resetRoundRobin(groupId: string): void {
    this.roundRobinState.delete(groupId);
  }

  /**
   * Reset all round-robin indices
   */
  resetAllRoundRobin(): void {
    this.roundRobinState.clear();
  }

  private selectModel(group: Group, availableModels: string[]): string | null {
    if (availableModels.length === 0) {
      return null;
    }

    // cost-optimal needs special handling (requires model lookup)
    if (group.strategy.type === 'cost-optimal') {
      return this.selectCostOptimal(availableModels, group.strategy.maxCostPer1k);
    }

    // Use shared strategies for priority, round-robin, weighted
    const strategy = this.strategies.get(group.strategy.type);
    if (!strategy) {
      return availableModels[0];
    }

    const context: SelectionContext = {
      groupId: group.id,
      roundRobinState: this.roundRobinState,
      weights: 'weights' in group.strategy ? group.strategy.weights : undefined,
    };

    return strategy.select(availableModels, context);
  }

  private selectCostOptimal(
    models: string[],
    maxCostPer1k?: number
  ): string | null {
    const modelsWithCost = models
      .map((modelId) => {
        const model = this.configManager.getModel(modelId);
        if (!model) return null;

        const avgCost =
          ((model.inputCostPer1k || 0) + (model.outputCostPer1k || 0)) / 2;

        // Filter by max cost if specified
        if (maxCostPer1k !== undefined && avgCost > maxCostPer1k) {
          return null;
        }

        return { modelId, cost: avgCost };
      })
      .filter((m): m is { modelId: string; cost: number } => m !== null);

    if (modelsWithCost.length === 0) {
      return null;
    }

    // Sort by cost ascending
    modelsWithCost.sort((a, b) => a.cost - b.cost);
    return modelsWithCost[0].modelId;
  }

  private isModelAvailable(modelId: string): boolean {
    const model = this.configManager.getModel(modelId);
    if (!model || !model.enabled) {
      return false;
    }

    const provider = this.configManager.getProvider(model.providerId);
    if (!provider || !provider.enabled) {
      return false;
    }

    // Check if provider has API key configured
    if (!provider.apiKey) {
      return false;
    }

    // Check provider health status (uses providerRegistry for health checks)
    return this.providerRegistry.isProviderAvailable(model.providerId);
  }

  private shouldTriggerFallback(
    errorCategory: ErrorCategory,
    triggerOn: FallbackTrigger[]
  ): boolean {
    const categoryToTrigger: Record<ErrorCategory, FallbackTrigger | null> = {
      rate_limit: 'rate_limit',
      timeout: 'timeout',
      server: 'server_error',
      network: 'unavailable',
      context_length: 'context_length',
      authentication: null,
      validation: null,
      not_found: null,
      content_filter: null,
      unknown: null,
    };

    const trigger = categoryToTrigger[errorCategory];
    return trigger !== null && triggerOn.includes(trigger);
  }
}
