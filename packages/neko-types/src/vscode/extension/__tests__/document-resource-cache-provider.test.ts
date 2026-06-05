import { describe, expect, it, vi } from 'vitest';
import type { DocumentReadResult, DocumentSourceRef } from '../../../types';
import {
  createDocumentResourceRef,
  createDocumentResourceRefFromArchiveRef,
  DocumentResourceCacheProvider,
  type DocumentRangeReader,
} from '../document-resource-cache-provider';

describe('DocumentResourceCacheProvider', () => {
  const source: DocumentSourceRef = {
    filePath: '${BOOKS}/comic.epub',
    format: 'epub',
    fileId: 'comic-v1',
    identity: { fileId: 'comic-v1', sizeBytes: 1024, mtimeMs: 42 },
  };

  it('creates stable resource refs from archive refs with legacy cache metadata', () => {
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
      legacyCachePath: '/tmp/page-1.jpg',
    });
    expect(ref.id).toBe(
      createDocumentResourceRefFromArchiveRef({
        kind: 'document-entry',
        source,
        entryPath: 'OPS/page-1.jpg',
        locator: { kind: 'chapter', chapterHref: 'OPS/page-1.xhtml', spineIndex: 0 },
        cachePath: '/tmp/other-run/page-1.jpg',
      }).id,
    );
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
      relativePath: expect.stringMatching(/^documents\/res_.+\/page-1\.jpg$/),
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
    expect(fsOps.copyFile).toHaveBeenCalledWith(
      '/tmp/neko_epub/page-1.jpg',
      expect.stringContaining('/workspace/.neko/.cache/resources/documents/'),
    );
  });
});

function createReader(
  result: Pick<DocumentReadResult, 'source' | 'imageInfo'>,
): DocumentRangeReader {
  return {
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
  };
}

function createFsOps() {
  return {
    copyFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    stat: vi.fn(async () => ({ size: 456 })),
  };
}
