/**
 * Chat Model Service
 *
 * Provides chat model options for UI model selector
 */

import type { Model, Provider } from '../types/provider';
import type { ChatModelOption, ModelCapability, ModelCategory } from '@neko/shared';

/**
 * Chat model service interface
 */
export interface IChatModelService {
  /**
   * Get chat model options for UI model selector
   */
  getChatModelOptions(providers: Provider[], models: Model[]): ChatModelOption[];

  /**
   * Infer model category from capabilities
   */
  inferModelCategory(capabilities: string[]): ModelCategory;
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
      { id: 'auto', label: 'Auto', providerId: '', modelId: '', category: 'chat' },
    ];

    // Only include providers with API key configured
    const configuredProviders = providers.filter((p) => p.enabled && !!p.apiKey);
    const providerMap = new Map(configuredProviders.map((p) => [p.id, p]));

    const enabledModels = models.filter((m) => m.enabled);

    for (const model of enabledModels) {
      const provider = providerMap.get(model.providerId);
      if (!provider) continue;

      const capabilities = model.capabilities ?? [];
      const category = this.inferModelCategory(capabilities);

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
   * Infer model category from capabilities
   */
  inferModelCategory(capabilities: string[]): ModelCategory {
    if (capabilities.length === 0) {
      return 'chat'; // Default to chat if no capabilities specified
    }
    if (capabilities.includes('chat') || capabilities.includes('completion')) {
      return 'chat';
    }
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
    if (
      capabilities.includes('text_to_audio') ||
      capabilities.includes('text_to_music') ||
      capabilities.includes('audio')
    ) {
      return 'audio';
    }
    return 'other';
  }
}

/**
 * Create a chat model service instance
 */
export function createChatModelService(): IChatModelService {
  return new ChatModelService();
}
