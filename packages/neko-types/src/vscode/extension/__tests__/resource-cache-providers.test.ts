import { describe, expect, it, vi } from 'vitest';
import { PathResolver } from '../../../path';
import type { PreviewVariantRequest } from '../../../types';
import {
  createFileThumbnailResourceRef,
  createGeneratedAssetResourceRef,
  createPreviewAssetResourceRef,
  GeneratedAssetResourceCacheProvider,
  PreviewVariantResourceCacheProvider,
  ThumbnailResourceCacheProvider,
  type ResourceCacheFileOps,
} from '../resource-cache-providers';

describe('resource cache provider adapters', () => {
  it('wraps thumbnail generation into a project resource cache entry', async () => {
    const fsOps = new FakeFileOps({
      '/legacy/thumbs/video.jpg': 'thumbnail',
    });
    const generator = {
      generate: vi.fn(async () => ({
        path: '/legacy/thumbs/video.jpg',
        width: 256,
        height: 144,
        mimeType: 'image/jpeg',
      })),
    };
    const ref = createFileThumbnailResourceRef({
      filePath: '/workspace/media/video.mp4',
      identity: { sizeBytes: 1024, mtimeMs: 42 },
    });
    const provider = new ThumbnailResourceCacheProvider({ generator, fsOps });

    const result = await provider.ensure({
      ref,
      variant: { role: 'thumbnail', width: 256, height: 144, mimeType: 'image/jpeg' },
      cacheRoot: '/workspace/.neko/.cache/resources',
    });

    expect(generator.generate).toHaveBeenCalledWith('/workspace/media/video.mp4', {
      maxWidth: 256,
      maxHeight: 144,
    });
    expect(result).toMatchObject({
      status: 'ready',
      relativePath: expect.stringMatching(/^thumbnails\/media-thumbnail\/res_/),
      mimeType: 'image/jpeg',
      width: 256,
      height: 144,
      rebuildable: true,
    });
    expect(fsOps.copyCalls[0]?.source).toBe('/legacy/thumbs/video.jpg');
    expect(fsOps.copyCalls[0]?.target).toContain('/workspace/.neko/.cache/resources/thumbnails/');
  });

  it('copies preview variants without treating preview API roots as cache identity', async () => {
    const fsOps = new FakeFileOps({
      '/engine/cache/pano-preview.webp': 'preview',
    });
    const preview = {
      registerPreviewAsset: vi.fn(async () => ({
        manifestVersion: 1 as const,
        assetId: 'preview-asset-1',
        token: 'token',
        kind: 'image' as const,
        status: 'ready' as const,
        sourceName: 'pano.jpg',
        projection: {
          type: 'flat' as const,
          confidence: 'none' as const,
          source: 'unknown' as const,
        },
        media: {
          fileSizeBytes: 100,
          mimeType: 'image/jpeg',
          dynamicRange: 'sdr' as const,
        },
        variants: [],
        createdAt: '2026-06-05T00:00:00.000Z',
      })),
      requestPreviewVariant: vi.fn(async (_assetId: string, _request: PreviewVariantRequest) => ({
        id: 'variant-1',
        assetId: 'preview-asset-1',
        role: 'thumbnail' as const,
        url: '/engine/cache/pano-preview.webp',
        mimeType: 'image/webp',
        dimensions: { width: 512, height: 256 },
        fileSizeBytes: 7,
      })),
    };
    const ref = createPreviewAssetResourceRef({
      assetId: 'preview-asset-1',
      sourcePath: '/workspace/media/pano.jpg',
      kind: 'image',
    });
    const provider = new PreviewVariantResourceCacheProvider({ preview, fsOps });

    const result = await provider.ensure({
      ref,
      variant: { role: 'fov-crop', width: 512, height: 256, format: 'webp' },
      cacheRoot: '/workspace/.neko/.cache/resources',
    });

    expect(preview.registerPreviewAsset).toHaveBeenCalledWith({
      source: '/workspace/media/pano.jpg',
      kind: 'image',
      explicitOpen: false,
    });
    expect(preview.requestPreviewVariant).toHaveBeenCalledWith('preview-asset-1', {
      role: 'fov-crop',
      width: 512,
      height: 256,
      format: 'webp',
    });
    expect(result).toMatchObject({
      status: 'ready',
      relativePath: expect.stringMatching(/^previews\/preview-variant\/res_/),
      mimeType: 'image/webp',
      width: 512,
      height: 256,
      sizeBytes: 7,
    });
  });

  it('maps generated asset metadata into source, preview, or thumbnail variants', async () => {
    const fsOps = new FakeFileOps({
      '/workspace/.neko/.cache/generated/image/shot.png': 'generated',
    });
    const ref = createGeneratedAssetResourceRef({
      assetId: 'asset-1',
      path: '/workspace/.neko/.cache/generated/image/shot.png',
      mimeType: 'image/png',
    });
    const provider = new GeneratedAssetResourceCacheProvider({ fsOps });

    const result = await provider.ensure({
      ref,
      variant: { role: 'preview', width: 1024, height: 1024, mimeType: 'image/png' },
      cacheRoot: '/workspace/.neko/.cache/resources',
    });

    expect(result).toMatchObject({
      status: 'ready',
      relativePath: expect.stringMatching(/^generated\/generated-asset\/res_/),
      mimeType: 'image/png',
      width: 1024,
      height: 1024,
    });
    expect(fsOps.copyCalls[0]).toEqual({
      source: '/workspace/.neko/.cache/generated/image/shot.png',
      target: expect.stringContaining('/workspace/.neko/.cache/resources/generated/'),
    });
  });

  it('expands generated asset variable paths before materializing previews', async () => {
    const fsOps = new FakeFileOps({
      '/workspace/.neko/.cache/generated/image/shot.png': 'generated',
    });
    const ref = createGeneratedAssetResourceRef({
      assetId: 'asset-1',
      path: '${WORKSPACE}/.neko/.cache/generated/image/shot.png',
      mimeType: 'image/png',
    });
    const provider = new GeneratedAssetResourceCacheProvider({
      fsOps,
      pathResolver: new PathResolver(new Map([['WORKSPACE', '/workspace']])),
      projectRoot: '/workspace',
    });

    const result = await provider.ensure({
      ref,
      variant: { role: 'preview', mimeType: 'image/png' },
      cacheRoot: '/workspace/.neko/.cache/resources',
    });

    expect(result.status).toBe('ready');
    expect(fsOps.copyCalls[0]?.source).toBe('/workspace/.neko/.cache/generated/image/shot.png');
  });
});

class FakeFileOps implements ResourceCacheFileOps {
  readonly files = new Map<string, string>();
  readonly mkdirCalls: string[] = [];
  readonly copyCalls: Array<{ source: string; target: string }> = [];

  constructor(files: Record<string, string>) {
    for (const [filePath, content] of Object.entries(files)) {
      this.files.set(filePath, content);
    }
  }

  async copyFile(source: string, target: string): Promise<void> {
    const content = this.files.get(source);
    if (content === undefined) throw new Error(`ENOENT: ${source}`);
    this.copyCalls.push({ source, target });
    this.files.set(target, content);
  }

  async mkdir(filePath: string): Promise<void> {
    this.mkdirCalls.push(filePath);
  }

  async stat(filePath: string): Promise<{ readonly size: number }> {
    const content = this.files.get(filePath);
    if (content === undefined) throw new Error(`ENOENT: ${filePath}`);
    return { size: content.length };
  }
}
