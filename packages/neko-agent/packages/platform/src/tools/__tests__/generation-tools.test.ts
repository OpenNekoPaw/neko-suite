/**
 * AI Generation Tools Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  GenerateImageTool,
  GenerateVideoTool,
  GenerateTTSTool,
  GenerateMusicTool,
  registerGenerationTools,
  type AIGenerationService,
  type GeneratedMedia,
} from '../generation';
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

    // Verify count
    const tools = registry.listByCategory('generation');
    expect(tools.length).toBe(4);
  });
});
