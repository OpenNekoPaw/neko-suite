/**
 * ModelSelector - Simple model resolver
 *
 * Resolution priority:
 *   1. Caller-specified providerId + modelId (explicit provider/model ref)
 *   2. Caller-specified modelId (explicit model override)
 *   3. Caller-specified providerId (first enabled model on that provider)
 *   4. First enabled model with matching capability and configured apiKey
 *   5. Throws PlatformError(NOT_FOUND, NO_AVAILABLE_MODEL)
 */

import type { Model, ModelCapability } from '../types/provider';
import type { ConfigManager } from '../config/config-manager';
import type { ProviderRegistry } from '../provider/provider-registry';
import { PlatformError } from '../provider/platform-error';
import { isProviderConfigured } from '../config/provider-configuration';

export type ModelTaskType = 'chat' | 'embedding';

/**
 * Resolved model for a request
 */
export interface ResolvedModel {
  modelId: string;
  providerId: string;
  /** Attempt counter starting at 1, incremented on each fallback */
  attempt: number;
}

/**
 * ModelSelector resolves the appropriate model for a given task type.
 * Created inside Service; not exposed on the Platform interface.
 */
export class ModelSelector {
  constructor(
    private readonly config: ConfigManager,
    private readonly registry: ProviderRegistry,
  ) {}

  /**
   * Resolve the model to use for a request.
   * @param taskType - 'chat' or 'embedding'
   * @param options.providerId - Explicit provider override from the caller
   * @param options.modelId - Explicit model override from the caller
   * @param options.excludeModels - Models to skip (failed in previous attempts)
   */
  resolve(
    taskType: ModelTaskType,
    options: { providerId?: string; modelId?: string; excludeModels?: string[] } = {},
  ): ResolvedModel {
    const { providerId, modelId, excludeModels = [] } = options;
    const attempt = excludeModels.length + 1;

    if (providerId && modelId) {
      this.assertProviderModelRef(providerId, modelId);
      return { providerId, modelId, attempt };
    }

    if (modelId) {
      const model = this.assertModelAvailable(modelId);
      this.assertProviderAvailable(model.providerId);
      return { modelId, providerId: model.providerId, attempt };
    }

    const capabilityName = taskType === 'embedding' ? 'embedding' : 'chat';

    if (providerId) {
      this.assertProviderAvailable(providerId);
      const providerCandidates = this.getAvailableCandidates(capabilityName, excludeModels).filter(
        (model) => model.providerId === providerId,
      );
      if (providerCandidates.length > 0) {
        const selected = providerCandidates[0]!;
        return { modelId: selected.id, providerId, attempt };
      }
      throw new PlatformError({
        category: 'not_found',
        code: 'NO_AVAILABLE_MODEL_FOR_PROVIDER',
        message: `No available ${taskType} model found for provider ${providerId}`,
        retryable: false,
      });
    }

    const candidates = this.getAvailableCandidates(capabilityName, excludeModels);

    if (candidates.length > 0) {
      const selected = candidates[0]!;
      return { modelId: selected.id, providerId: selected.providerId, attempt };
    }

    throw new PlatformError({
      category: 'not_found',
      code: 'NO_AVAILABLE_MODEL',
      message: `No available ${taskType} model found`,
      retryable: false,
    });
  }

  private getAvailableCandidates(
    capabilityName: ModelCapability,
    excludeModels: readonly string[],
  ): Model[] {
    return this.config.getEnabledModels().filter((m: Model) => {
      if (excludeModels.includes(m.id)) return false;
      if (!m.capabilities?.includes(capabilityName)) return false;
      const provider = this.config.getProvider(m.providerId);
      if (!provider?.enabled) return false;
      if (!isProviderConfigured(provider)) return false;
      if (!this.registry.isProviderAvailable(m.providerId)) return false;
      return true;
    });
  }

  private assertProviderModelRef(providerId: string, modelId: string): void {
    this.assertProviderAvailable(providerId);
    const model = this.assertModelAvailable(modelId);
    if (model.providerId !== providerId) {
      throw new PlatformError({
        category: 'validation',
        code: 'MODEL_PROVIDER_MISMATCH',
        message: `Model ${modelId} belongs to provider ${model.providerId}, not ${providerId}`,
        retryable: false,
      });
    }
  }

  private assertModelAvailable(modelId: string): Model {
    const model = this.config.getModel(modelId);
    if (!model) {
      throw new PlatformError({
        category: 'not_found',
        code: 'MODEL_NOT_FOUND',
        message: `Model ${modelId} not found`,
        retryable: false,
      });
    }
    if (!model.enabled) {
      throw new PlatformError({
        category: 'not_found',
        code: 'MODEL_DISABLED',
        message: `Model ${modelId} is disabled`,
        retryable: false,
      });
    }
    return model;
  }

  private assertProviderAvailable(providerId: string): void {
    const provider = this.config.getProvider(providerId);
    if (!provider?.enabled) {
      throw new PlatformError({
        category: 'not_found',
        code: 'PROVIDER_DISABLED',
        message: `Provider ${providerId} is disabled or not found`,
        retryable: false,
      });
    }
  }

  /**
   * Returns true if this error category should trigger a fallback to the next model.
   */
  shouldFallback(error: PlatformError): boolean {
    return ['rate_limit', 'timeout', 'server', 'network'].includes(error.category);
  }
}
