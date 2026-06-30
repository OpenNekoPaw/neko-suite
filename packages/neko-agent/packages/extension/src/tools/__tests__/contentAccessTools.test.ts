import { describe, expect, it, vi } from 'vitest';
import {
  createResourceFingerprint,
  createResourceRef,
  type ContentSourceRef,
  type DocumentArchiveResourceRef,
} from '@neko/shared';
import type { AgentContentAccessRuntime } from '@neko/agent/runtime';
import { createReadDocumentTool } from '../readDocumentTool';
import { createReadImageTool } from '../readImageTool';

const documentSource = {
  filePath: '/workspace/books/book.epub',
  format: 'epub' as const,
  fileId: 'book-file-id',
};

const documentContentSource: ContentSourceRef = {
  kind: 'document',
  source: {
    kind: 'document',
    document: documentSource,
    filePath: documentSource.filePath,
  },
  entryPath: 'images/page-1.jpg',
  locator: {
    kind: 'document',
    entryPath: 'images/page-1.jpg',
    locator: { kind: 'chapter', chapterHref: 'page-1', spineIndex: 0 },
  },
};

const archiveRef: DocumentArchiveResourceRef = {
  kind: 'document-entry',
  source: documentSource,
  entryPath: 'images/page-1.jpg',
  locator: { kind: 'chapter', chapterHref: 'page-1', spineIndex: 0 },
  versionPolicy: 'versioned-export',
};

const resourceRef = createResourceRef({
  id: 'res_page_1',
  scope: 'project',
  provider: 'document-archive',
  kind: 'document',
  source: {
    kind: 'document',
    document: documentSource,
    filePath: documentSource.filePath,
  },
  locator: {
    kind: 'document',
    entryPath: archiveRef.entryPath,
    locator: archiveRef.locator,
  },
  fingerprint: createResourceFingerprint({
    strategy: 'identity',
    value: documentSource.fileId,
    providerId: 'document-archive',
  }),
});

describe('content access tools', () => {
  it('publishes ReadImage resourceRef as a required image item field', () => {
    const tool = createReadImageTool({ contentAccessRuntime: createRuntime() });
    const images = tool.parameters.properties['images'] as {
      readonly items?: { readonly required?: readonly string[] };
    };

    expect(images.items?.required).toContain('resourceRef');
  });

  it('routes ReadDocument through AgentContentAccessRuntime', async () => {
    const runtime = createRuntime();
    runtime.resolveDocumentContent.mockResolvedValueOnce({
      status: 'ready',
      source: documentContentSource,
      diagnostics: [],
      text: 'hello document',
      totalTextChars: 14,
      returnedTextChars: 14,
      truncated: false,
    });

    const result = await createReadDocumentTool({ contentAccessRuntime: runtime }).execute({
      source: documentContentSource,
    });

    expect(result.success).toBe(true);
    expect(runtime.resolveDocumentContent).toHaveBeenCalledWith({
      caller: 'read-document',
      source: documentContentSource,
      intent: 'agent-context',
      mode: 'content',
      startBatch: false,
      includeManifest: false,
      includeImages: true,
      maxChars: 20000,
      maxImages: 50,
    });
  });

  it('routes ReadDocument range mode through AgentContentAccessRuntime', async () => {
    const runtime = createRuntime();
    const range = {
      locator: { kind: 'chapter' as const, chapterHref: 'Page_1', spineIndex: 1 },
    };
    runtime.resolveDocumentContent.mockResolvedValueOnce({
      status: 'ready',
      source: { kind: 'file', path: '${A}/books/book.epub' },
      diagnostics: [],
      text: 'chapter text',
      range,
      imageInfo: [
        {
          entryPath: archiveRef.entryPath,
          locator: archiveRef.locator,
          resourceRef: archiveRef,
        },
      ],
      imageCount: 1,
      imagesTruncated: false,
    });

    const result = await createReadDocumentTool({ contentAccessRuntime: runtime }).execute({
      source: { kind: 'file', path: '${A}/books/book.epub' },
      mode: 'range',
      range,
      max_images: 5,
    });

    expect(result.success).toBe(true);
    expect(runtime.resolveDocumentContent).toHaveBeenCalledWith({
      caller: 'read-document',
      source: { kind: 'file', path: '${A}/books/book.epub' },
      intent: 'agent-context',
      mode: 'range',
      range,
      startBatch: false,
      includeManifest: false,
      includeImages: true,
      maxChars: 20000,
      maxImages: 5,
    });
    expect(result.data).toMatchObject({
      mode: 'range',
      text: 'chapter text',
      imageCount: 1,
      imagesTruncated: false,
    });
  });

  it('passes ReadDocument imageInfo entries to ReadImage through unified content refs', async () => {
    const runtime = createRuntime();
    runtime.resolveDocumentContent.mockResolvedValueOnce({
      status: 'ready',
      source: { kind: 'file', path: '${A}/books/book.epub' },
      diagnostics: [],
      text: '',
      imageInfo: [
        {
          label: 'page 1',
          entryPath: archiveRef.entryPath,
          locator: archiveRef.locator,
          width: 1,
          height: 1,
          mimeType: 'image/png',
          resourceRef: archiveRef,
        },
      ],
      imageCount: 1,
      imagesTruncated: false,
    });
    runtime.loadProviderAsset.mockResolvedValueOnce({
      status: 'ready',
      source: resourceRef,
      diagnostics: [],
      bytes: pngBytes(),
      mimeType: 'image/png',
      sizeBytes: pngBytes().byteLength,
    });
    runtime.resolveImageMetadata.mockResolvedValueOnce({
      status: 'ready',
      source: resourceRef,
      diagnostics: [],
      mimeType: 'image/png',
      width: 1,
      height: 1,
      sizeBytes: pngBytes().byteLength,
    });

    const documentResult = await createReadDocumentTool({ contentAccessRuntime: runtime }).execute({
      source: { kind: 'file', path: '${A}/books/book.epub' },
      mode: 'range',
      range: {
        locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 1 },
      },
      max_images: 1,
    });
    const imageInfo = (
      documentResult.data as {
        readonly imageInfo: readonly [{ readonly resourceRef: DocumentArchiveResourceRef }];
      }
    ).imageInfo;

    const imageResult = await createReadImageTool({ contentAccessRuntime: runtime }).execute({
      images: imageInfo,
    });

    expect(documentResult.success).toBe(true);
    expect(imageResult.success).toBe(true);
    expect(runtime.loadProviderAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        caller: 'read-image',
        preferredTarget: 'bytes',
        source: expect.objectContaining({
          provider: 'document-archive',
          locator: expect.objectContaining({
            kind: 'document',
            entryPath: archiveRef.entryPath,
          }),
        }),
      }),
    );
  });

  it('routes ReadImage through provider asset and metadata content access', async () => {
    const runtime = createRuntime();
    runtime.loadProviderAsset.mockResolvedValueOnce({
      status: 'ready',
      source: resourceRef,
      diagnostics: [],
      bytes: pngBytes(),
      mimeType: 'image/png',
      sizeBytes: pngBytes().byteLength,
    });
    runtime.resolveImageMetadata.mockResolvedValueOnce({
      status: 'ready',
      source: resourceRef,
      diagnostics: [],
      mimeType: 'image/png',
      width: 1,
      height: 1,
      sizeBytes: pngBytes().byteLength,
    });

    const result = await createReadImageTool({ contentAccessRuntime: runtime }).execute({
      images: [{ resourceRef }],
    });

    expect(result.success).toBe(true);
    expect(runtime.loadProviderAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        caller: 'read-image',
        source: resourceRef,
        preferredTarget: 'bytes',
      }),
    );
    expect(runtime.resolveImageMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        caller: 'read-image',
        source: resourceRef,
      }),
    );
  });

  it('rejects ReadImage path-only inputs instead of falling back to cache or local paths', async () => {
    const runtime = createRuntime();

    const result = await createReadImageTool({ contentAccessRuntime: runtime }).execute({
      images: [{ path: '/workspace/.neko/.cache/resources/page-1.jpg' }],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing required field: images[].resourceRef');
    expect(result.error).toContain('Do not inspect cache directories');
    expect(runtime.loadProviderAsset).not.toHaveBeenCalled();
    expect(runtime.resolveImageMetadata).not.toHaveBeenCalled();
  });
});

function createRuntime(): AgentContentAccessRuntime & {
  readonly resolveDocumentContent: ReturnType<typeof vi.fn>;
  readonly loadProviderAsset: ReturnType<typeof vi.fn>;
  readonly resolveImageMetadata: ReturnType<typeof vi.fn>;
} {
  return {
    resolve: vi.fn(),
    resolveDocumentContent: vi.fn(),
    loadProviderAsset: vi.fn(),
    resolveImageMetadata: vi.fn(),
    projectResource: vi.fn(),
  };
}

function pngBytes(): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89,
  ]);
}
