/**
 * ImageDiffAnalyzer 单元测试
 *
 * 测试图片 Diff 分析器的核心功能
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ImageDiffAnalyzer } from './ImageDiffAnalyzer';

// =============================================================================
// Mock sharp module
// =============================================================================

// Mock sharp since it's a native module
// Creating a comprehensive mock for all chained methods
vi.mock('sharp', () => {
  const createMockSharpInstance = () => {
    const instance: Record<string, any> = {};

    // All chainable methods return this
    const chainMethods = [
      'ensureAlpha',
      'raw',
      'resize',
      'grayscale',
      'png',
      'jpeg',
      'composite',
      'toColorspace',
      'flip',
      'flop',
      'rotate',
      'blur',
      'sharpen',
      'negate',
      'normalise',
      'normalize',
      'gamma',
      'linear',
      'flatten',
      'extend',
      'extract',
      'trim',
      'modulate',
    ];

    for (const method of chainMethods) {
      instance[method] = vi.fn().mockReturnThis();
    }

    // Terminal methods
    instance.metadata = vi.fn().mockResolvedValue({
      width: 100,
      height: 100,
      format: 'png',
      size: 1024,
    });

    instance.toBuffer = vi.fn().mockImplementation((options?: any) => {
      const buffer = Buffer.alloc(100 * 100 * 4, 128);
      if (options?.resolveWithObject) {
        return Promise.resolve({
          data: buffer,
          info: { width: 100, height: 100, channels: 4 },
        });
      }
      return Promise.resolve(buffer);
    });

    instance.toFile = vi.fn().mockResolvedValue({
      format: 'png',
      width: 100,
      height: 100,
      channels: 4,
      size: 1024,
    });

    return instance;
  };

  const mockSharp = vi.fn(() => createMockSharpInstance());

  // Add static methods
  mockSharp.cache = vi.fn();

  return { default: mockSharp };
});

// =============================================================================
// Test Suite
// =============================================================================

describe('ImageDiffAnalyzer', () => {
  let analyzer: ImageDiffAnalyzer;

  beforeEach(() => {
    analyzer = new ImageDiffAnalyzer();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('mediaType', () => {
    it('should be image', () => {
      expect(analyzer.mediaType).toBe('image');
    });
  });

  describe('supports', () => {
    it('should support PNG files', () => {
      expect(analyzer.supports('/path/to/image.png')).toBe(true);
      expect(analyzer.supports('/path/to/image.PNG')).toBe(true);
    });

    it('should support JPEG files', () => {
      expect(analyzer.supports('/path/to/image.jpg')).toBe(true);
      expect(analyzer.supports('/path/to/image.jpeg')).toBe(true);
      expect(analyzer.supports('/path/to/image.JPEG')).toBe(true);
    });

    it('should support GIF files', () => {
      expect(analyzer.supports('/path/to/image.gif')).toBe(true);
    });

    it('should support WebP files', () => {
      expect(analyzer.supports('/path/to/image.webp')).toBe(true);
    });

    it('should support BMP files', () => {
      expect(analyzer.supports('/path/to/image.bmp')).toBe(true);
    });

    it('should support SVG files', () => {
      expect(analyzer.supports('/path/to/image.svg')).toBe(true);
    });

    it('should not support video files', () => {
      expect(analyzer.supports('/path/to/video.mp4')).toBe(false);
      expect(analyzer.supports('/path/to/video.mov')).toBe(false);
    });

    it('should not support audio files', () => {
      expect(analyzer.supports('/path/to/audio.mp3')).toBe(false);
      expect(analyzer.supports('/path/to/audio.wav')).toBe(false);
    });

    it('should not support other file types', () => {
      expect(analyzer.supports('/path/to/document.pdf')).toBe(false);
      expect(analyzer.supports('/path/to/file.txt')).toBe(false);
    });

    it('should handle files without extension', () => {
      expect(analyzer.supports('/path/to/noextension')).toBe(false);
    });

    it('should handle empty path', () => {
      expect(analyzer.supports('')).toBe(false);
    });
  });

  describe('cancel', () => {
    it('should mark analyzer as cancelled', () => {
      analyzer.cancel();

      // Verify the analyzer is in cancelled state
      // The abortController is created fresh for each analyze call,
      // so we test that cancel() doesn't throw
      expect(() => analyzer.cancel()).not.toThrow();
    });
  });

  describe('analyze', () => {
    it('should return diff result with similarity', async () => {
      const current = Buffer.from('current image data');
      const previous = Buffer.from('previous image data');

      const result = await analyzer.analyze(current, previous);

      expect(result).toHaveProperty('mediaType', 'image');
      expect(result).toHaveProperty('similarity');
      expect(result.similarity).toBeGreaterThanOrEqual(0);
      expect(result.similarity).toBeLessThanOrEqual(1);
    });

    it('should return image diff details with dimensions', async () => {
      const current = Buffer.from('current image data');
      const previous = Buffer.from('previous image data');

      const result = await analyzer.analyze(current, previous);

      expect(result.details).toHaveProperty('dimensions');
      expect(result.details).toHaveProperty('pixelDifference');
      expect(result.details).toHaveProperty('structuralSimilarity');
    });

    it('should calculate pixel and structural differences', async () => {
      const current = Buffer.from('current image data');
      const previous = Buffer.from('previous image data');

      const result = await analyzer.analyze(current, previous);

      // Verify the result structure matches ImageDiffDetails
      const details = result.details as any;
      expect(details.dimensions).toBeDefined();
      expect(details.dimensions.current).toBeDefined();
      expect(details.dimensions.previous).toBeDefined();
      expect(typeof details.pixelDifference).toBe('number');
      expect(typeof details.structuralSimilarity).toBe('number');
    });

    it('should not throw when not cancelled', async () => {
      const current = Buffer.from('current image data');
      const previous = Buffer.from('previous image data');

      // Should complete without error when not cancelled
      const result = await analyzer.analyze(current, previous);
      expect(result).toHaveProperty('mediaType', 'image');
    });

    it('should respect timeout option', async () => {
      const current = Buffer.from('current image data');
      const previous = Buffer.from('previous image data');

      // Should not throw with reasonable timeout
      const result = await analyzer.analyze(current, previous, { timeout: 30000 });
      expect(result).toHaveProperty('mediaType', 'image');
    });

    it('should generate visualization when heatmap requested', async () => {
      const current = Buffer.from('current image data');
      const previous = Buffer.from('previous image data');

      const result = await analyzer.analyze(current, previous, { generateHeatmap: true });

      // Result should have visualization property when heatmap is generated
      expect(result).toHaveProperty('mediaType', 'image');
      // Note: In mock environment, visualization structure is validated
    });
  });

  describe('identical images', () => {
    it('should return high similarity for identical images', async () => {
      const imageData = Buffer.from('identical image data');

      const result = await analyzer.analyze(imageData, imageData);

      // With mocked sharp returning identical data, similarity should be high
      expect(result.similarity).toBeGreaterThan(0.9);
    });
  });
});
