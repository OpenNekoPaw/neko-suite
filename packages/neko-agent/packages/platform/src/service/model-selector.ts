/**
 * ModelSelector - Simple model resolver replacing GroupManager
 *
 * Resolution priority:
 *   1. Caller-specified modelId (explicit override)
 *   2. taskDefaults[taskType] from user/workspace config
 *   3. First enabled model with matching capability and configured apiKey
 *   4. Throws PlatformError(NOT_FOUND, NO_AVAILABLE_MODEL)
 */

import type { TaskDefaults } from '@neko/shared';
import type { Model } from '../types/provider';
import type { ConfigManager } from '../config/config-manager';
import type { ProviderRegistry } from '../provider/provider-registry';
import { PlatformError } from '../provider/platform-error';

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
    private readonly registry: ProviderRegistry
  ) {}

  /**
   * Resolve the model to use for a request.
   * @param taskType - 'chat' or 'embedding'
   * @param options.modelId - Explicit model override from the caller
   * @param options.excludeModels - Models to skip (failed in previous attempts)
   */
  resolve(
    taskType: ModelTaskType,
    options: { modelId?: string; excludeModels?: string[] } = {}
  ): ResolvedModel {
    const { modelId, excludeModels = [] } = options;
    const attempt = excludeModels.length + 1;

    // Priority 1: explicit modelId from caller
    if (modelId) {
      const model = this.config.getModel(modelId);
      if (!model) {
        throw new PlatformError({
          category: 'not_found',
          code: 'MODEL_NOT_FOUND',
          message: `Model ${modelId} not found`,
          retryable: false,
        });
      }
      const provider = this.config.getProvider(model.providerId);
      if (!provider?.enabled) {
        throw new PlatformError({
          category: 'not_found',
          code: 'PROVIDER_DISABLED',
          message: `Provider ${model.providerId} is disabled or not found`,
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
      return { modelId, providerId: model.providerId, attempt };
    }

    // Priority 2: taskDefaults from config
    const taskDefaults = this.config.getTaskDefaults();
    const defaultModelId = this.getTaskDefaultModelId(taskDefaults, taskType);
    if (defaultModelId && !excludeModels.includes(defaultModelId)) {
      const model = this.config.getModel(defaultModelId);
      if (model?.enabled) {
        const provider = this.config.getProvider(model.providerId);
        if (provider?.enabled && provider.apiKey) {
          return { modelId: defaultModelId, providerId: model.providerId, attempt };
        }
      }
    }

    // Priority 3: first available model with matching capability and apiKey
    const capabilityName = taskType === 'embedding' ? 'embedding' : 'chat';
    const candidates = this.config.getEnabledModels().filter((m: Model) => {
      if (excludeModels.includes(m.id)) return false;
      if (!m.capabilities?.includes(capabilityName)) return false;
      const provider = this.config.getProvider(m.providerId);
      if (!provider?.enabled) return false;
      if (!provider.apiKey) return false;
      if (!this.registry.isProviderAvailable(m.providerId)) return false;
      return true;
    });

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

  /**
   * Returns true if this error category should trigger a fallback to the next model.
   */
  shouldFallback(error: PlatformError): boolean {
    return ['rate_limit', 'timeout', 'server', 'network'].includes(error.category);
  }

  private getTaskDefaultModelId(
    taskDefaults: TaskDefaults | undefined,
    taskType: ModelTaskType
  ): string | undefined {
    if (!taskDefaults) return undefined;
    if (taskType === 'chat') return taskDefaults.chat?.modelId;
    return undefined; // no taskDefaults entry for embedding
  }
}
