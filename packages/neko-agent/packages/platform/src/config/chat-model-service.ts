/**
 * Chat Model Service
 *
 * Provides chat model options for UI model selector
 */

import type { Model, Provider } from '../types/provider';
import type { ChatModelOption, ModelCapability, ModelType } from '@neko/shared';
import { isProviderConfigured } from './provider-configuration';
import { projectLlmParameterControls } from './llm-parameter-projection';

/**
 * Chat model service interface
 */
export interface IChatModelService {
  /**
   * Get chat model options for UI model selector
   */
  getChatModelOptions(providers: Provider[], models: Model[]): ChatModelOption[];

  /**
   * Get model type. Uses model.type if set, otherwise infers from capabilities.
   */
  getModelType(model: Model): ModelType;
}

/**
 * Chat model service implementation
 */
export class ChatModelService implements IChatModelService {
  /**
   * Get chat model options for UI model selector
   * Returns a list of enabled models with 'auto' as the first option
   * Only includes models from configured providers.
   */
  getChatModelOptions(providers: Provider[], models: Model[]): ChatModelOption[] {
    const options: ChatModelOption[] = [
      { id: 'auto', label: 'Auto', providerId: '', modelId: '', category: 'llm' },
    ];

    const configuredProviders = providers.filter(
      (provider) => provider.enabled && isProviderConfigured(provider),
    );
    const providerMap = new Map(configuredProviders.map((p) => [p.id, p]));

    const enabledModels = models.filter((m) => m.enabled);

    for (const model of enabledModels) {
      const provider = providerMap.get(model.providerId);
      if (!provider) continue;

      const capabilities = model.capabilities ?? [];
      const category = this.getModelType(model);

      const providerName = provider.displayName || provider.name || provider.type;
      const modelName = model.displayName || model.name || model.id;

      options.push({
        id: `${model.providerId}:${model.id}`,
        label: `${providerName} / ${modelName}`,
        providerId: model.providerId,
        modelId: model.id,
        capabilities: capabilities as ModelCapability[],
        category,
        ...(model.contextWindow !== undefined ? { contextWindow: model.contextWindow } : {}),
        ...(category === 'llm'
          ? { llmParameterControls: this.getLlmParameterControls(model, provider) }
          : {}),
      });
    }

    return options;
  }

  /**
   * Get model type from explicit `type` field. Defaults to 'llm' if not set.
   */
  getModelType(model: Model): ModelType {
    return model.type ?? 'llm';
  }

  private getLlmParameterControls(
    model: Model,
    provider: Provider,
  ): NonNullable<ChatModelOption['llmParameterControls']> {
    return projectLlmParameterControls({ model, provider });
  }
}

/**
 * Create a chat model service instance
 */
export function createChatModelService(): IChatModelService {
  return new ChatModelService();
}
