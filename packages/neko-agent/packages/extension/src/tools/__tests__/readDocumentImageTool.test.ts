import { describe, expect, it, vi } from 'vitest';
import { TOOL_NAMES_SYSTEM, type ResourceRef, type ToolResult } from '@neko/shared';
import type { ResourceCacheService } from '@neko/shared/vscode/extension';
import { createWorkspaceFileAccessPolicy } from '@neko/agent/tools';
import { createReadDocumentImageTool } from '../readDocumentImageTool';
import { READ_IMAGE_MODEL_ANALYSIS_UNSUPPORTED } from '../readImageTool';
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
        '/workspace/.neko/.cache/resources/document-runtime/page-1.png',
        '/workspace/.neko/.cache/resources/document-runtime/page-2.png',
      ],
      imageInfo: [
        {
          path: '/workspace/.neko/.cache/resources/document-runtime/page-1.png',
          width: 1,
          height: 1,
          mimeType: 'image/png',
          byteSize: PNG_1X1.byteLength,
          locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 0 },
          resourceRef: {
            kind: 'document-entry',
            source: { filePath: '/workspace/books/demo.epub', format: 'epub', fileId: 'book-1' },
            entryPath: 'OPS/page-1.png',
            cachePath: '/workspace/.neko/.cache/resources/document-runtime/page-1.png',
          },
        },
        {
          path: '/workspace/.neko/.cache/resources/document-runtime/page-2.png',
          width: 1,
          height: 1,
          mimeType: 'image/png',
          byteSize: PNG_1X1.byteLength,
          locator: { kind: 'chapter', chapterHref: 'Page_2', spineIndex: 1 },
          resourceRef: {
            kind: 'document-entry',
            source: { filePath: '/workspace/books/demo.epub', format: 'epub', fileId: 'book-1' },
            entryPath: 'OPS/page-2.png',
            cachePath: '/workspace/.neko/.cache/resources/document-runtime/page-2.png',
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
    expect(tool.description).toContain('call ReadImage directly instead of this tool');
    expect(tool.description).toContain('does not call a separate vision model');
  });

  it('resolves a document page image and delegates to ReadImage metadata flow', async () => {
    const reader = createReader();
    const resourceCache = createResourceCache();
    const readFile = vi.fn(async () => PNG_1X1);
    const tool = createReadDocumentImageTestTool({
      reader,
      readFile,
      resourceCache,
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
            path: '/workspace/.neko/.cache/resources/documents/page.png',
            runtimePath: '/workspace/.neko/.cache/resources/documents/page.png',
            runtimeKind: 'managed-cache',
            alias: 'page_2',
            aliasScope: 'document:book-1',
            sourceDocumentId: 'book-1',
            entryPath: 'OPS/page-2.png',
            portableForTransfer: true,
            documentImage: expect.objectContaining({
              path: '/workspace/.neko/.cache/resources/documents/page.png',
              runtimePath: '/workspace/.neko/.cache/resources/documents/page.png',
              runtimeKind: 'managed-cache',
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
              cacheResourceRef: expect.objectContaining({
                provider: 'document-archive',
                kind: 'document',
                locator: expect.objectContaining({ entryPath: 'OPS/page-2.png' }),
              }),
            }),
            cacheResourceRef: expect.objectContaining({
              provider: 'document-archive',
              kind: 'document',
            }),
          }),
        ],
      }),
    );
    expect(JSON.stringify(result.data)).not.toContain('legacyCachePath');
    expect(JSON.stringify(result.data)).not.toContain('"cachePath"');
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
              uri: '/workspace/.neko/.cache/resources/documents/page.png',
              mimeType: 'image/png',
            }),
          ],
        }),
      }),
    ]);
    expect(result.attachments).toEqual([
      expect.objectContaining({
        type: 'image',
        path: '/workspace/.neko/.cache/resources/documents/page.png',
        mimeType: 'image/png',
      }),
    ]);
    expect(JSON.stringify(result.attachments)).not.toContain(
      '/workspace/.neko/.cache/resources/document-runtime/page-2.png',
    );
    expect(JSON.stringify(result.perceptionCards)).not.toContain(
      '/workspace/.neko/.cache/resources/document-runtime/page-2.png',
    );
    expect(readFile).toHaveBeenCalledWith('/workspace/.neko/.cache/resources/documents/page.png');
    expect(resourceCache.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'project',
        provider: 'document-archive',
        kind: 'document',
        locator: expect.objectContaining({ entryPath: 'OPS/page-2.png' }),
      }),
      { role: 'document-entry', mimeType: 'image/png', width: 1, height: 1 },
      { materializeIfMissing: true },
    );
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
    const resourceCache = createResourceCache();
    const tool = createReadDocumentImageTestTool({
      reader,
      readFile: vi.fn(async () => PNG_1X1),
      resourceCache,
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
            runtimePath: '/workspace/.neko/.cache/resources/document-runtime/page-1.png',
            runtimeKind: 'scratch-cache',
            alias: 'page_1',
            portableForTransfer: false,
            nonPortableReason: 'no-workspace-or-extension-private-scratch',
            cacheResourceRef: expect.objectContaining({
              scope: 'extension-private',
              source: expect.objectContaining({
                metadata: expect.objectContaining({ nonPortable: true }),
              }),
            }),
          }),
        ],
      }),
    );
    expect(resourceCache.resolve).not.toHaveBeenCalled();
    expect(resourceCache.ensure).not.toHaveBeenCalled();
  });

  it('uses provided image_paths directly when ReadDocument already returned them', async () => {
    const reader = createReader();
    const readFile = vi.fn(async () => PNG_1X1);
    const tool = createReadDocumentImageTestTool({ reader, readFile });

    const result = (await tool.execute({
      file_path: '/workspace/books/demo.epub',
      image_paths: ['/workspace/.neko/.cache/resources/document-runtime/direct.png'],
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(reader.getManifest).not.toHaveBeenCalled();
    expect(readFile).toHaveBeenCalledWith(
      '/workspace/.neko/.cache/resources/document-runtime/direct.png',
    );
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
      image_paths: ['/workspace/.neko/.cache/resources/document-runtime/direct.png'],
      mode: 'vision',
    })) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error).toBe(READ_IMAGE_MODEL_ANALYSIS_UNSUPPORTED);
  });
});

function createResourceCache(): ResourceCacheService {
  return {
    registerProvider: vi.fn(),
    findByLocalPath: vi.fn(async () => undefined),
    ensure: vi.fn(async (ref: ResourceRef, variant) => ({
      status: 'ready',
      ref,
      variant: { resource: ref, ...variant },
      absolutePath: '/workspace/.neko/.cache/resources/documents/page.png',
    })),
    resolve: vi.fn(async (ref: ResourceRef, variant) => ({
      status: 'ready',
      ref,
      variant: { resource: ref, ...variant },
      absolutePath: '/workspace/.neko/.cache/resources/documents/page.png',
    })),
    record: vi.fn(async (record) => ({
      status: record.status ?? 'ready',
      ref: record.ref,
      variant: { resource: record.ref, ...record.variant },
      absolutePath: record.absolutePath,
      relativePath: record.relativePath,
    })),
    updateLifecycle: vi.fn(async (record) => ({
      status: 'ready',
      ref: record.ref,
      variant: { resource: record.ref, ...record.variant },
    })),
    project: vi.fn(async (_webview, ref: ResourceRef, variant) => ({
      status: 'missing',
      ref,
      variant: { resource: ref, ...variant },
    })),
    invalidate: vi.fn(async () => undefined),
    invalidateManifestCache: vi.fn(),
    stats: vi.fn(async () => ({
      totalSizeBytes: 0,
      entryCount: 0,
      variantCount: 0,
      staleCount: 0,
      missingCount: 0,
      scopeCounts: {},
      providerCounts: {},
      providerBytes: {},
    })),
    gc: vi.fn(async () => ({
      removedCount: 0,
      removedBytes: 0,
      skippedCount: 0,
      skippedReasons: {},
    })),
  };
}
