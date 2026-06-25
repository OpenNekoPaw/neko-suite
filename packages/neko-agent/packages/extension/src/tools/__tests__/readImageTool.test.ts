import { describe, expect, it, vi } from 'vitest';
import {
  TOOL_NAMES_SYSTEM,
  createResourceFingerprint,
  createResourceRef,
  type ToolResult,
} from '@neko/shared';
import { createWorkspaceFileAccessPolicy } from '@neko/agent/tools';
import { READ_IMAGE_MODEL_ANALYSIS_UNSUPPORTED, createReadImageTool } from '../readImageTool';

const WORKSPACE_ROOT = '/workspace';

const PNG_1X1 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);

function createFileAccessPolicy() {
  return createWorkspaceFileAccessPolicy({
    workspaceRoot: WORKSPACE_ROOT,
    ignoredPathExemptRoots: [`${WORKSPACE_ROOT}/.neko/.cache/resources`],
  });
}

describe('createReadImageTool', () => {
  it('creates a read-only image tool', () => {
    const tool = createReadImageTool();

    expect(tool.name).toBe(TOOL_NAMES_SYSTEM.READ_IMAGE);
    expect(tool.category).toBe('analysis');
    expect(tool.isReadOnly).toBe(true);
    expect(tool.isConcurrencySafe).toBe(true);
    expect(tool.description).toContain('ReadDocument imagePaths');
    expect(tool.description).toContain('use this tool directly instead of ReadDocumentImage');
    expect(tool.parameters).not.toHaveProperty('anyOf');
    expect(tool.parameters).not.toHaveProperty('oneOf');
    expect(tool.parameters).not.toHaveProperty('allOf');
    expect(tool.parameters.properties?.['images']).toEqual(
      expect.objectContaining({
        items: expect.objectContaining({
          properties: expect.objectContaining({
            path: { type: 'string' },
            runtimePath: { type: 'string' },
            runtimeKind: expect.objectContaining({
              enum: ['local-path', 'webview-uri', 'scratch-cache', 'managed-cache'],
            }),
            resourceRef: expect.objectContaining({ type: 'object' }),
            cacheResourceRef: expect.objectContaining({ type: 'object' }),
          }),
        }),
      }),
    );
  });

  it('reads local image metadata without invoking vision', async () => {
    const readFile = vi.fn(async () => PNG_1X1);
    const tool = createReadImageTool({
      readFile,
      now: () => 1234,
      fileAccessPolicy: createFileAccessPolicy(),
    });

    const result = (await tool.execute({
      image_paths: ['/workspace/images/page.png'],
      mode: 'metadata',
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(readFile).toHaveBeenCalledWith('/workspace/images/page.png');
    expect(result.attachments).toEqual([
      expect.objectContaining({
        type: 'image',
        path: '/workspace/images/page.png',
        mimeType: 'image/png',
        assetRef: expect.objectContaining({
          uri: '/workspace/images/page.png',
          mimeType: 'image/png',
        }),
      }),
    ]);
    expect(result.perceptionCards).toEqual([
      expect.objectContaining({
        version: 1,
        modality: 'image',
        createdAt: 1234,
        layerStatus: { layer0: 'complete', layer1: 'skipped', layer2: 'complete' },
        structural: expect.objectContaining({
          format: 'png',
          mimeType: 'image/png',
          byteSize: PNG_1X1.byteLength,
          width: 1,
          height: 1,
        }),
        perceptual: expect.objectContaining({
          keyframeRefs: [
            expect.objectContaining({
              uri: '/workspace/images/page.png',
              mimeType: 'image/png',
            }),
          ],
        }),
      }),
    ]);
    expect(result.data).toEqual(
      expect.objectContaining({
        mode: 'metadata',
        images: [
          expect.objectContaining({
            path: '/workspace/images/page.png',
            width: 1,
            height: 1,
            mimeType: 'image/png',
            byteSize: PNG_1X1.byteLength,
          }),
        ],
      }),
    );
  });

  it('fails closed for local images when no authorized workspace policy is provided', async () => {
    const readFile = vi.fn(async () => PNG_1X1);
    const tool = createReadImageTool({ readFile });

    const result = (await tool.execute({
      image_paths: ['/workspace/images/page.png'],
      mode: 'metadata',
    })) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error).toContain('no authorized workspace root');
    expect(readFile).not.toHaveBeenCalled();
  });

  it('preserves document resource refs from structured image inputs', async () => {
    const readFile = vi.fn(async () => PNG_1X1);
    const tool = createReadImageTool({ readFile, fileAccessPolicy: createFileAccessPolicy() });
    const resourceRef = {
      kind: 'document-entry' as const,
      source: { filePath: '${BOOKS}/comic.epub', format: 'epub' as const },
      entryPath: 'OPS/images/moe-018893.jpg',
      cachePath: '/workspace/.neko/.cache/resources/documents/doc_comic/OPS/images/moe-018893.jpg',
    };
    const cacheResourceRef = {
      id: 'res_stable',
      scope: 'project' as const,
      provider: 'document-archive',
      kind: 'document' as const,
      source: {
        kind: 'document' as const,
        document: { filePath: '${BOOKS}/comic.epub', format: 'epub' as const },
      },
      locator: { kind: 'document' as const, entryPath: 'OPS/images/moe-018893.jpg' },
      fingerprint: { strategy: 'provider' as const, value: 'comic-v1' },
    };

    const result = (await tool.execute({
      images: [
        {
          path: '/workspace/.neko/.cache/resources/documents/page_1.jpg',
          label: 'page_1',
          resourceRef,
          cacheResourceRef,
        },
      ],
      mode: 'metadata',
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        images: [
          expect.objectContaining({
            path: '/workspace/.neko/.cache/resources/documents/page_1.jpg',
            label: 'page_1',
            resourceRef: {
              kind: 'document-entry',
              source: { filePath: '${BOOKS}/comic.epub', format: 'epub' },
              entryPath: 'OPS/images/moe-018893.jpg',
            },
            cacheResourceRef,
          }),
        ],
      }),
    );
    expect(JSON.stringify(result.data)).not.toContain('"cachePath"');
  });

  it('restores document resource refs from unified cache image paths', async () => {
    const readFile = vi.fn(async () => PNG_1X1);
    const cachePath =
      '/workspace/.neko/.cache/resources/documents/doc_comic/OPS/images/moe-018893.jpg';
    const cacheResourceRef = createResourceRef({
      id: 'res_x',
      scope: 'project',
      provider: 'document-archive',
      kind: 'document',
      source: {
        kind: 'document',
        document: { filePath: '${BOOKS}/comic.epub', format: 'epub' },
        filePath: '${BOOKS}/comic.epub',
      },
      locator: { kind: 'document', entryPath: 'OPS/images/moe-018893.jpg' },
      fingerprint: createResourceFingerprint({
        strategy: 'provider',
        value: 'comic-v1',
        providerId: 'document-archive',
      }),
    });
    const resourceCache = {
      findByLocalPath: vi.fn(async () => ({
        ref: cacheResourceRef,
        entry: {
          resource: cacheResourceRef,
          status: 'ready' as const,
          createdAt: '2026-06-05T00:00:00.000Z',
          updatedAt: '2026-06-05T00:00:00.000Z',
          variants: [],
        },
        variantEntry: {
          key: 'variant',
          role: 'document-entry' as const,
          status: 'ready' as const,
          absolutePath: cachePath,
          createdAt: '2026-06-05T00:00:00.000Z',
          updatedAt: '2026-06-05T00:00:00.000Z',
        },
        absolutePath: cachePath,
      })),
    };
    const tool = createReadImageTool({
      readFile,
      resourceCache: resourceCache as never,
      fileAccessPolicy: createFileAccessPolicy(),
    });

    const result = (await tool.execute({
      image_paths: [cachePath],
      mode: 'metadata',
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(resourceCache.findByLocalPath).toHaveBeenCalledWith(cachePath);
    expect(result.data).toEqual(
      expect.objectContaining({
        images: [
          expect.objectContaining({
            path: cachePath,
            runtimePath: cachePath,
            runtimeKind: 'managed-cache',
            alias: 'image_1',
            aliasScope: 'document:${BOOKS}/comic.epub',
            sourceDocumentId: '${BOOKS}/comic.epub',
            entryPath: 'OPS/images/moe-018893.jpg',
            portableForTransfer: true,
            resourceRef: {
              kind: 'document-entry',
              source: { filePath: '${BOOKS}/comic.epub', format: 'epub' },
              entryPath: 'OPS/images/moe-018893.jpg',
              versionPolicy: 'versioned-export',
            },
            cacheResourceRef,
          }),
        ],
      }),
    );
    expect(JSON.stringify(result.data)).not.toContain('"cachePath"');
  });

  it('marks authorized plain local image paths as runtime-only for cross-package transfer', async () => {
    const readFile = vi.fn(async () => PNG_1X1);
    const tool = createReadImageTool({ readFile, fileAccessPolicy: createFileAccessPolicy() });

    const result = (await tool.execute({
      image_paths: ['/workspace/scratch/page.png'],
      mode: 'metadata',
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        images: [
          expect.objectContaining({
            path: '/workspace/scratch/page.png',
            runtimePath: '/workspace/scratch/page.png',
            runtimeKind: 'local-path',
            portableForTransfer: false,
          }),
        ],
      }),
    );
  });

  it('rejects system temp image paths even with a workspace policy', async () => {
    const readFile = vi.fn(async () => PNG_1X1);
    const tool = createReadImageTool({ readFile, fileAccessPolicy: createFileAccessPolicy() });

    const result = (await tool.execute({
      image_paths: ['/tmp/scratch/page.png'],
      mode: 'metadata',
    })) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error).toContain('system temp');
    expect(readFile).not.toHaveBeenCalled();
  });

  it('keeps runtime scratch paths out of multimodal attachment refs', async () => {
    const readFile = vi.fn(async () => PNG_1X1);
    const tool = createReadImageTool({ readFile, fileAccessPolicy: createFileAccessPolicy() });
    const managedPath = '/workspace/.neko/.cache/resources/documents/page-1.png';
    const runtimePath = '/var/folders/T/neko_epub_1/page-1.png';

    const result = (await tool.execute({
      images: [
        {
          path: managedPath,
          runtimePath,
          runtimeKind: 'managed-cache',
        },
      ],
      mode: 'metadata',
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(result.attachments?.[0]).toEqual(
      expect.objectContaining({
        path: managedPath,
        assetRef: expect.objectContaining({ uri: managedPath }),
      }),
    );
    expect(result.perceptionCards?.[0]?.perceptual?.keyframeRefs?.[0]).toEqual(
      expect.objectContaining({ uri: managedPath }),
    );
    const multimodalRefs = JSON.stringify({
      attachments: result.attachments,
      perceptionCards: result.perceptionCards,
    });
    expect(multimodalRefs).not.toContain(runtimePath);
  });

  it('rejects model-backed vision mode without invoking platform services', async () => {
    const readFile = vi.fn(async () => PNG_1X1);
    const tool = createReadImageTool({ readFile });

    const result = (await tool.execute({
      images: [{ path: '/images/page.png', label: 'P1' }],
      mode: 'vision',
      analysis: 'describe',
    })) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error).toBe(READ_IMAGE_MODEL_ANALYSIS_UNSUPPORTED);
  });
});
