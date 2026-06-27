import { describe, expect, it, vi } from 'vitest';
import {
  TOOL_NAMES_SYSTEM,
  type ContentSourceRef,
  type ResourceVariantRequest,
  type ToolResult,
} from '@neko/shared';
import { createWorkspaceFileAccessPolicy } from '@neko/agent/tools';
import type { AgentContentAccessRuntime } from '@neko/agent/runtime';
import { READ_IMAGE_MODEL_ANALYSIS_UNSUPPORTED, createReadImageTool } from '../readImageTool';

const WORKSPACE_ROOT = '/workspace';

const PNG_1X1 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);

function createFileAccessPolicy() {
  return createWorkspaceFileAccessPolicy({
    workspaceRoot: WORKSPACE_ROOT,
  });
}

describe('createReadImageTool', () => {
  it('creates a read-only image tool', () => {
    const tool = createReadImageTool();

    expect(tool.name).toBe(TOOL_NAMES_SYSTEM.READ_IMAGE);
    expect(tool.category).toBe('analysis');
    expect(tool.isReadOnly).toBe(true);
    expect(tool.isConcurrencySafe).toBe(true);
    expect(tool.description).toContain('structured imageInfo resource refs from ReadDocument');
    expect(tool.parameters).not.toHaveProperty('anyOf');
    expect(tool.parameters).not.toHaveProperty('oneOf');
    expect(tool.parameters).not.toHaveProperty('allOf');
    expect(tool.parameters.properties?.['images']).toEqual(
      expect.objectContaining({
        items: expect.objectContaining({
          properties: expect.objectContaining({
            path: { type: 'string' },
            resourceRef: expect.objectContaining({ type: 'object' }),
            width: { type: 'integer' },
            height: { type: 'integer' },
            mimeType: { type: 'string' },
          }),
        }),
      }),
    );
    expect(tool.parameters.properties?.['images']?.items?.properties).not.toHaveProperty(
      'runtimePath',
    );
    expect(tool.parameters.properties?.['images']?.items?.properties).not.toHaveProperty(
      'runtimeKind',
    );
    expect(tool.parameters.properties?.['images']?.items?.properties).not.toHaveProperty(
      'cacheResourceRef',
    );
  });

  it('reads local image metadata without invoking vision', async () => {
    const readFile = vi.fn(async () => {
      throw new Error('legacy direct read should not run');
    });
    const contentAccessRuntime = createContentAccessRuntime();
    const tool = createReadImageTool({
      readFile,
      contentAccessRuntime,
      now: () => 1234,
      fileAccessPolicy: createFileAccessPolicy(),
    });

    const result = (await tool.execute({
      image_paths: ['/workspace/images/page.png'],
      mode: 'metadata',
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(readFile).not.toHaveBeenCalled();
    expect(contentAccessRuntime.loadProviderAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        caller: 'read-image',
        source: { kind: 'file', path: '/workspace/images/page.png' },
        preferredTarget: 'bytes',
      }),
    );
    expect(contentAccessRuntime.resolveImageMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        caller: 'read-image',
        source: { kind: 'file', path: '/workspace/images/page.png' },
      }),
    );
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
    const contentAccessRuntime = createContentAccessRuntime();
    const tool = createReadImageTool({ readFile, contentAccessRuntime });

    const result = (await tool.execute({
      image_paths: ['/workspace/images/page.png'],
      mode: 'metadata',
    })) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error).toContain('no authorized workspace root');
    expect(readFile).not.toHaveBeenCalled();
    expect(contentAccessRuntime.loadProviderAsset).not.toHaveBeenCalled();
  });

  it('preserves document resource refs from structured image inputs', async () => {
    const readFile = vi.fn(async () => {
      throw new Error('legacy direct read should not run');
    });
    const contentAccessRuntime = createContentAccessRuntime();
    const tool = createReadImageTool({
      readFile,
      contentAccessRuntime,
      fileAccessPolicy: createFileAccessPolicy(),
    });
    const resourceRef = {
      kind: 'document-entry' as const,
      source: { filePath: '${BOOKS}/comic.epub', format: 'epub' as const },
      entryPath: 'OPS/images/moe-018893.jpg',
    };

    const result = (await tool.execute({
      images: [
        {
          label: 'page_1',
          width: 1,
          height: 1,
          mimeType: 'image/png',
          resourceRef,
        },
      ],
      mode: 'metadata',
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(readFile).not.toHaveBeenCalled();
    expect(result.data).toEqual(
      expect.objectContaining({
        images: [
          expect.objectContaining({
            label: 'page_1',
            resourceRef: {
              kind: 'document-entry',
              source: { filePath: '${BOOKS}/comic.epub', format: 'epub' },
              entryPath: 'OPS/images/moe-018893.jpg',
            },
          }),
        ],
      }),
    );
    expect(contentAccessRuntime.loadProviderAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        caller: 'read-image',
        source: expect.objectContaining({
          scope: 'project',
          provider: 'document-archive',
          kind: 'document',
          locator: expect.objectContaining({ entryPath: 'OPS/images/moe-018893.jpg' }),
        }),
        preferredTarget: 'bytes',
        variant: { role: 'document-entry', mimeType: 'image/png', width: 1, height: 1 },
      }),
    );
    expect(JSON.stringify(result.data)).not.toContain('"cachePath"');
    expect(JSON.stringify(result.data)).not.toContain('"cacheResourceRef"');
  });

  it('rejects unified cache image paths as durable image identity', async () => {
    const readFile = vi.fn(async () => PNG_1X1);
    const contentAccessRuntime = createContentAccessRuntime();
    const cachePath =
      '/workspace/.neko/.cache/resources/documents/doc_comic/OPS/images/moe-018893.jpg';
    const tool = createReadImageTool({
      readFile,
      contentAccessRuntime,
      fileAccessPolicy: createFileAccessPolicy(),
    });

    const result = (await tool.execute({
      image_paths: [cachePath],
      mode: 'metadata',
    })) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error).toContain('does not accept managed cache paths');
    expect(readFile).not.toHaveBeenCalled();
    expect(contentAccessRuntime.loadProviderAsset).not.toHaveBeenCalled();
  });

  it('marks authorized plain local image paths as runtime-only for cross-package transfer', async () => {
    const readFile = vi.fn(async () => {
      throw new Error('legacy direct read should not run');
    });
    const contentAccessRuntime = createContentAccessRuntime();
    const tool = createReadImageTool({
      readFile,
      contentAccessRuntime,
      fileAccessPolicy: createFileAccessPolicy(),
    });

    const result = (await tool.execute({
      image_paths: ['/workspace/scratch/page.png'],
      mode: 'metadata',
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(readFile).not.toHaveBeenCalled();
    expect(result.data).toEqual(
      expect.objectContaining({
        images: [
          expect.objectContaining({
            portableForTransfer: false,
          }),
        ],
      }),
    );
  });

  it('rejects system temp image paths even with a workspace policy', async () => {
    const readFile = vi.fn(async () => PNG_1X1);
    const contentAccessRuntime = createContentAccessRuntime();
    const tool = createReadImageTool({
      readFile,
      contentAccessRuntime,
      fileAccessPolicy: createFileAccessPolicy(),
    });

    const result = (await tool.execute({
      image_paths: ['/tmp/scratch/page.png'],
      mode: 'metadata',
    })) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error).toContain('system temp');
    expect(readFile).not.toHaveBeenCalled();
    expect(contentAccessRuntime.loadProviderAsset).not.toHaveBeenCalled();
  });

  it('rejects runtime scratch paths before multimodal attachment projection', async () => {
    const readFile = vi.fn(async () => PNG_1X1);
    const contentAccessRuntime = createContentAccessRuntime();
    const tool = createReadImageTool({
      readFile,
      contentAccessRuntime,
      fileAccessPolicy: createFileAccessPolicy(),
    });
    const managedPath = '/workspace/.neko/.cache/resources/documents/page-1.png';
    const runtimePath = '/var/folders/T/neko_epub_1/page-1.png';

    const result = (await tool.execute({
      images: [
        {
          path: managedPath,
        },
      ],
      mode: 'metadata',
    })) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error).toContain('does not accept managed cache paths');
    const multimodalRefs = JSON.stringify({
      attachments: result.attachments,
      perceptionCards: result.perceptionCards,
    });
    expect(multimodalRefs).not.toContain(runtimePath);
  });

  it('rejects model-backed vision mode without invoking platform services', async () => {
    const readFile = vi.fn(async () => PNG_1X1);
    const contentAccessRuntime = createContentAccessRuntime();
    const tool = createReadImageTool({ readFile, contentAccessRuntime });

    const result = (await tool.execute({
      images: [{ path: '/images/page.png', label: 'P1' }],
      mode: 'vision',
      analysis: 'describe',
    })) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error).toBe(READ_IMAGE_MODEL_ANALYSIS_UNSUPPORTED);
  });
});

function createContentAccessRuntime(): AgentContentAccessRuntime & {
  readonly loadProviderAsset: ReturnType<typeof vi.fn>;
  readonly resolveImageMetadata: ReturnType<typeof vi.fn>;
} {
  return {
    resolve: vi.fn(async (request) => ({
      status: 'ready' as const,
      request,
    })),
    resolveImageMetadata: vi.fn(async (input: { source: ContentSourceRef }) => ({
      status: 'ready' as const,
      source: input.source.kind === 'runtime' ? undefined : input.source,
      diagnostics: [],
      mimeType: 'image/png',
      width: 1,
      height: 1,
      sizeBytes: PNG_1X1.byteLength,
    })),
    resolveDocumentContent: vi.fn(),
    resolveDocumentImages: vi.fn(),
    loadProviderAsset: vi.fn(
      async (input: { source: ContentSourceRef; variant?: ResourceVariantRequest }) => ({
        status: 'ready' as const,
        source: input.source.kind === 'runtime' ? undefined : input.source,
        diagnostics: [],
        bytes: PNG_1X1,
        mimeType: input.variant?.mimeType ?? 'image/png',
        sizeBytes: PNG_1X1.byteLength,
      }),
    ),
    projectResource: vi.fn(),
  } as unknown as AgentContentAccessRuntime & {
    readonly loadProviderAsset: ReturnType<typeof vi.fn>;
    readonly resolveImageMetadata: ReturnType<typeof vi.fn>;
  };
}
