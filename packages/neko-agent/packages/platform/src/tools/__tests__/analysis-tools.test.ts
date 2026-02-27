/**
 * AI Analysis Tools Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AnalyzeImageTool,
  ExtractImageTextTool,
  AnalyzeVideoTool,
  ExtractVideoSummaryTool,
  registerAnalysisTools,
  type VisionAnalysisService,
  type AnalysisResult,
  type VideoAnalysisResult,
  type TextExtractionResult,
} from '../analysis-tools';
import { ToolRegistry } from '@neko/agent';

// Create a mock vision analysis service
function createMockVisionService(): VisionAnalysisService {
  const mockAnalysisResult: AnalysisResult = {
    description: 'A beautiful landscape with mountains and a lake',
    confidence: 0.95,
    details: {
      objects: ['mountain', 'lake', 'tree'],
      colors: ['blue', 'green', 'white'],
    },
  };

  const mockVideoResult: VideoAnalysisResult = {
    description: 'A person walking through a forest',
    confidence: 0.92,
    scenes: [
      { startTime: 0, endTime: 5, description: 'Forest entrance' },
      { startTime: 5, endTime: 10, description: 'Walking through trees' },
      { startTime: 10, endTime: 15, description: 'Clearing with sunlight' },
    ],
    summary: 'A short video showing someone exploring a forest path from entrance to a sunny clearing.',
  };

  const mockTextResult: TextExtractionResult = {
    text: 'Hello World\nThis is a test',
    blocks: [
      { text: 'Hello World', confidence: 0.99, boundingBox: { x: 10, y: 10, width: 100, height: 20 } },
      { text: 'This is a test', confidence: 0.97, boundingBox: { x: 10, y: 40, width: 120, height: 20 } },
    ],
  };

  return {
    analyzeImage: vi.fn().mockResolvedValue(mockAnalysisResult),
    analyzeVideo: vi.fn().mockResolvedValue(mockVideoResult),
    extractText: vi.fn().mockResolvedValue(mockTextResult),
  };
}

describe('AnalyzeImageTool', () => {
  let tool: AnalyzeImageTool;
  let mockService: VisionAnalysisService;

  beforeEach(() => {
    mockService = createMockVisionService();
    tool = new AnalyzeImageTool(mockService);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('AnalyzeImage');
    expect(tool.category).toBe('analysis');
    expect(tool.requiresConfirmation).toBe(false);
  });

  it('should require imageId parameter', async () => {
    const result = await tool.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('imageId');
  });

  it('should analyze image successfully', async () => {
    const result = await tool.execute({
      imageId: 'img-123',
      analysisType: 'description',
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('description');
    expect(result.data).toHaveProperty('confidence');
    expect(mockService.analyzeImage).toHaveBeenCalledWith('img-123', {
      analysisType: 'description',
      prompt: undefined,
    });
  });

  it('should pass custom prompt', async () => {
    const result = await tool.execute({
      imageId: 'img-123',
      prompt: 'What objects are in this image?',
    });

    expect(result.success).toBe(true);
    expect(mockService.analyzeImage).toHaveBeenCalledWith('img-123', {
      analysisType: undefined,
      prompt: 'What objects are in this image?',
    });
  });

  it('should handle analysis failure', async () => {
    (mockService.analyzeImage as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Vision API unavailable')
    );

    const result = await tool.execute({ imageId: 'img-123' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Vision API unavailable');
  });
});

describe('ExtractImageTextTool', () => {
  let tool: ExtractImageTextTool;
  let mockService: VisionAnalysisService;

  beforeEach(() => {
    mockService = createMockVisionService();
    tool = new ExtractImageTextTool(mockService);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('ExtractImageText');
    expect(tool.category).toBe('analysis');
    expect(tool.requiresConfirmation).toBe(false);
  });

  it('should require imageId parameter', async () => {
    const result = await tool.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('imageId');
  });

  it('should extract text successfully', async () => {
    const result = await tool.execute({
      imageId: 'img-123',
      language: 'en',
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('text', 'Hello World\nThis is a test');
    expect(result.data).toHaveProperty('blocks');
    expect(mockService.extractText).toHaveBeenCalledWith('img-123', 'en');
  });

  it('should return error if extractText not configured', async () => {
    const limitedService = { ...mockService, extractText: undefined };
    const limitedTool = new ExtractImageTextTool(limitedService as VisionAnalysisService);

    const result = await limitedTool.execute({ imageId: 'img-123' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not configured');
  });

  it('should handle extraction failure', async () => {
    (mockService.extractText as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('OCR service error')
    );

    const result = await tool.execute({ imageId: 'img-123' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('OCR service error');
  });
});

describe('AnalyzeVideoTool', () => {
  let tool: AnalyzeVideoTool;
  let mockService: VisionAnalysisService;

  beforeEach(() => {
    mockService = createMockVisionService();
    tool = new AnalyzeVideoTool(mockService);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('AnalyzeVideo');
    expect(tool.category).toBe('analysis');
    expect(tool.requiresConfirmation).toBe(false);
  });

  it('should require videoId parameter', async () => {
    const result = await tool.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('videoId');
  });

  it('should analyze video successfully', async () => {
    const result = await tool.execute({
      videoId: 'video-123',
      analysisType: 'scene-detection',
      sampleInterval: 2,
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('description');
    expect(result.data).toHaveProperty('scenes');
    expect(result.data).toHaveProperty('summary');
    expect(mockService.analyzeVideo).toHaveBeenCalledWith('video-123', {
      analysisType: 'scene-detection',
      sampleInterval: 2,
    });
  });

  it('should return error if analyzeVideo not configured', async () => {
    const limitedService = { ...mockService, analyzeVideo: undefined };
    const limitedTool = new AnalyzeVideoTool(limitedService as VisionAnalysisService);

    const result = await limitedTool.execute({ videoId: 'video-123' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not configured');
  });

  it('should handle analysis failure', async () => {
    (mockService.analyzeVideo as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Video processing failed')
    );

    const result = await tool.execute({ videoId: 'video-123' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Video processing failed');
  });
});

describe('ExtractVideoSummaryTool', () => {
  let tool: ExtractVideoSummaryTool;
  let mockService: VisionAnalysisService;

  beforeEach(() => {
    mockService = createMockVisionService();
    tool = new ExtractVideoSummaryTool(mockService);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('ExtractVideoSummary');
    expect(tool.category).toBe('analysis');
    expect(tool.requiresConfirmation).toBe(false);
  });

  it('should require videoId parameter', async () => {
    const result = await tool.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('videoId');
  });

  it('should extract summary successfully', async () => {
    const result = await tool.execute({
      videoId: 'video-123',
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('summary');
    expect(result.data).toHaveProperty('scenes');
    expect(mockService.analyzeVideo).toHaveBeenCalledWith('video-123', {
      analysisType: 'summary',
      maxFrames: 20,
    });
  });

  it('should truncate summary to maxLength', async () => {
    const longSummary = 'A'.repeat(600);
    (mockService.analyzeVideo as ReturnType<typeof vi.fn>).mockResolvedValue({
      description: 'test',
      summary: longSummary,
      scenes: [],
    });

    const result = await tool.execute({
      videoId: 'video-123',
      maxLength: 100,
    });

    expect(result.success).toBe(true);
    const summary = (result.data as { summary: string }).summary;
    expect(summary.length).toBeLessThanOrEqual(100);
    expect(summary.endsWith('...')).toBe(true);
  });

  it('should return error if analyzeVideo not configured', async () => {
    const limitedService = { ...mockService, analyzeVideo: undefined };
    const limitedTool = new ExtractVideoSummaryTool(limitedService as VisionAnalysisService);

    const result = await limitedTool.execute({ videoId: 'video-123' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not configured');
  });
});

describe('registerAnalysisTools', () => {
  it('should register all analysis tools', () => {
    const registry = new ToolRegistry();
    const mockService = createMockVisionService();

    registerAnalysisTools(registry, mockService);

    // Check all tools are registered
    expect(registry.get('AnalyzeImage')).toBeDefined();
    expect(registry.get('ExtractImageText')).toBeDefined();
    expect(registry.get('AnalyzeVideo')).toBeDefined();
    expect(registry.get('ExtractVideoSummary')).toBeDefined();

    // Verify count
    const tools = registry.listByCategory('analysis');
    expect(tools.length).toBe(4);
  });
});
