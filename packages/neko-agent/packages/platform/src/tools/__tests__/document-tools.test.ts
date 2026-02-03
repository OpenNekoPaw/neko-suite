/**
 * Document Tools Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  GenerateScriptTool,
  OptimizeScriptTool,
  GenerateStoryboardTool,
  GenerateSubtitlesTool,
  registerDocumentTools,
  type DocumentGenerationService,
  type ScriptResult,
  type StoryboardResult,
  type SubtitleResult,
} from '../document-tools';
import { ToolRegistry } from '../../service/tool-registry';

// Create a mock document generation service
function createMockDocumentService(): DocumentGenerationService {
  const mockScriptResult: ScriptResult = {
    script: 'Scene 1: Opening\n[Camera pans across landscape]\nNarrator: Welcome to our product demo...',
    scenes: [
      { id: 'scene-1', description: 'Opening', dialogue: 'Welcome to our product demo', duration: 10 },
      { id: 'scene-2', description: 'Features', dialogue: 'Let me show you the main features', duration: 30 },
      { id: 'scene-3', description: 'Conclusion', dialogue: 'Thank you for watching', duration: 10 },
    ],
    estimatedDuration: 50,
  };

  const mockStoryboardResult: StoryboardResult = {
    frames: [
      {
        id: 'frame-1',
        sceneNumber: 1,
        description: 'Opening shot of landscape',
        visualPrompt: 'Wide angle shot of mountain landscape at sunrise',
        cameraAngle: 'Wide shot',
        duration: 5,
      },
      {
        id: 'frame-2',
        sceneNumber: 2,
        description: 'Product reveal',
        visualPrompt: 'Close-up of product on white background',
        cameraAngle: 'Close-up',
        duration: 8,
      },
    ],
  };

  const mockSubtitleResult: SubtitleResult = {
    subtitles: [
      { id: 'sub-1', startTime: 0, endTime: 3, text: 'Welcome to our demo' },
      { id: 'sub-2', startTime: 3.5, endTime: 7, text: 'Today we will show you' },
      { id: 'sub-3', startTime: 7.5, endTime: 10, text: 'our amazing features' },
    ],
    language: 'en',
  };

  return {
    generateScript: vi.fn().mockResolvedValue(mockScriptResult),
    optimizeScript: vi.fn().mockResolvedValue(mockScriptResult),
    generateStoryboard: vi.fn().mockResolvedValue(mockStoryboardResult),
    generateSubtitles: vi.fn().mockResolvedValue(mockSubtitleResult),
  };
}

describe('GenerateScriptTool', () => {
  let tool: GenerateScriptTool;
  let mockService: DocumentGenerationService;

  beforeEach(() => {
    mockService = createMockDocumentService();
    tool = new GenerateScriptTool(mockService);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('GenerateScript');
    expect(tool.category).toBe('document');
    expect(tool.requiresConfirmation).toBe(true);
  });

  it('should require topic parameter', async () => {
    const result = await tool.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('topic');
  });

  it('should generate script successfully', async () => {
    const result = await tool.execute({
      topic: 'Product demo for new software',
      style: 'professional',
      length: '5min',
      language: 'en',
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('script');
    expect(result.data).toHaveProperty('scenes');
    expect(result.data).toHaveProperty('estimatedDuration');
    expect(mockService.generateScript).toHaveBeenCalledWith({
      topic: 'Product demo for new software',
      style: 'professional',
      length: '5min',
      language: 'en',
    });
  });

  it('should handle generation failure', async () => {
    (mockService.generateScript as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('API quota exceeded')
    );

    const result = await tool.execute({ topic: 'test' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('quota exceeded');
  });
});

describe('OptimizeScriptTool', () => {
  let tool: OptimizeScriptTool;
  let mockService: DocumentGenerationService;

  beforeEach(() => {
    mockService = createMockDocumentService();
    tool = new OptimizeScriptTool(mockService);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('OptimizeScript');
    expect(tool.category).toBe('document');
    expect(tool.requiresConfirmation).toBe(true);
  });

  it('should require scriptText parameter', async () => {
    const result = await tool.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('scriptText');
  });

  it('should optimize script successfully', async () => {
    const originalScript = 'This is my original script text...';
    const result = await tool.execute({
      scriptText: originalScript,
      optimizationType: 'engagement',
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('script');
    expect(mockService.optimizeScript).toHaveBeenCalledWith(originalScript, 'engagement');
  });

  it('should use default optimization type when not specified', async () => {
    const result = await tool.execute({
      scriptText: 'My script',
    });

    expect(result.success).toBe(true);
    expect(mockService.optimizeScript).toHaveBeenCalledWith('My script', undefined);
  });

  it('should handle optimization failure', async () => {
    (mockService.optimizeScript as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Optimization service unavailable')
    );

    const result = await tool.execute({ scriptText: 'test' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('unavailable');
  });
});

describe('GenerateStoryboardTool', () => {
  let tool: GenerateStoryboardTool;
  let mockService: DocumentGenerationService;

  beforeEach(() => {
    mockService = createMockDocumentService();
    tool = new GenerateStoryboardTool(mockService);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('GenerateStoryboard');
    expect(tool.category).toBe('document');
    expect(tool.requiresConfirmation).toBe(true);
  });

  it('should require scriptText parameter', async () => {
    const result = await tool.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('scriptText');
  });

  it('should generate storyboard successfully', async () => {
    const result = await tool.execute({
      scriptText: 'Scene 1: Opening...',
      numScenes: 10,
      style: 'realistic',
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('frames');
    expect(result.data).toHaveProperty('frameCount', 2);
    expect(mockService.generateStoryboard).toHaveBeenCalledWith({
      scriptText: 'Scene 1: Opening...',
      numScenes: 10,
      style: 'realistic',
    });
  });

  it('should handle generation failure', async () => {
    (mockService.generateStoryboard as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Storyboard generation failed')
    );

    const result = await tool.execute({ scriptText: 'test' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('generation failed');
  });
});

describe('GenerateSubtitlesTool', () => {
  let tool: GenerateSubtitlesTool;
  let mockService: DocumentGenerationService;

  beforeEach(() => {
    mockService = createMockDocumentService();
    tool = new GenerateSubtitlesTool(mockService);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('GenerateSubtitles');
    expect(tool.category).toBe('document');
    expect(tool.requiresConfirmation).toBe(true);
  });

  it('should require mediaId parameter', async () => {
    const result = await tool.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('mediaId');
  });

  it('should generate subtitles successfully', async () => {
    const result = await tool.execute({
      mediaId: 'video-123',
      language: 'en',
      maxCharsPerLine: 50,
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('subtitles');
    expect(result.data).toHaveProperty('subtitleCount', 3);
    expect(result.data).toHaveProperty('language', 'en');
    expect(mockService.generateSubtitles).toHaveBeenCalledWith('video-123', {
      language: 'en',
      maxCharsPerLine: 50,
    });
  });

  it('should return error if generateSubtitles not configured', async () => {
    const limitedService = { ...mockService, generateSubtitles: undefined };
    const limitedTool = new GenerateSubtitlesTool(limitedService as DocumentGenerationService);

    const result = await limitedTool.execute({ mediaId: 'video-123' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not configured');
  });

  it('should handle transcription failure', async () => {
    (mockService.generateSubtitles as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Transcription service error')
    );

    const result = await tool.execute({ mediaId: 'video-123' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('service error');
  });
});

describe('registerDocumentTools', () => {
  it('should register all document tools', () => {
    const registry = new ToolRegistry();
    const mockService = createMockDocumentService();

    registerDocumentTools(registry, mockService);

    // Check all tools are registered
    expect(registry.get('GenerateScript')).toBeDefined();
    expect(registry.get('OptimizeScript')).toBeDefined();
    expect(registry.get('GenerateStoryboard')).toBeDefined();
    expect(registry.get('GenerateSubtitles')).toBeDefined();

    // Verify count
    const tools = registry.listByCategory('document');
    expect(tools.length).toBe(4);
  });
});
