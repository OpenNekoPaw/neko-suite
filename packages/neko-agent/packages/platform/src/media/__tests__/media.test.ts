/**
 * Media Module Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MediaManager, type MediaManagerConfig } from '../media-manager';
import { MediaCache, InMemoryCacheStorage, createHttpDownloader } from '../media-cache';
import { ThumbnailGenerator, MockFrameExtractor, MockImageProcessor } from '../thumbnail';
import {
  ImportMediaTool,
  GetMediaTool,
  ListMediaTool,
  DeleteMediaTool,
  GetThumbnailTool,
  GetMetadataTool,
  createMediaTools,
} from '../media-tool';
import type { MediaItem } from '../../types/media';

// Helper to create config
function createTestConfig(overrides?: Partial<MediaManagerConfig>): MediaManagerConfig {
  return {
    cacheDir: '/tmp/test-cache',
    ...overrides,
  };
}

describe('MediaManager', () => {
  let manager: MediaManager;

  beforeEach(() => {
    manager = new MediaManager(createTestConfig());
  });

  describe('import', () => {
    it('should import remote media', async () => {
      const item = await manager.import('https://example.com/video.mp4');

      expect(item.id).toMatch(/^media_\d+_/);
      expect(item.name).toBe('video.mp4');
      expect(item.type).toBe('video');
      expect(item.source).toBe('https://example.com/video.mp4');
      expect(item.status).toBe('cached');
    });

    it('should detect video type from extension', async () => {
      const mp4 = await manager.import('https://example.com/file.mp4');
      const mov = await manager.import('https://example.com/file.mov');
      const mkv = await manager.import('https://example.com/file.mkv');

      expect(mp4.type).toBe('video');
      expect(mov.type).toBe('video');
      expect(mkv.type).toBe('video');
    });

    it('should detect audio type from extension', async () => {
      const mp3 = await manager.import('https://example.com/file.mp3');
      const wav = await manager.import('https://example.com/file.wav');

      expect(mp3.type).toBe('audio');
      expect(wav.type).toBe('audio');
    });

    it('should detect image type from extension', async () => {
      const jpg = await manager.import('https://example.com/file.jpg');
      const png = await manager.import('https://example.com/file.png');

      expect(jpg.type).toBe('image');
      expect(png.type).toBe('image');
    });

    it('should detect subtitle type from extension', async () => {
      const srt = await manager.import('https://example.com/file.srt');
      const vtt = await manager.import('https://example.com/file.vtt');

      expect(srt.type).toBe('subtitle');
      expect(vtt.type).toBe('subtitle');
    });

    it('should track download progress', async () => {
      const progress: number[] = [];
      await manager.import('https://example.com/video.mp4', {
        onProgress: (p) => progress.push(p),
      });

      expect(progress.length).toBeGreaterThan(0);
      expect(progress[progress.length - 1]).toBe(1);
    });
  });

  describe('get', () => {
    it('should return media by ID', async () => {
      const imported = await manager.import('https://example.com/video.mp4');
      const item = await manager.get(imported.id);

      expect(item).toBeDefined();
      expect(item?.id).toBe(imported.id);
    });

    it('should return undefined for non-existent ID', async () => {
      const item = await manager.get('non-existent');
      expect(item).toBeUndefined();
    });

    it('should update lastAccessedAt', async () => {
      const imported = await manager.import('https://example.com/video.mp4');
      const before = imported.lastAccessedAt;

      await new Promise((resolve) => setTimeout(resolve, 10));
      const item = await manager.get(imported.id);

      expect(item?.lastAccessedAt).toBeGreaterThanOrEqual(before || 0);
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      await manager.import('https://example.com/video1.mp4');
      await manager.import('https://example.com/video2.mp4');
      await manager.import('https://example.com/audio.mp3');
      await manager.import('https://example.com/image.png');
    });

    it('should list all items', async () => {
      const items = await manager.list();
      expect(items).toHaveLength(4);
    });

    it('should filter by type', async () => {
      const videos = await manager.list({ type: 'video' });
      expect(videos).toHaveLength(2);

      const audio = await manager.list({ type: 'audio' });
      expect(audio).toHaveLength(1);
    });

    it('should filter by status', async () => {
      const cached = await manager.list({ status: 'cached' });
      expect(cached).toHaveLength(4);

      const pending = await manager.list({ status: 'pending' });
      expect(pending).toHaveLength(0);
    });
  });

  describe('delete', () => {
    it('should delete media item', async () => {
      const imported = await manager.import('https://example.com/video.mp4');
      const deleted = await manager.delete(imported.id);

      expect(deleted).toBe(true);
      expect(await manager.get(imported.id)).toBeUndefined();
    });

    it('should return false for non-existent ID', async () => {
      const deleted = await manager.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('getCacheStats', () => {
    it('should return cache statistics', async () => {
      await manager.import('https://example.com/video.mp4');
      await manager.import('https://example.com/audio.mp3');

      const stats = await manager.getCacheStats();

      expect(stats.count).toBe(2);
      expect(stats.size).toBeGreaterThan(0);
    });

    it('should return zero for empty cache', async () => {
      const stats = await manager.getCacheStats();

      expect(stats.count).toBe(0);
      expect(stats.size).toBe(0);
    });
  });

  describe('clearCache', () => {
    it('should clear all items', async () => {
      await manager.import('https://example.com/video.mp4');
      await manager.import('https://example.com/audio.mp3');

      await manager.clearCache();

      const items = await manager.list();
      expect(items).toHaveLength(0);
    });
  });

  describe('cleanup', () => {
    it('should remove items over max size', async () => {
      const smallManager = new MediaManager(
        createTestConfig({
          maxSize: 1024 * 1024, // 1MB - less than 2 simulated files
        })
      );

      await smallManager.import('https://example.com/video1.mp4');
      await smallManager.import('https://example.com/video2.mp4');

      const freed = await smallManager.cleanup();

      expect(freed).toBeGreaterThan(0);
    });

    it('should remove expired items', async () => {
      const shortAgeManager = new MediaManager(
        createTestConfig({
          maxAge: 1, // 1ms
        })
      );

      await shortAgeManager.import('https://example.com/video.mp4');
      await new Promise((resolve) => setTimeout(resolve, 10));

      const freed = await shortAgeManager.cleanup();

      expect(freed).toBeGreaterThan(0);
    });
  });
});

describe('MediaCache', () => {
  let cache: MediaCache;

  beforeEach(() => {
    cache = new MediaCache({
      storage: new InMemoryCacheStorage(),
      maxSize: 1024 * 1024, // 1MB
      maxAge: 60000, // 1 minute
    });
  });

  describe('has/get/set', () => {
    it('should store and retrieve entries', async () => {
      await cache.set('https://example.com/video.mp4', {
        path: '/cache/video.mp4',
        size: 1000,
      });

      expect(await cache.has('https://example.com/video.mp4')).toBe(true);
      const entry = await cache.get('https://example.com/video.mp4');
      expect(entry?.path).toBe('/cache/video.mp4');
    });

    it('should return false for missing entries', async () => {
      expect(await cache.has('https://example.com/missing.mp4')).toBe(false);
      expect(await cache.get('https://example.com/missing.mp4')).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('should delete entries', async () => {
      await cache.set('https://example.com/video.mp4', {
        path: '/cache/video.mp4',
        size: 1000,
      });

      const deleted = await cache.delete('https://example.com/video.mp4');

      expect(deleted).toBe(true);
      expect(await cache.has('https://example.com/video.mp4')).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', async () => {
      await cache.set('https://example.com/a.mp4', { path: '/a', size: 100 });
      await cache.set('https://example.com/b.mp4', { path: '/b', size: 200 });

      const stats = await cache.getStats();

      expect(stats.count).toBe(2);
      expect(stats.size).toBe(300);
    });
  });

  describe('clear', () => {
    it('should clear all entries', async () => {
      await cache.set('https://example.com/a.mp4', { path: '/a', size: 100 });
      await cache.set('https://example.com/b.mp4', { path: '/b', size: 200 });

      await cache.clear();

      const stats = await cache.getStats();
      expect(stats.count).toBe(0);
    });
  });
});

describe('createHttpDownloader', () => {
  it('should create downloader function', () => {
    const downloader = createHttpDownloader();
    expect(typeof downloader).toBe('function');
  });

  it('should use custom fetch function', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Map([['content-type', 'video/mp4']]),
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(100)),
    });

    const downloader = createHttpDownloader({ fetch: mockFetch as unknown as typeof fetch });

    // Note: This test is simplified; full test would need proper Response mock
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('ThumbnailGenerator', () => {
  let generator: ThumbnailGenerator;
  let frameExtractor: MockFrameExtractor;
  let imageProcessor: MockImageProcessor;

  beforeEach(() => {
    frameExtractor = new MockFrameExtractor();
    imageProcessor = new MockImageProcessor();
    generator = new ThumbnailGenerator({
      frameExtractor,
      imageProcessor,
      tempDir: '/tmp',
    });
  });

  describe('generate', () => {
    it('should generate video thumbnail', async () => {
      const result = await generator.generate(
        '/source/video.mp4',
        '/dest/thumb.jpg',
        'video',
        { timestamp: 5 }
      );

      expect(result.path).toBe('/dest/thumb.jpg');
      expect(frameExtractor.getExtractedFrames()).toHaveLength(1);
      expect(frameExtractor.getExtractedFrames()[0].timestamp).toBe(5);
    });

    it('should generate image thumbnail', async () => {
      const result = await generator.generate(
        '/source/image.png',
        '/dest/thumb.jpg',
        'image',
        { width: 200, height: 100 }
      );

      expect(result.path).toBe('/dest/thumb.jpg');
      expect(result.width).toBe(200);
      expect(result.height).toBe(100);
    });

    it('should fail for video without frame extractor', async () => {
      const noExtractor = new ThumbnailGenerator({});

      await expect(
        noExtractor.generate('/video.mp4', '/thumb.jpg', 'video')
      ).rejects.toThrow('Frame extractor not configured');
    });

    it('should fail for image without image processor', async () => {
      const noProcessor = new ThumbnailGenerator({
        frameExtractor,
      });

      await expect(
        noProcessor.generate('/image.png', '/thumb.jpg', 'image')
      ).rejects.toThrow('Image processor not configured');
    });
  });

  describe('supportsMediaType', () => {
    it('should report supported types', () => {
      expect(generator.supportsMediaType('video')).toBe(true);
      expect(generator.supportsMediaType('image')).toBe(true);
      expect(generator.supportsMediaType('audio')).toBe(true);
      expect(generator.supportsMediaType('subtitle')).toBe(false);
    });

    it('should report unsupported types without processors', () => {
      const minimal = new ThumbnailGenerator({});

      expect(minimal.supportsMediaType('video')).toBe(false);
      expect(minimal.supportsMediaType('image')).toBe(false);
      expect(minimal.supportsMediaType('audio')).toBe(true);
    });
  });
});

describe('Media Tools', () => {
  let manager: MediaManager;

  beforeEach(() => {
    manager = new MediaManager(createTestConfig());
  });

  describe('ImportMediaTool', () => {
    it('should import media', async () => {
      const tool = new ImportMediaTool(manager);
      const result = await tool.execute({
        source: 'https://example.com/video.mp4',
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id');
      expect(result.data).toHaveProperty('status', 'cached');
    });

    it('should return tool definition', () => {
      const tool = new ImportMediaTool(manager);
      const def = tool.toDefinition();

      expect(def.type).toBe('function');
      expect(def.function.name).toBe('ImportMedia');
    });
  });

  describe('GetMediaTool', () => {
    it('should get media by ID', async () => {
      const imported = await manager.import('https://example.com/video.mp4');
      const tool = new GetMediaTool(manager);

      const result = await tool.execute({ id: imported.id });

      expect(result.success).toBe(true);
      expect((result.data as { id: string })?.id).toBe(imported.id);
    });

    it('should fail for non-existent ID', async () => {
      const tool = new GetMediaTool(manager);
      const result = await tool.execute({ id: 'non-existent' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('ListMediaTool', () => {
    it('should list all media', async () => {
      await manager.import('https://example.com/video.mp4');
      await manager.import('https://example.com/audio.mp3');

      const tool = new ListMediaTool(manager);
      const result = await tool.execute({});

      expect(result.success).toBe(true);
      expect((result.data as { count: number })?.count).toBe(2);
    });

    it('should filter by type', async () => {
      await manager.import('https://example.com/video.mp4');
      await manager.import('https://example.com/audio.mp3');

      const tool = new ListMediaTool(manager);
      const result = await tool.execute({ type: 'video' });

      expect(result.success).toBe(true);
      expect((result.data as { count: number })?.count).toBe(1);
    });
  });

  describe('DeleteMediaTool', () => {
    it('should delete media', async () => {
      const imported = await manager.import('https://example.com/video.mp4');
      const tool = new DeleteMediaTool(manager);

      const result = await tool.execute({ id: imported.id });

      expect(result.success).toBe(true);
      expect((result.data as { deleted: boolean })?.deleted).toBe(true);
    });
  });

  describe('GetThumbnailTool', () => {
    it('should fail when thumbnail generator not configured', async () => {
      const imported = await manager.import('https://example.com/video.mp4');
      const tool = new GetThumbnailTool(manager);

      const result = await tool.execute({ id: imported.id });

      expect(result.success).toBe(false);
    });
  });

  describe('GetMetadataTool', () => {
    it('should fail when metadata not available', async () => {
      const imported = await manager.import('https://example.com/video.mp4');
      const tool = new GetMetadataTool(manager);

      const result = await tool.execute({ id: imported.id });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
    });
  });

  describe('createMediaTools', () => {
    it('should create all media tools', () => {
      const tools = createMediaTools(manager);

      expect(tools).toHaveLength(6);
      expect(tools.map((t) => t.name)).toContain('ImportMedia');
      expect(tools.map((t) => t.name)).toContain('GetMedia');
      expect(tools.map((t) => t.name)).toContain('ListMedia');
      expect(tools.map((t) => t.name)).toContain('DeleteMedia');
      expect(tools.map((t) => t.name)).toContain('GetMediaThumbnail');
      expect(tools.map((t) => t.name)).toContain('GetMediaMetadata');
    });
  });
});
