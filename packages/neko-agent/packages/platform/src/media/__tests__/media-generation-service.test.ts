/**
 * Media Generation Service Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Task } from '@neko/shared';
import { MediaGenerationService } from '../media-generation-service';
import { MediaRoutingManager } from '../routing/media-routing-manager';
import { MediaTaskExecutor } from '../media-task-executor';
import { TaskManager } from '@neko/agent';
import { ProviderRegistry } from '../../provider/provider-registry';
import { ConfigManager } from '../../config/config-manager';
import { getMediaAdapterRegistry } from '../adapters/media-adapter-registry';
import { OpenAICompatMediaAdapter } from '../adapters/openai-compat-media-adapter';
import type { Provider, Model } from '../../types/provider';

describe('MediaGenerationService', () => {
  let service: MediaGenerationService;
  let taskManager: TaskManager;
  let providerRegistry: ProviderRegistry;
  let routingManager: MediaRoutingManager;

  const mockProvider: Provider = {
    id: 'openai-provider',
    name: 'openai',
    displayName: 'OpenAI',
    type: 'openai',
    apiUrl: 'https://api.openai.com',
    apiKey: 'test-key',
    enabled: true,
  };

  const mockModel: Model = {
    id: 'dalle-model',
    name: 'dall-e-3',
    displayName: 'DALL-E 3',
    providerId: 'openai-provider',
    capabilities: ['text_to_image'],
    enabled: true,
  };

  beforeEach(() => {
    // Setup adapter registry
    const registry = getMediaAdapterRegistry();
    registry.registerBuiltin('openai', new OpenAICompatMediaAdapter());

    // Create mock config manager
    const configManager = {
      getProvider: () => mockProvider,
      getProviders: () => [mockProvider],
      getEnabledProviders: () => [mockProvider],
      getModel: () => mockModel,
      getModels: () => [mockModel],
      getEnabledModels: () => [mockModel],
      getModelsByProvider: () => [mockModel],
      getDefaultModelRef: () => ({ providerId: 'openai-provider', modelId: 'dalle-model' }),
    } as unknown as ConfigManager;

    // Create components
    providerRegistry = new ProviderRegistry(configManager);
    taskManager = new TaskManager();
    routingManager = new MediaRoutingManager(providerRegistry, configManager);

    // Register executor
    const executor = new MediaTaskExecutor(providerRegistry, configManager);
    executor.registerWith(taskManager);

    // Create service
    service = new MediaGenerationService(taskManager, providerRegistry, routingManager);
  });

  describe('generateImage', () => {
    it('should submit image generation task', async () => {
      const request = {
        prompt: 'A beautiful sunset',
        width: 1024,
        height: 1024,
      };

      const task = await service.generateImage(request);

      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.type).toBe('text-to-image');
      expect(task.status).toBe('pending');
      expect(task.providerId).toBe('openai-provider');
      expect(task.modelId).toBe('dalle-model');
    });

    it('stores the routed provider and model in the queued task payload', async () => {
      const routingManager = {
        selectProvider: vi.fn().mockResolvedValue({
          providerId: 'locked-provider',
          modelId: 'locked-model',
          score: 100,
          reason: 'submitted model selection',
        }),
      } as unknown as MediaRoutingManager;
      const taskManager = new TaskManager();
      const newService = new MediaGenerationService(taskManager, providerRegistry, routingManager);

      const task = await newService.generateImage({
        prompt: 'A locked model render',
        providerId: 'locked-provider',
        modelId: 'locked-model',
      });

      const queuedTask = await taskManager.get(task.id);
      expect(routingManager.selectProvider).toHaveBeenCalledWith(
        'text-to-image',
        undefined,
        'locked-provider',
        'locked-model',
      );
      expect(queuedTask?.input.payload).toMatchObject({
        generationType: 'text-to-image',
        providerId: 'locked-provider',
        modelId: 'locked-model',
        request: expect.objectContaining({
          providerId: 'locked-provider',
          modelId: 'locked-model',
        }),
      });
      expect(queuedTask?.input.options?.retry?.maxRetries).toBe(0);
    });

    it('should detect image-to-image when reference image is provided', async () => {
      // Add image-to-image capability to mock model for this test
      const img2imgModel: Model = {
        ...mockModel,
        id: 'img2img-model',
        capabilities: ['image_to_image'],
      };

      const configManager = {
        getProvider: () => mockProvider,
        getProviders: () => [mockProvider],
        getEnabledProviders: () => [mockProvider],
        getModel: () => img2imgModel,
        getModels: () => [img2imgModel],
        getEnabledModels: () => [img2imgModel],
        getModelsByProvider: () => [img2imgModel],
        getDefaultModelRef: () => ({ providerId: 'openai-provider', modelId: 'img2img-model' }),
      } as unknown as ConfigManager;

      const newProviderRegistry = new ProviderRegistry(configManager);
      const newRoutingManager = new MediaRoutingManager(newProviderRegistry, configManager);
      const newService = new MediaGenerationService(
        taskManager,
        newProviderRegistry,
        newRoutingManager,
      );

      const request = {
        prompt: 'Make it more colorful',
        referenceImageUrl: 'https://example.com/image.jpg',
      };

      const task = await newService.generateImage(request);

      expect(task.type).toBe('image-to-image');
    });
  });

  describe('generateVideo', () => {
    it('should submit video generation task', async () => {
      // Add video capability to mock model for this test
      const videoModel: Model = {
        ...mockModel,
        id: 'sora-model',
        capabilities: ['text_to_video'],
      };

      const configManager = {
        getProvider: () => mockProvider,
        getProviders: () => [mockProvider],
        getEnabledProviders: () => [mockProvider],
        getModel: () => videoModel,
        getModels: () => [videoModel],
        getEnabledModels: () => [videoModel],
        getModelsByProvider: () => [videoModel],
        getDefaultModelRef: () => ({ providerId: 'openai-provider', modelId: 'sora-model' }),
      } as unknown as ConfigManager;

      const newProviderRegistry = new ProviderRegistry(configManager);
      const newRoutingManager = new MediaRoutingManager(newProviderRegistry, configManager);
      const newService = new MediaGenerationService(
        taskManager,
        newProviderRegistry,
        newRoutingManager,
      );

      const request = {
        prompt: 'A rocket launching into space',
        duration: 5,
      };

      const task = await newService.generateVideo(request);

      expect(task).toBeDefined();
      expect(task.type).toBe('text-to-video');
    });

    it('should detect image-to-video when reference image is provided', async () => {
      const videoModel: Model = {
        ...mockModel,
        id: 'sora-model',
        capabilities: ['image_to_video'],
      };

      const configManager = {
        getProvider: () => mockProvider,
        getProviders: () => [mockProvider],
        getEnabledProviders: () => [mockProvider],
        getModel: () => videoModel,
        getModels: () => [videoModel],
        getEnabledModels: () => [videoModel],
        getModelsByProvider: () => [videoModel],
        getDefaultModelRef: () => ({ providerId: 'openai-provider', modelId: 'sora-model' }),
      } as unknown as ConfigManager;

      const newProviderRegistry = new ProviderRegistry(configManager);
      const newRoutingManager = new MediaRoutingManager(newProviderRegistry, configManager);
      const newService = new MediaGenerationService(
        taskManager,
        newProviderRegistry,
        newRoutingManager,
      );

      const request = {
        prompt: 'Animate this image',
        referenceImageUrl: 'https://example.com/image.jpg',
      };

      const task = await newService.generateVideo(request);

      expect(task.type).toBe('image-to-video');
    });

    it('should detect image-to-video from local or materialized reference image inputs', async () => {
      const videoModel: Model = {
        ...mockModel,
        id: 'sora-model',
        capabilities: ['image_to_video'],
      };

      const configManager = {
        getProvider: () => mockProvider,
        getProviders: () => [mockProvider],
        getEnabledProviders: () => [mockProvider],
        getModel: () => videoModel,
        getModels: () => [videoModel],
        getEnabledModels: () => [videoModel],
        getModelsByProvider: () => [videoModel],
        getDefaultModelRef: () => ({ providerId: 'openai-provider', modelId: 'sora-model' }),
      } as unknown as ConfigManager;

      const newProviderRegistry = new ProviderRegistry(configManager);
      const newRoutingManager = new MediaRoutingManager(newProviderRegistry, configManager);
      const newService = new MediaGenerationService(
        taskManager,
        newProviderRegistry,
        newRoutingManager,
      );

      await expect(
        newService.generateVideo({
          prompt: 'Animate this image',
          referenceImageBase64: 'base64',
        }),
      ).resolves.toMatchObject({ type: 'image-to-video' });

      await expect(
        newService.generateVideo({
          prompt: 'Animate this image',
          referenceImageUri: 'file:///tmp/reference.png',
        }),
      ).resolves.toMatchObject({ type: 'image-to-video' });

      await expect(
        newService.generateVideo({
          prompt: 'Animate this image',
          startFrameImageBase64: 'base64',
        }),
      ).resolves.toMatchObject({ type: 'image-to-video' });
    });
  });

  describe('generateAudio', () => {
    it('should submit audio generation task', async () => {
      const audioModel: Model = {
        ...mockModel,
        id: 'audio-model',
        capabilities: ['text_to_audio'],
      };

      const configManager = {
        getProvider: () => mockProvider,
        getProviders: () => [mockProvider],
        getEnabledProviders: () => [mockProvider],
        getModel: () => audioModel,
        getModels: () => [audioModel],
        getEnabledModels: () => [audioModel],
        getModelsByProvider: () => [audioModel],
        getDefaultModelRef: () => ({ providerId: 'openai-provider', modelId: 'audio-model' }),
      } as unknown as ConfigManager;

      const newProviderRegistry = new ProviderRegistry(configManager);
      const newRoutingManager = new MediaRoutingManager(newProviderRegistry, configManager);
      const newService = new MediaGenerationService(
        taskManager,
        newProviderRegistry,
        newRoutingManager,
      );

      const request = {
        prompt: 'A soothing ambient soundscape',
        duration: 30,
      };

      const task = await newService.generateAudio(request);

      expect(task).toBeDefined();
      expect(task.type).toBe('text-to-audio');
    });

    it('should detect music generation when isMusic is true', async () => {
      const musicModel: Model = {
        ...mockModel,
        id: 'music-model',
        capabilities: ['text_to_music'],
      };

      const configManager = {
        getProvider: () => mockProvider,
        getProviders: () => [mockProvider],
        getEnabledProviders: () => [mockProvider],
        getModel: () => musicModel,
        getModels: () => [musicModel],
        getEnabledModels: () => [musicModel],
        getModelsByProvider: () => [musicModel],
        getDefaultModelRef: () => ({ providerId: 'openai-provider', modelId: 'music-model' }),
      } as unknown as ConfigManager;

      const newProviderRegistry = new ProviderRegistry(configManager);
      const newRoutingManager = new MediaRoutingManager(newProviderRegistry, configManager);
      const newService = new MediaGenerationService(
        taskManager,
        newProviderRegistry,
        newRoutingManager,
      );

      const request = {
        prompt: 'An upbeat electronic track',
        isMusic: true,
        genre: 'electronic',
      };

      const task = await newService.generateAudio(request);

      expect(task.type).toBe('text-to-music');
    });
  });

  describe('getTask', () => {
    it('should return task by ID', async () => {
      const request = { prompt: 'Test' };
      const submitted = await service.generateImage(request);

      const task = await service.getTask(submitted.id);

      expect(task).toBeDefined();
      expect(task?.id).toBe(submitted.id);
    });

    it('should return undefined for unknown task', async () => {
      const task = await service.getTask('unknown-task-id');

      expect(task).toBeUndefined();
    });
  });

  describe('cancelTask', () => {
    it('should cancel a pending task', async () => {
      const request = { prompt: 'Test' };
      const submitted = await service.generateImage(request);

      const cancelled = await service.cancelTask(submitted.id);

      expect(cancelled).toBe(true);
    });

    it('should return false for unknown task', async () => {
      const cancelled = await service.cancelTask('unknown-task-id');

      expect(cancelled).toBe(false);
    });
  });

  describe('onProgress', () => {
    it('should subscribe to progress updates', async () => {
      const request = { prompt: 'Test' };
      const submitted = await service.generateImage(request);

      const progressCallback = vi.fn();
      const unsubscribe = service.onProgress(submitted.id, progressCallback);

      expect(typeof unsubscribe).toBe('function');

      // Cleanup
      unsubscribe();
    });
  });
});
