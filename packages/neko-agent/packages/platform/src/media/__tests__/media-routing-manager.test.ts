/**
 * Media Routing Manager Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MediaRoutingManager } from '../routing/media-routing-manager';
import { ProviderRegistry } from '../../provider/provider-registry';
import { ConfigManager } from '../../config/config-manager';
import { getMediaAdapterRegistry, createMediaAdapterRegistry } from '../adapters/media-adapter-registry';
import { OpenAICompatMediaAdapter } from '../adapters/openai-compat-media-adapter';
import { RunwayMediaAdapter } from '../adapters/runway-media-adapter';
import type { Provider, Model } from '../../types/provider';

describe('MediaRoutingManager', () => {
  let routingManager: MediaRoutingManager;
  let providerRegistry: ProviderRegistry;
  let configManager: ConfigManager;

  // Mock providers
  const mockProviders: Provider[] = [
    {
      id: 'openai-provider',
      name: 'openai',
      displayName: 'OpenAI',
      type: 'openai',
      apiUrl: 'https://api.openai.com',
      apiKey: 'test-key',
      enabled: true,
    },
    {
      id: 'runway-provider',
      name: 'runway',
      displayName: 'Runway',
      type: 'runway',
      apiUrl: 'https://api.runwayml.com',
      apiKey: 'test-key',
      enabled: true,
    },
    {
      id: 'disabled-provider',
      name: 'disabled',
      displayName: 'Disabled',
      type: 'luma',
      apiUrl: 'https://api.luma.ai',
      apiKey: 'test-key',
      enabled: false,
    },
  ];

  // Mock models
  const mockModels: Model[] = [
    {
      id: 'sora-model',
      name: 'sora-1',
      displayName: 'Sora',
      providerId: 'openai-provider',
      capabilities: ['text_to_video', 'image_to_video'],
      enabled: true,
    },
    {
      id: 'dalle-model',
      name: 'dall-e-3',
      displayName: 'DALL-E 3',
      providerId: 'openai-provider',
      capabilities: ['text_to_image'],
      enabled: true,
    },
    {
      id: 'runway-model',
      name: 'gen3a_turbo',
      displayName: 'Gen-3 Alpha Turbo',
      providerId: 'runway-provider',
      capabilities: ['text_to_video', 'image_to_video'],
      enabled: true,
    },
    {
      id: 'disabled-model',
      name: 'disabled-model',
      displayName: 'Disabled Model',
      providerId: 'openai-provider',
      capabilities: ['text_to_video'],
      enabled: false,
    },
  ];

  beforeEach(() => {
    // Reset adapter registry
    const registry = getMediaAdapterRegistry();
    registry.registerBuiltin('openai', new OpenAICompatMediaAdapter());
    registry.registerBuiltin('runway', new RunwayMediaAdapter());

    // Create mock config manager
    configManager = {
      getProvider: (id: string) => mockProviders.find((p) => p.id === id),
      getProviders: () => mockProviders,
      getEnabledProviders: () => mockProviders.filter((p) => p.enabled),
      getModel: (id: string) => mockModels.find((m) => m.id === id),
      getModels: () => mockModels,
      getEnabledModels: () => mockModels.filter((m) => m.enabled),
      getModelsByProvider: (providerId: string) =>
        mockModels.filter((m) => m.providerId === providerId),
    } as unknown as ConfigManager;

    // Create provider registry
    providerRegistry = new ProviderRegistry(configManager);

    // Create routing manager
    routingManager = new MediaRoutingManager(providerRegistry, configManager);
  });

  describe('selectProvider', () => {
    it('should return specified provider and model when both are given', async () => {
      const result = await routingManager.selectProvider(
        'text-to-video',
        undefined,
        'openai-provider',
        'sora-model'
      );

      expect(result).not.toBeNull();
      expect(result?.providerId).toBe('openai-provider');
      expect(result?.modelId).toBe('sora-model');
      expect(result?.reason).toBe('User specified provider and model');
    });

    it('should return null for unknown provider', async () => {
      const result = await routingManager.selectProvider(
        'text-to-video',
        undefined,
        'unknown-provider',
        'unknown-model'
      );

      expect(result).toBeNull();
    });

    it('should select from available providers when none specified', async () => {
      const result = await routingManager.selectProvider('text-to-video');

      expect(result).not.toBeNull();
      expect(['openai-provider', 'runway-provider']).toContain(result?.providerId);
    });

    it('should filter by capability', async () => {
      const result = await routingManager.selectProvider('text-to-image');

      expect(result).not.toBeNull();
      expect(result?.modelId).toBe('dalle-model');
    });

    it('should exclude providers based on preference', async () => {
      const result = await routingManager.selectProvider('text-to-video', {
        excludeProviders: ['openai-provider'],
      });

      expect(result).not.toBeNull();
      expect(result?.providerId).toBe('runway-provider');
    });

    it('should return null when no providers match', async () => {
      const result = await routingManager.selectProvider('text-to-music');

      expect(result).toBeNull();
    });
  });

  describe('selectFallback', () => {
    it('should return null when fallback is not allowed', async () => {
      const result = await routingManager.selectFallback(
        'text-to-video',
        { allowFallback: false },
        ['openai-provider']
      );

      expect(result).toBeNull();
    });

    it('should exclude already tried providers', async () => {
      const result = await routingManager.selectFallback(
        'text-to-video',
        { allowFallback: true },
        ['openai-provider']
      );

      expect(result).not.toBeNull();
      expect(result?.providerId).toBe('runway-provider');
    });

    it('should return null when all providers are excluded', async () => {
      const result = await routingManager.selectFallback(
        'text-to-video',
        { allowFallback: true },
        ['openai-provider', 'runway-provider']
      );

      expect(result).toBeNull();
    });
  });

  describe('registerStrategy', () => {
    it('should allow registering custom strategies', async () => {
      const customStrategy = {
        name: 'custom-strategy',
        priority: 1000, // Highest priority
        filter: vi.fn((candidates) => candidates),
        score: vi.fn((candidates) =>
          candidates.map((c: { scoreBreakdown: Record<string, number> }) => ({
            ...c,
            score: 1000,
            scoreBreakdown: { ...c.scoreBreakdown, custom: 1000 },
          }))
        ),
      };

      routingManager.registerStrategy(customStrategy);

      await routingManager.selectProvider('text-to-video');

      expect(customStrategy.filter).toHaveBeenCalled();
      expect(customStrategy.score).toHaveBeenCalled();
    });
  });
});
