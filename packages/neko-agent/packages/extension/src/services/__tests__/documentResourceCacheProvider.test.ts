import { describe, expect, it, vi } from 'vitest';
import type { DocumentReadResult, DocumentSourceRef } from '@neko/shared';
import {
  createDocumentResourceRef,
  createDocumentResourceRefFromArchiveRef,
  DocumentResourceCacheProvider,
} from '../documentResourceCacheProvider';
import type { IDocumentReaderService } from '../DocumentReaderService';

describe('DocumentResourceCacheProvider', () => {
  const source: DocumentSourceRef = {
    filePath: '${BOOKS}/comic.epub',
    format: 'epub',
    fileId: 'comic-v1',
    identity: { fileId: 'comic-v1', sizeBytes: 1024, mtimeMs: 42 },
  };

  it('creates stable resource refs from archive refs without embedding cache paths', () => {
    const ref = createDocumentResourceRefFromArchiveRef({
      kind: 'document-entry',
      source,
      entryPath: 'OPS/page-1.jpg',
      locator: { kind: 'chapter', chapterHref: 'OPS/page-1.xhtml', spineIndex: 0 },
      cachePath: '/tmp/page-1.jpg',
      versionPolicy: 'versioned-export',
    });

    expect(ref.provider).toBe('document-archive');
    expect(ref.scope).toBe('project');
    expect(ref.source.kind).toBe('document');
    expect(ref.source.metadata).toMatchObject({
      format: 'epub',
    });
    expect(ref.source.metadata).not.toHaveProperty('legacyCachePath');
    expect(ref.locator).toMatchObject({
      kind: 'document',
      entryPath: 'OPS/page-1.jpg',
    });
  });

  it('materializes a matching document image into the resource cache', async () => {
    const fsOps = createFsOps();
    const reader = createReader({
      source,
      imageInfo: [
        {
          path: '/tmp/neko_epub/page-1.jpg',
          mimeType: 'image/jpeg',
          width: 640,
          height: 960,
          byteSize: 123,
          resourceRef: {
            kind: 'document-entry',
            source,
            entryPath: 'OPS/page-1.jpg',
          },
        },
      ],
    });
    const provider = new DocumentResourceCacheProvider({ reader, fsOps });
    const ref = createDocumentResourceRef({
      source,
      entryPath: 'OPS/page-1.jpg',
      locator: { kind: 'chapter', chapterHref: 'OPS/page-1.xhtml', spineIndex: 0 },
    });

    const result = await provider.ensure({
      ref,
      variant: { role: 'document-entry', mimeType: 'image/jpeg' },
      cacheRoot: '/workspace/.neko/.cache/resources',
    });

    expect(result).toMatchObject({
      status: 'ready',
      relativePath: expect.stringMatching(/^documents\/doc_.+\/OPS\/page-1\.jpg$/),
      mimeType: 'image/jpeg',
      width: 640,
      height: 960,
      sizeBytes: 123,
      rebuildable: true,
    });
    expect(reader.readRange).toHaveBeenCalledWith(source, {
      locator: { kind: 'chapter', chapterHref: 'OPS/page-1.xhtml', spineIndex: 0 },
      limit: { maxImages: 32 },
    });
    expect(fsOps.mkdir).toHaveBeenCalledWith(expect.stringContaining('/documents/'), {
      recursive: true,
    });
    expect(fsOps.copyFile).toHaveBeenCalledWith(
      '/tmp/neko_epub/page-1.jpg',
      expect.stringContaining('/workspace/.neko/.cache/resources/documents/'),
    );
  });

  it('supports office embedded images when the reader returns imageInfo', async () => {
    const fsOps = createFsOps();
    const officeSource: DocumentSourceRef = {
      filePath: '/docs/deck.pptx',
      format: 'pptx',
      fileId: 'deck-v1',
    };
    const reader = createReader({
      source: officeSource,
      imageInfo: [
        {
          path: '/tmp/neko_pptx/image1.png',
          mimeType: 'image/png',
          byteSize: 77,
          resourceRef: {
            kind: 'document-entry',
            source: officeSource,
            entryPath: 'ppt/media/image1.png',
          },
        },
      ],
    });
    const provider = new DocumentResourceCacheProvider({ reader, fsOps });
    const ref = createDocumentResourceRef({
      source: officeSource,
      entryPath: 'ppt/media/image1.png',
      locator: { kind: 'slide', slideNumber: 1, slideIndex: 0 },
    });

    await expect(
      provider.ensure({
        ref,
        variant: { role: 'document-entry', mimeType: 'image/png' },
        cacheRoot: '/workspace/.neko/.cache/resources',
      }),
    ).resolves.toMatchObject({
      status: 'ready',
      relativePath: expect.stringMatching(/^documents\/doc_.+\/ppt\/media\/image1\.png$/),
      mimeType: 'image/png',
      sizeBytes: 77,
    });
  });

  it('returns missing when the requested image is absent', async () => {
    const provider = new DocumentResourceCacheProvider({
      reader: createReader({ source, imageInfo: [] }),
      fsOps: createFsOps(),
    });
    const ref = createDocumentResourceRef({
      source,
      entryPath: 'OPS/page-404.jpg',
      locator: { kind: 'chapter', chapterHref: 'OPS/page-1.xhtml', spineIndex: 0 },
    });

    await expect(
      provider.ensure({
        ref,
        variant: { role: 'document-entry' },
        cacheRoot: '/workspace/.neko/.cache/resources',
      }),
    ).resolves.toMatchObject({
      status: 'missing',
      error: 'Document image entry was not found: OPS/page-404.jpg',
    });
  });

  it('returns unsupported for resource refs without locator or entry path', async () => {
    const provider = new DocumentResourceCacheProvider({
      reader: createReader({ source, imageInfo: [] }),
      fsOps: createFsOps(),
    });
    const ref = createDocumentResourceRef({
      source,
    });

    await expect(
      provider.ensure({
        ref,
        variant: { role: 'document-entry' },
        cacheRoot: '/workspace/.neko/.cache/resources',
      }),
    ).resolves.toMatchObject({
      status: 'unsupported',
    });
  });

  it('does not claim no-preview document reads', () => {
    const provider = new DocumentResourceCacheProvider({
      reader: createReader({ source, imageInfo: [] }),
      fsOps: createFsOps(),
    });
    const ref = createDocumentResourceRef({
      source,
      entryPath: 'OPS/chapter-1.xhtml',
      locator: { kind: 'chapter', chapterHref: 'OPS/chapter-1.xhtml', spineIndex: 0 },
    });

    expect(provider.supports(ref, { role: 'source' })).toBe(false);
  });
});

function createReader(
  result: Pick<DocumentReadResult, 'source' | 'imageInfo'>,
): IDocumentReaderService {
  return {
    read: vi.fn(),
    supports: vi.fn(() => true),
    hasDRM: vi.fn(),
    readContent: vi.fn(),
    getManifest: vi.fn(),
    createBatchCursor: vi.fn(),
    readRange: vi.fn(
      async (_source, range): Promise<DocumentReadResult> => ({
        source: result.source,
        range,
        imageInfo: result.imageInfo,
        imagePaths: result.imageInfo?.map((image) => image.path),
        returnedTextChars: 0,
        truncated: false,
      }),
    ),
    readNext: vi.fn(),
  } as unknown as IDocumentReaderService;
}

function createFsOps() {
  return {
    copyFile: vi.fn(async () => undefined),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    stat: vi.fn(async () => ({ size: 456 })),
  };
}
