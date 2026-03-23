/**
 * Media Routing Manager
 *
 * Selects provider and model for media generation requests.
 * Simplified: capability filtering and preference exclusion are inlined.
 */

import type { MediaModelType } from '@neko/shared';
import type { MediaGenerationType, MediaRoutingResult, RoutingPreference } from '../types';
import type { ConfigManager } from '../../config/config-manager';

/**
 * Map generation type to media model type
 */
const GENERATION_TYPE_TO_MEDIA_TYPE: Record<MediaGenerationType, MediaModelType> = {
  'text-to-image': 'image',
  'image-to-image': 'image',
  'text-to-video': 'video',
  'image-to-video': 'video',
  'video-to-video': 'video',
  'text-to-audio': 'audio',
  'text-to-music': 'music',
  workflow: 'image', // Default to image for workflow
};

/**
 * Media routing manager
 */
export class MediaRoutingManager {
  private configManager: ConfigManager;

  constructor(_providerRegistry: unknown, configManager: ConfigManager) {
    this.configManager = configManager;
  }

  /**
   * Select best provider and model for the given generation type
   *
   * @param generationType - Type of media generation
   * @param preference - Routing preferences (reserved for future use)
   * @param providerId - Optional specific provider ID
   * @param modelId - Optional specific model ID
   */
  async selectProvider(
    generationType: MediaGenerationType,
    preference?: RoutingPreference, // eslint-disable-line @typescript-eslint/no-unused-vars
    providerId?: string,
    modelId?: string,
  ): Promise<MediaRoutingResult | null> {
    // Short-circuit: if specific provider and model are given, use directly
    if (providerId && modelId) {
      const provider = this.configManager.getProvider(providerId);
      const model = this.configManager.getModel(modelId);
      if (provider && model) {
        return {
          providerId,
          modelId,
          score: 100,
          reason: 'User specified provider and model',
        };
      }
    }

    // Try to use configured default media model for this type
    if (!modelId) {
      const mediaType = GENERATION_TYPE_TO_MEDIA_TYPE[generationType];
      const defaultModelId = this.getDefaultMediaModel(mediaType);
      if (defaultModelId) {
        const model = this.configManager.getModel(defaultModelId);
        if (model) {
          const provider = this.configManager.getProvider(model.providerId);
          if (provider) {
            return {
              providerId: provider.id,
              modelId: defaultModelId,
              score: 90,
              reason: `Configured default ${mediaType} model`,
            };
          }
        }
      }
    }

    // If modelId is specified but providerId is not, find the provider
    if (modelId && !providerId) {
      const model = this.configManager.getModel(modelId);
      if (model) {
        const provider = this.configManager.getProvider(model.providerId);
        if (provider) {
          return {
            providerId: provider.id,
            modelId,
            score: 80,
            reason: 'User specified model',
          };
        }
      }
    }

    // No default configured and no explicit model specified - return null
    return null;
  }

  /**
   * Select fallback provider (excluding already tried ones)
   */
  async selectFallback(
    generationType: MediaGenerationType,
    preference?: RoutingPreference,
    excludeProviders: string[] = [],
  ): Promise<MediaRoutingResult | null> {
    if (!preference?.allowFallback) {
      return null;
    }

    const updatedPreference: RoutingPreference = {
      ...preference,
      excludeProviders: [...(preference.excludeProviders || []), ...excludeProviders],
    };

    return this.selectProvider(generationType, updatedPreference);
  }

  /**
   * Get configured default media model for a specific type
   */
  private getDefaultMediaModel(mediaType: MediaModelType): string | undefined {
    const defaultMediaModels = this.configManager.getDefaultMediaModels();
    return defaultMediaModels[mediaType];
  }
}
