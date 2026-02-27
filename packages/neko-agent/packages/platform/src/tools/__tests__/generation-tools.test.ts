/**
 * AI Generation Tools Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  GenerateImageTool,
  GenerateVideoTool,
  GenerateTTSTool,
  GenerateMusicTool,
  GenerateCharacterTool,
  TransferStyleTool,
  EnhanceVideoTool,
  OptimizeAudioTool,
  registerGenerationTools,
  type AIGenerationService,
  type GeneratedMedia,
} from '../generation-tools';
import { ToolRegistry } from '@neko/agent';

// Create a mock AI generation service
function createMockAIService(): AIGenerationService {
  const mockMedia: GeneratedMedia = {
    id: 'media-123',
    url: 'https://example.com/generated.png',
    mimeType: 'image/png',
  };

  const mockVideoMedia: GeneratedMedia = {
    id: 'video-123',
    taskId: 'task-456',
    mimeType: 'video/mp4',
  };

  return {
    generateImage: vi.fn().mockResolvedValue(mockMedia),
    generateVideo: vi.fn().mockResolvedValue(mockVideoMedia),
    generateTTS: vi.fn().mockResolvedValue({ ...mockMedia, mimeType: 'audio/mp3' }),
    generateMusic: vi.fn().mockResolvedValue({ ...mockMedia, mimeType: 'audio/mp3' }),
    generateCharacter: vi.fn().mockResolvedValue(mockMedia),
    transferStyle: vi.fn().mockResolvedValue(mockMedia),
    enhanceVideo: vi.fn().mockResolvedValue(mockVideoMedia),
    optimizeAudio: vi.fn().mockResolvedValue({ ...mockMedia, mimeType: 'audio/wav' }),
  };
}

describe('GenerateImageTool', () => {
  let tool: GenerateImageTool;
  let mockService: AIGenerationService;

  beforeEach(() => {
    mockService = createMockAIService();
    tool = new GenerateImageTool(mockService);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('GenerateImage');
    expect(tool.category).toBe('generation');
    expect(tool.requiresConfirmation).toBe(true);
  });

  it('should require prompt parameter', async () => {
    const result = await tool.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('prompt');
  });

  it('should generate image successfully', async () => {
    const result = await tool.execute({
      prompt: 'A beautiful sunset',
      size: '1024x1024',
      quality: 'hd',
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('mediaId', 'media-123');
    expect(result.data).toHaveProperty('url');
    expect(mockService.generateImage).toHaveBeenCalledWith({
      prompt: 'A beautiful sunset',
      size: '1024x1024',
      quality: 'hd',
      style: undefined,
      n: undefined,
    });
  });

  it('should handle generation failure', async () => {
    (mockService.generateImage as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('API rate limit exceeded')
    );

    const result = await tool.execute({ prompt: 'test' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('rate limit');
  });
});

describe('GenerateVideoTool', () => {
  let tool: GenerateVideoTool;
  let mockService: AIGenerationService;

  beforeEach(() => {
    mockService = createMockAIService();
    tool = new GenerateVideoTool(mockService);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('GenerateVideo');
    expect(tool.category).toBe('generation');
    expect(tool.requiresConfirmation).toBe(true);
  });

  it('should require prompt parameter', async () => {
    const result = await tool.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('prompt');
  });

  it('should generate video successfully', async () => {
    const result = await tool.execute({
      prompt: 'A running horse',
      duration: 5,
      resolution: '1080p',
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('taskId', 'task-456');
    expect(result.data).toHaveProperty('mediaId', 'video-123');
  });

  it('should return error if generateVideo not configured', async () => {
    const limitedService = { ...mockService, generateVideo: undefined };
    const limitedTool = new GenerateVideoTool(limitedService as AIGenerationService);

    const result = await limitedTool.execute({ prompt: 'test' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not configured');
  });
});

describe('GenerateTTSTool', () => {
  let tool: GenerateTTSTool;
  let mockService: AIGenerationService;

  beforeEach(() => {
    mockService = createMockAIService();
    tool = new GenerateTTSTool(mockService);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('GenerateTTS');
    expect(tool.category).toBe('generation');
    expect(tool.requiresConfirmation).toBe(true);
  });

  it('should require text parameter', async () => {
    const result = await tool.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('text');
  });

  it('should generate TTS successfully', async () => {
    const result = await tool.execute({
      text: 'Hello world',
      voice: 'en-US-Neural2-A',
      speed: 1.2,
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('mediaId');
    expect(mockService.generateTTS).toHaveBeenCalledWith({
      text: 'Hello world',
      voice: 'en-US-Neural2-A',
      language: undefined,
      speed: 1.2,
    });
  });

  it('should return error if generateTTS not configured', async () => {
    const limitedService = { ...mockService, generateTTS: undefined };
    const limitedTool = new GenerateTTSTool(limitedService as AIGenerationService);

    const result = await limitedTool.execute({ text: 'test' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not configured');
  });
});

describe('GenerateMusicTool', () => {
  let tool: GenerateMusicTool;
  let mockService: AIGenerationService;

  beforeEach(() => {
    mockService = createMockAIService();
    tool = new GenerateMusicTool(mockService);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('GenerateMusic');
    expect(tool.category).toBe('generation');
    expect(tool.requiresConfirmation).toBe(true);
  });

  it('should require prompt parameter', async () => {
    const result = await tool.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('prompt');
  });

  it('should generate music successfully', async () => {
    const result = await tool.execute({
      prompt: 'Upbeat electronic music',
      duration: 60,
      genre: 'electronic',
      mood: 'energetic',
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('mediaId');
    expect(mockService.generateMusic).toHaveBeenCalledWith({
      prompt: 'Upbeat electronic music',
      duration: 60,
      genre: 'electronic',
      mood: 'energetic',
    });
  });

  it('should return error if generateMusic not configured', async () => {
    const limitedService = { ...mockService, generateMusic: undefined };
    const limitedTool = new GenerateMusicTool(limitedService as AIGenerationService);

    const result = await limitedTool.execute({ prompt: 'test' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not configured');
  });
});

describe('GenerateCharacterTool', () => {
  let tool: GenerateCharacterTool;
  let mockService: AIGenerationService;

  beforeEach(() => {
    mockService = createMockAIService();
    tool = new GenerateCharacterTool(mockService);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('GenerateCharacter');
    expect(tool.category).toBe('generation');
    expect(tool.requiresConfirmation).toBe(true);
  });

  it('should require prompt parameter', async () => {
    const result = await tool.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('prompt');
  });

  it('should generate character successfully', async () => {
    const result = await tool.execute({
      prompt: 'A young warrior with blue eyes',
      referenceImageUrl: 'https://example.com/ref.png',
      style: 'anime',
      pose: 'standing',
      expression: 'determined',
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('mediaId');
    expect(mockService.generateCharacter).toHaveBeenCalledWith({
      prompt: 'A young warrior with blue eyes',
      referenceImageUrl: 'https://example.com/ref.png',
      style: 'anime',
      pose: 'standing',
      expression: 'determined',
    });
  });

  it('should return error if generateCharacter not configured', async () => {
    const limitedService = { ...mockService, generateCharacter: undefined };
    const limitedTool = new GenerateCharacterTool(limitedService as AIGenerationService);

    const result = await limitedTool.execute({ prompt: 'test' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not configured');
  });
});

describe('TransferStyleTool', () => {
  let tool: TransferStyleTool;
  let mockService: AIGenerationService;

  beforeEach(() => {
    mockService = createMockAIService();
    tool = new TransferStyleTool(mockService);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('TransferStyle');
    expect(tool.category).toBe('generation');
    expect(tool.requiresConfirmation).toBe(true);
  });

  it('should require sourceImageUrl and stylePrompt', async () => {
    const result = await tool.execute({ stylePrompt: 'oil painting' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('sourceImageUrl');
  });

  it('should transfer style successfully', async () => {
    const result = await tool.execute({
      sourceImageUrl: 'https://example.com/photo.jpg',
      stylePrompt: 'Van Gogh starry night style',
      styleStrength: 0.8,
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('mediaId');
    expect(mockService.transferStyle).toHaveBeenCalledWith({
      sourceImageUrl: 'https://example.com/photo.jpg',
      stylePrompt: 'Van Gogh starry night style',
      styleStrength: 0.8,
    });
  });

  it('should return error if transferStyle not configured', async () => {
    const limitedService = { ...mockService, transferStyle: undefined };
    const limitedTool = new TransferStyleTool(limitedService as AIGenerationService);

    const result = await limitedTool.execute({
      sourceImageUrl: 'https://example.com/photo.jpg',
      stylePrompt: 'oil painting',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not configured');
  });
});

describe('EnhanceVideoTool', () => {
  let tool: EnhanceVideoTool;
  let mockService: AIGenerationService;

  beforeEach(() => {
    mockService = createMockAIService();
    tool = new EnhanceVideoTool(mockService);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('EnhanceVideo');
    expect(tool.category).toBe('generation');
    expect(tool.requiresConfirmation).toBe(true);
  });

  it('should require videoUrl parameter', async () => {
    const result = await tool.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('videoUrl');
  });

  it('should enhance video successfully', async () => {
    const result = await tool.execute({
      videoUrl: 'https://example.com/video.mp4',
      targetResolution: '4k',
      denoise: true,
      stabilize: true,
      interpolateFps: 60,
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('taskId');
    expect(result.data).toHaveProperty('mediaId');
    expect(mockService.enhanceVideo).toHaveBeenCalledWith({
      videoUrl: 'https://example.com/video.mp4',
      targetResolution: '4k',
      denoise: true,
      stabilize: true,
      interpolateFps: 60,
    });
  });

  it('should return error if enhanceVideo not configured', async () => {
    const limitedService = { ...mockService, enhanceVideo: undefined };
    const limitedTool = new EnhanceVideoTool(limitedService as AIGenerationService);

    const result = await limitedTool.execute({ videoUrl: 'https://example.com/video.mp4' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not configured');
  });
});

describe('OptimizeAudioTool', () => {
  let tool: OptimizeAudioTool;
  let mockService: AIGenerationService;

  beforeEach(() => {
    mockService = createMockAIService();
    tool = new OptimizeAudioTool(mockService);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('OptimizeAudio');
    expect(tool.category).toBe('generation');
    expect(tool.requiresConfirmation).toBe(true);
  });

  it('should require audioUrl parameter', async () => {
    const result = await tool.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('audioUrl');
  });

  it('should optimize audio successfully', async () => {
    const result = await tool.execute({
      audioUrl: 'https://example.com/audio.wav',
      denoise: true,
      normalize: true,
      enhanceVoice: true,
      removeBackground: false,
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('mediaId');
    expect(mockService.optimizeAudio).toHaveBeenCalledWith({
      audioUrl: 'https://example.com/audio.wav',
      denoise: true,
      normalize: true,
      enhanceVoice: true,
      removeBackground: false,
    });
  });

  it('should return error if optimizeAudio not configured', async () => {
    const limitedService = { ...mockService, optimizeAudio: undefined };
    const limitedTool = new OptimizeAudioTool(limitedService as AIGenerationService);

    const result = await limitedTool.execute({ audioUrl: 'https://example.com/audio.wav' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not configured');
  });
});

describe('registerGenerationTools', () => {
  it('should register all generation tools', () => {
    const registry = new ToolRegistry();
    const mockService = createMockAIService();

    registerGenerationTools(registry, mockService);

    // Check all tools are registered
    expect(registry.get('GenerateImage')).toBeDefined();
    expect(registry.get('GenerateVideo')).toBeDefined();
    expect(registry.get('GenerateTTS')).toBeDefined();
    expect(registry.get('GenerateMusic')).toBeDefined();
    expect(registry.get('GenerateCharacter')).toBeDefined();
    expect(registry.get('TransferStyle')).toBeDefined();
    expect(registry.get('EnhanceVideo')).toBeDefined();
    expect(registry.get('OptimizeAudio')).toBeDefined();

    // Verify count
    const tools = registry.listByCategory('generation');
    expect(tools.length).toBe(8);
  });
});
