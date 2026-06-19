/**
 * Tests for MediaRoutingManager
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MediaRoutingManager } from '../media-routing-manager';
import type { ConfigManager } from '../../../config/config-manager';
import type { Provider, Model } from '../../../types/provider';

// Mock ConfigManager
class MockConfigManager {
  private providers = new Map<string, Provider>();
  private models = new Map<string, Model>();
  private defaultMediaModels: Record<string, string> = {};

  addProvider(provider: Provider) {
    this.providers.set(provider.id, provider);
  }

  addModel(model: Model) {
    this.models.set(model.id, model);
  }

  setDefaultMediaModels(defaults: Record<string, string>) {
    this.defaultMediaModels = defaults;
  }

  getProvider(id: string): Provider | undefined {
    return this.providers.get(id);
  }

  getModel(id: string): Model | undefined {
    return this.models.get(id);
  }

  getDefaultMediaModels() {
    return this.defaultMediaModels;
  }
}

describe('MediaRoutingManager', () => {
  let manager: MediaRoutingManager;
  let configManager: MockConfigManager;

  beforeEach(() => {
    configManager = new MockConfigManager();
    manager = new MediaRoutingManager(null, configManager as unknown as ConfigManager);

    // Setup test providers
    configManager.addProvider({
      id: 'openai',
      name: 'OpenAI',
      displayName: 'OpenAI',
      type: 'openai',
      apiUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      enabled: true,
    });

    configManager.addProvider({
      id: 'stability',
      name: 'Stability AI',
      displayName: 'Stability AI',
      type: 'openai', // Use openai type for testing
      apiUrl: 'https://api.stability.ai/v1',
      apiKey: 'sk-test',
      enabled: true,
    });

    // Setup test models
    configManager.addModel({
      id: 'dall-e-3',
      name: 'DALL-E 3',
      providerId: 'openai',
      capabilities: ['text_to_image'],
      enabled: true,
    });

    configManager.addModel({
      id: 'stable-diffusion-xl',
      name: 'Stable Diffusion XL',
      providerId: 'stability',
      capabilities: ['text_to_image'],
      enabled: true,
    });

    configManager.addModel({
      id: 'tts-1',
      name: 'TTS 1',
      providerId: 'openai',
      capabilities: ['text_to_audio'],
      enabled: true,
    });
  });

  describe('selectProvider', () => {
    it('should use explicit provider and model when both specified', async () => {
      const result = await manager.selectProvider('text-to-image', undefined, 'openai', 'dall-e-3');

      expect(result).toEqual({
        providerId: 'openai',
        modelId: 'dall-e-3',
        score: 100,
        reason: 'User specified provider and model',
      });
    });

    it('should use configured default model when no model specified', async () => {
      configManager.setDefaultMediaModels({
        image: 'dall-e-3',
      });

      const result = await manager.selectProvider('text-to-image');

      expect(result).toEqual({
        providerId: 'openai',
        modelId: 'dall-e-3',
        score: 90,
        reason: 'Configured default image model',
      });
    });

    it('should find provider when only model specified', async () => {
      const result = await manager.selectProvider(
        'text-to-image',
        undefined,
        undefined,
        'stable-diffusion-xl',
      );

      expect(result).toEqual({
        providerId: 'stability',
        modelId: 'stable-diffusion-xl',
        score: 80,
        reason: 'User specified model',
      });
    });

    it('should return null when no default configured and no model specified', async () => {
      const result = await manager.selectProvider('text-to-image');

      expect(result).toBeNull();
    });

    it('should use correct media type for different generation types', async () => {
      configManager.setDefaultMediaModels({
        image: 'dall-e-3',
        audio: 'tts-1',
      });

      const imageResult = await manager.selectProvider('text-to-image');
      expect(imageResult?.modelId).toBe('dall-e-3');

      const audioResult = await manager.selectProvider('text-to-audio');
      expect(audioResult?.modelId).toBe('tts-1');
    });

    it('should return null when default model not found in config', async () => {
      configManager.setDefaultMediaModels({
        image: 'non-existent-model',
      });

      const result = await manager.selectProvider('text-to-image');

      expect(result).toBeNull();
    });

    it('should return null when default model provider is not configured', async () => {
      configManager.addProvider({
        id: 'empty-gateway',
        name: 'empty-gateway',
        displayName: 'Empty Gateway',
        type: 'newapi',
        apiUrl: '',
        enabled: true,
        connectionKind: 'gateway',
        protocolProfile: 'newapi-compatible',
        requiresApiKey: true,
      });
      configManager.addModel({
        id: 'empty-gateway-image',
        name: 'gpt-image-2',
        providerId: 'empty-gateway',
        capabilities: ['text_to_image'],
        enabled: true,
      });
      configManager.setDefaultMediaModels({
        image: 'empty-gateway-image',
      });

      const result = await manager.selectProvider('text-to-image');

      expect(result).toBeNull();
    });

    it('should handle image-to-image as image type', async () => {
      configManager.setDefaultMediaModels({
        image: 'dall-e-3',
      });

      const result = await manager.selectProvider('image-to-image');

      expect(result?.modelId).toBe('dall-e-3');
      expect(result?.reason).toBe('Configured default image model');
    });
  });
});
