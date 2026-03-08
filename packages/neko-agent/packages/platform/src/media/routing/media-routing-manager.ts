/**
 * Media Routing Manager
 *
 * Selects provider and model for media generation requests.
 * Simplified: capability filtering and preference exclusion are inlined.
 */

import type { Provider, Model, ModelCapability } from '../../types/provider';
import type {
  MediaGenerationType,
  MediaRoutingResult,
  RoutingPreference,
} from '../types';
import type { ConfigManager } from '../../config/config-manager';
import { getMediaAdapterRegistry } from '../adapters/media-adapter-registry';

/**
 * Internal candidate type
 */
interface Candidate {
  provider: Provider;
  model: Model;
}

/**
 * Map generation type to model capability
 */
const GENERATION_TYPE_TO_CAPABILITY: Record<MediaGenerationType, ModelCapability> = {
  'text-to-image': 'text_to_image',
  'image-to-image': 'image_to_image',
  'text-to-video': 'text_to_video',
  'image-to-video': 'image_to_video',
  'video-to-video': 'video_to_video',
  'text-to-audio': 'text_to_audio',
  'text-to-music': 'text_to_music',
  'workflow': 'workflow',
};

/**
 * Alternative capability names for backwards compatibility
 */
const CAPABILITY_ALIASES: Partial<Record<ModelCapability, string[]>> = {
  text_to_image: ['image_generation', 'image-generation', 'text-to-image'],
  text_to_video: ['video_generation', 'video-generation', 'text-to-video'],
  text_to_audio: ['audio_generation', 'audio-generation', 'text-to-audio', 'tts'],
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
   */
  async selectProvider(
    generationType: MediaGenerationType,
    preference?: RoutingPreference,
    providerId?: string,
    modelId?: string
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

    // Get initial candidates
    let candidates = this.getCandidates(providerId, modelId);

    // Filter: exclude providers from preference
    if (preference?.excludeProviders?.length) {
      candidates = candidates.filter(
        (c) => !preference.excludeProviders!.includes(c.provider.id)
      );
    }

    // Filter: match generation type to model capabilities
    const requiredCapability = GENERATION_TYPE_TO_CAPABILITY[generationType] || 'text_to_image';
    candidates = candidates.filter((c) => this.hasCapability(c.model, requiredCapability));

    if (candidates.length === 0) {
      return null;
    }

    // Select first matching candidate
    const best = candidates[0]!;
    return {
      providerId: best.provider.id,
      modelId: best.model.id,
      score: 50,
      reason: 'Default selection',
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
   * Get initial candidates (providers with media adapters × enabled models)
   */
  private getCandidates(
    providerId?: string,
    modelId?: string
  ): Candidate[] {
    const candidates: Candidate[] = [];
    const adapterRegistry = getMediaAdapterRegistry();

    // Get providers
    let providers: Provider[];
    if (providerId) {
      const provider = this.configManager.getProvider(providerId);
      providers = provider ? [provider] : [];
    } else {
      providers = this.configManager.getEnabledProviders();
    }

    // Filter to providers with media adapters
    providers = providers.filter((p) => adapterRegistry.has(p.type));

    for (const provider of providers) {
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
        candidates.push({ provider, model });
      }
    }

    return candidates;
  }

  /**
   * Check if model has the required capability (with alias support)
   */
  private hasCapability(model: Model, capability: ModelCapability): boolean {
    const capabilities = model.capabilities as string[] || [];

    if (capabilities.includes(capability)) {
      return true;
    }

    // Check alternative names
    const aliases = CAPABILITY_ALIASES[capability];
    if (aliases) {
      return aliases.some((alias) => capabilities.includes(alias));
    }

    return false;
  }
}
