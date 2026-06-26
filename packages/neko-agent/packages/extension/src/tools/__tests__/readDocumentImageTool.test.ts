import { describe, expect, it, vi } from 'vitest';
import {
  TOOL_NAMES_SYSTEM,
  type ContentSourceRef,
  type ResourceVariantRequest,
  type ToolResult,
} from '@neko/shared';
import { createWorkspaceFileAccessPolicy } from '@neko/agent/tools';
import type { AgentContentAccessRuntime } from '@neko/agent/runtime';
import { createReadDocumentImageTool } from '../readDocumentImageTool';
import type { IDocumentReaderService } from '../../services/DocumentReaderService';

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

function createReadDocumentImageTestTool(deps: Parameters<typeof createReadDocumentImageTool>[0]) {
  return createReadDocumentImageTool({
    fileAccessPolicy: createFileAccessPolicy(),
    ...deps,
  });
}

function createReader(overrides: Partial<IDocumentReaderService> = {}): IDocumentReaderService {
  return {
    supports: vi.fn(() => true),
    hasDRM: vi.fn(async () => false),
    read: vi.fn(async () => ({ text: '' })),
    readContent: vi.fn(async () => ({ text: '' })),
    getManifest: vi.fn(async () => ({
      source: { filePath: '/workspace/books/demo.epub', format: 'epub', fileId: 'book-1' },
      format: 'epub',
      fileId: 'book-1',
      chapterCount: 2,
      units: [
        { kind: 'chapter', locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 0 } },
        { kind: 'chapter', locator: { kind: 'chapter', chapterHref: 'Page_2', spineIndex: 1 } },
      ],
      capabilities: {
        supportsManifest: true,
        supportsRangeRead: true,
        supportsCursorRead: true,
        supportsChapterRange: true,
      },
    })),
    createBatchCursor: vi.fn(async () => ({
      source: { filePath: '/workspace/books/demo.epub', format: 'epub', fileId: 'book-1' },
      strategy: 'manifest-order',
      next: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 0 },
      batchIndex: 0,
      done: false,
    })),
    readRange: vi.fn(async () => ({
      source: { filePath: '/workspace/books/demo.epub', format: 'epub', fileId: 'book-1' },
      text: '',
      imagePaths: [
        '/workspace/.neko/.cache/resources/documents/doc_test/page-1.png',
        '/workspace/.neko/.cache/resources/documents/doc_test/page-2.png',
      ],
      imageInfo: [
        {
          path: '/workspace/.neko/.cache/resources/documents/doc_test/page-1.png',
          width: 1,
          height: 1,
          mimeType: 'image/png',
          byteSize: PNG_1X1.byteLength,
          locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 0 },
          resourceRef: {
            kind: 'document-entry',
            source: { filePath: '/workspace/books/demo.epub', format: 'epub', fileId: 'book-1' },
            entryPath: 'OPS/page-1.png',
          },
        },
        {
          path: '/workspace/.neko/.cache/resources/documents/doc_test/page-2.png',
          width: 1,
          height: 1,
          mimeType: 'image/png',
          byteSize: PNG_1X1.byteLength,
          locator: { kind: 'chapter', chapterHref: 'Page_2', spineIndex: 1 },
          resourceRef: {
            kind: 'document-entry',
            source: { filePath: '/workspace/books/demo.epub', format: 'epub', fileId: 'book-1' },
            entryPath: 'OPS/page-2.png',
          },
        },
      ],
      returnedTextChars: 0,
      truncated: false,
    })),
    readNext: vi.fn(async (cursor) => ({
      source: cursor.source,
      text: '',
      returnedTextChars: 0,
      truncated: false,
      cursor,
    })),
    ...overrides,
  };
}

describe('createReadDocumentImageTool', () => {
  it('creates a read-only document image tool', () => {
    const tool = createReadDocumentImageTestTool({
      reader: createReader(),
      readFile: vi.fn(async () => PNG_1X1),
    });

    expect(tool.name).toBe(TOOL_NAMES_SYSTEM.READ_DOCUMENT_IMAGE);
    expect(tool.category).toBe('document');
    expect(tool.isReadOnly).toBe(true);
    expect(tool.description).toContain('document locators or page indexes');
    expect(tool.description).toContain('does not call a separate vision model');
    expect(tool.parameters.properties).not.toHaveProperty('image_paths');
  });

  it('resolves a document page image and delegates to ReadImage metadata flow', async () => {
    const reader = createReader();
    const readFile = vi.fn(async () => PNG_1X1);
    const contentAccessRuntime = createContentAccessRuntime();
    const tool = createReadDocumentImageTestTool({
      reader,
      readFile,
      contentAccessRuntime,
    });

    const result = (await tool.execute({
      file_path: '/workspace/books/demo.epub',
      page_indexes: [1],
      mode: 'metadata',
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(reader.readRange).toHaveBeenCalledWith(
      { filePath: '/workspace/books/demo.epub', format: 'epub', fileId: 'book-1' },
      expect.objectContaining({ limit: expect.objectContaining({ maxImages: 4 }) }),
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        images: [
          expect.objectContaining({
            alias: 'page_2',
            aliasScope: 'document:book-1',
            sourceDocumentId: 'book-1',
            entryPath: 'OPS/page-2.png',
            portableForTransfer: true,
            documentImage: expect.objectContaining({
              alias: 'page_2',
              aliasScope: 'document:book-1',
              sourceDocumentId: 'book-1',
              entryPath: 'OPS/page-2.png',
              portableForTransfer: true,
              locator: { kind: 'chapter', chapterHref: 'Page_2', spineIndex: 1 },
              resourceRef: {
                kind: 'document-entry',
                source: {
                  filePath: '/workspace/books/demo.epub',
                  format: 'epub',
                  fileId: 'book-1',
                },
                entryPath: 'OPS/page-2.png',
                locator: { kind: 'chapter', chapterHref: 'Page_2', spineIndex: 1 },
              },
            }),
          }),
        ],
      }),
    );
    expect(JSON.stringify(result.data)).not.toContain('legacyCachePath');
    expect(JSON.stringify(result.data)).not.toContain('"cachePath"');
    expect(JSON.stringify(result.data)).not.toContain('"cacheResourceRef"');
    expect(JSON.stringify(result.data)).not.toContain('"runtimeKind"');
    expect(result.perceptionCards).toEqual([
      expect.objectContaining({
        modality: 'image',
        structural: expect.objectContaining({
          mimeType: 'image/png',
          width: 1,
          height: 1,
        }),
        perceptual: expect.objectContaining({
          keyframeRefs: [
            expect.objectContaining({
              uri: 'OPS/page-2.png',
              mimeType: 'image/png',
              documentResourceRef: expect.objectContaining({
                kind: 'document-entry',
                entryPath: 'OPS/page-2.png',
              }),
            }),
          ],
        }),
      }),
    ]);
    expect(result.attachments).toEqual([
      expect.objectContaining({
        type: 'image',
        path: 'OPS/page-2.png',
        mimeType: 'image/png',
      }),
    ]);
    expect(JSON.stringify(result.attachments)).not.toContain(
      '/workspace/.neko/.cache/resources/documents/doc_test/page-2.png',
    );
    expect(JSON.stringify(result.perceptionCards)).not.toContain(
      '/workspace/.neko/.cache/resources/documents/doc_test/page-2.png',
    );
    expect(JSON.stringify(result.data)).not.toContain('/workspace/.neko/.cache/resources/');
    expect(readFile).not.toHaveBeenCalled();
    expect(contentAccessRuntime.loadProviderAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        caller: 'read-image',
        preferredTarget: 'bytes',
        source: expect.objectContaining({
          scope: 'project',
          provider: 'document-archive',
          kind: 'document',
          locator: expect.objectContaining({ entryPath: 'OPS/page-2.png' }),
        }),
        variant: { role: 'document-entry', mimeType: 'image/png', width: 1, height: 1 },
      }),
    );
    expect(contentAccessRuntime.resolveImageMetadata).toHaveBeenCalled();
  });

  it('fails closed for local documents when no authorized workspace policy is provided', async () => {
    const reader = createReader();
    const readFile = vi.fn(async () => PNG_1X1);
    const tool = createReadDocumentImageTool({ reader, readFile });

    const result = (await tool.execute({
      file_path: '/workspace/books/demo.epub',
      page_indexes: [0],
      mode: 'metadata',
    })) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error).toContain('no authorized workspace root');
    expect(reader.readRange).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
  });

  it('marks no-workspace document image analysis refs as extension-private', async () => {
    const reader = createReader();
    const contentAccessRuntime = createContentAccessRuntime();
    const tool = createReadDocumentImageTestTool({
      reader,
      readFile: vi.fn(async () => PNG_1X1),
      contentAccessRuntime,
      resolveResourceScope: () => 'extension-private',
    });

    const result = (await tool.execute({
      file_path: '/workspace/books/demo.epub',
      page_indexes: [0],
      mode: 'metadata',
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        images: [
          expect.objectContaining({
            alias: 'page_1',
            portableForTransfer: false,
            nonPortableReason: 'no-workspace-or-extension-private-scratch',
            documentImage: expect.objectContaining({
              portableForTransfer: false,
              nonPortableReason: 'no-workspace-or-extension-private-scratch',
              resourceRef: expect.objectContaining({
                kind: 'document-entry',
                entryPath: 'OPS/page-1.png',
              }),
            }),
          }),
        ],
      }),
    );
    expect(contentAccessRuntime.loadProviderAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        caller: 'read-image',
        source: expect.objectContaining({
          scope: 'extension-private',
          provider: 'document-archive',
          kind: 'document',
          locator: expect.objectContaining({ entryPath: 'OPS/page-1.png' }),
        }),
        variant: { role: 'document-entry', mimeType: 'image/png', width: 1, height: 1 },
      }),
    );
    expect(JSON.stringify(result.data)).not.toContain('"cacheResourceRef"');
    expect(JSON.stringify(result.data)).not.toContain('"runtimeKind"');
    expect(JSON.stringify(result.data)).not.toContain('/workspace/.neko/.cache/resources/');
  });

  it('fails visibly when document image provider asset loading cannot rebuild cache resources', async () => {
    const reader = createReader();
    const readFile = vi.fn(async () => {
      throw new Error('legacy direct read should not run');
    });
    const contentAccessRuntime = createContentAccessRuntime();
    contentAccessRuntime.loadProviderAsset.mockResolvedValueOnce({
      status: 'failed',
      diagnostics: [
        {
          code: 'resource-cache-unavailable',
          severity: 'error',
          message: 'document image cache rebuild failed',
        },
      ],
    });
    const tool = createReadDocumentImageTestTool({
      reader,
      readFile,
      contentAccessRuntime,
    });

    const result = (await tool.execute({
      file_path: '/workspace/books/demo.epub',
      page_indexes: [0],
      mode: 'metadata',
    })) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error).toContain('document image cache rebuild failed');
    expect(readFile).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('/workspace/.neko/.cache/resources/');
  });

  it('rejects legacy image_paths input instead of treating cache paths as tool contract', async () => {
    const reader = createReader();
    const readFile = vi.fn(async () => PNG_1X1);
    const contentAccessRuntime = createContentAccessRuntime();
    const tool = createReadDocumentImageTestTool({ reader, readFile, contentAccessRuntime });

    const result = (await tool.execute({
      file_path: '/workspace/books/demo.epub',
      image_paths: ['/workspace/.neko/.cache/resources/documents/doc_test/direct.png'],
    })) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error).toContain('image_paths was removed');
    expect(reader.getManifest).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
    expect(contentAccessRuntime.loadProviderAsset).not.toHaveBeenCalled();
  });

  it('does not fall back to document imagePaths without stable imageInfo refs', async () => {
    const reader = createReader({
      readRange: vi.fn(async () => ({
        source: { filePath: '/workspace/books/demo.epub', format: 'epub', fileId: 'book-1' },
        text: '',
        imagePaths: ['/workspace/.neko/.cache/resources/documents/doc_test/page-1.png'],
        returnedTextChars: 0,
        truncated: false,
      })),
    });
    const contentAccessRuntime = createContentAccessRuntime();
    const tool = createReadDocumentImageTestTool({
      reader,
      readFile: vi.fn(async () => PNG_1X1),
      contentAccessRuntime,
    });

    const result = (await tool.execute({
      file_path: '/workspace/books/demo.epub',
      page_indexes: [0],
      mode: 'metadata',
    })) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error).toContain('No matching document images found');
    expect(contentAccessRuntime.loadProviderAsset).not.toHaveBeenCalled();
  });

  it('rejects legacy vision mode without invoking platform services', async () => {
    const reader = createReader();
    const readFile = vi.fn(async () => PNG_1X1);
    const tool = createReadDocumentImageTestTool({
      reader,
      readFile,
    });

    const result = (await tool.execute({
      file_path: '/workspace/books/demo.epub',
      image_paths: ['/workspace/.neko/.cache/resources/documents/doc_test/direct.png'],
      mode: 'vision',
    })) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error).toContain('image_paths was removed');
  });
});

function createContentAccessRuntime(): AgentContentAccessRuntime & {
  readonly loadProviderAsset: ReturnType<typeof vi.fn>;
  readonly resolveImageMetadata: ReturnType<typeof vi.fn>;
} {
  return {
    resolve: vi.fn(),
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
