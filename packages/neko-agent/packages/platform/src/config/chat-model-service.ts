/**
 * Chat Model Service
 *
 * Provides chat model options for UI model selector
 */

import type { Model, Provider } from '../types/provider';
import type { ChatModelOption, ModelCapability, ModelType } from '@neko/shared';

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
   * Only includes models from providers with API key configured
   */
  getChatModelOptions(providers: Provider[], models: Model[]): ChatModelOption[] {
    const options: ChatModelOption[] = [
      { id: 'auto', label: 'Auto', providerId: '', modelId: '', category: 'llm' },
    ];

    // Only include providers with API key configured
    const configuredProviders = providers.filter((p) => p.enabled && !!p.apiKey);
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
      });
    }

    return options;
  }

  /**
   * Get model type. Uses model.type if set, otherwise infers from capabilities.
   */
  getModelType(model: Model): ModelType {
    if (model.type) return model.type;
    return this.inferFromCapabilities(model.capabilities ?? []);
  }

  /**
   * Infer model type from capabilities (backward compatibility fallback).
   *
   * Media capabilities are checked BEFORE chat/completion, because multimodal
   * LLMs (e.g., gemini-3-pro-image-preview) may have both 'chat' and
   * 'image_generation' — they should be classified as 'image' so they appear
   * in the media model selector. Pure chat models won't have media capabilities.
   */
  private inferFromCapabilities(capabilities: string[]): ModelType {
    if (capabilities.length === 0) {
      return 'llm';
    }
    // Check media capabilities first (higher priority)
    if (
      capabilities.includes('text_to_image') ||
      capabilities.includes('image_to_image') ||
      capabilities.includes('image_generation')
    ) {
      return 'image';
    }
    if (
      capabilities.includes('text_to_video') ||
      capabilities.includes('image_to_video') ||
      capabilities.includes('video_to_video') ||
      capabilities.includes('video_generation')
    ) {
      return 'video';
    }
    if (capabilities.includes('text_to_music')) {
      return 'music';
    }
    if (capabilities.includes('text_to_audio') || capabilities.includes('audio')) {
      return 'audio';
    }
    // Default to LLM (includes chat, completion, and unknown capabilities)
    return 'llm';
  }
}

/**
 * Create a chat model service instance
 */
export function createChatModelService(): IChatModelService {
  return new ChatModelService();
}
