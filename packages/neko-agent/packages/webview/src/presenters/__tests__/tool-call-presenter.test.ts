import { describe, expect, it } from 'vitest';
import { createResourceFingerprint, createResourceRef } from '@neko/shared';
import { projectToolCallDisplayState } from '../tool-call-presenter';

const cacheResourceRef = createResourceRef({
  scope: 'project',
  provider: 'document-archive',
  kind: 'document',
  source: {
    kind: 'document',
    document: { filePath: '/books/a.epub', format: 'epub' },
    filePath: '/books/a.epub',
  },
  locator: {
    kind: 'document',
    locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 1 },
    entryPath: 'image/Page_1.jpg',
  },
  fingerprint: createResourceFingerprint({
    strategy: 'provider',
    value: 'book-a:Page_1',
    providerId: 'document-archive',
  }),
});

describe('tool-call-presenter', () => {
  it('does not project ReadDocument image metadata into thumbnail view models', () => {
    const projection = projectToolCallDisplayState({
      id: 'tool-1',
      name: 'ReadDocument',
      arguments: {},
      result: {
        success: true,
        data: {
          source: { filePath: '/books/a.epub', format: 'epub' },
          imagePaths: ['/tmp/page-1.jpg'],
          imagePathWebviewUris: ['vscode-webview://page-1.jpg'],
          imageInfo: [
            {
              path: '/tmp/page-1.jpg',
              width: 1494,
              height: 2133,
              byteSize: 1024,
              mimeType: 'image/jpeg',
              locator: {
                kind: 'chapter',
                chapterHref: 'Page_1',
                spineIndex: 1,
              },
              resourceRef: {
                kind: 'document-entry',
                source: { filePath: '/books/a.epub', format: 'epub' },
                entryPath: 'image/Page_1.jpg',
                cachePath: '/tmp/page-1.jpg',
                versionPolicy: 'versioned-export',
              },
            },
          ],
        },
      },
    });

    expect(projection.documentThumbnails).toEqual([]);
    expect(projection.copyText).toContain('Document: /books/a.epub');
    expect(projection.copyText).toContain('C2 · 1494 x 2133 · 1 KB · /tmp/page-1.jpg');
  });

  it('projects ReadDocumentImage result images into thumbnail view models', () => {
    const projection = projectToolCallDisplayState({
      id: 'tool-2',
      name: 'ReadDocumentImage',
      arguments: {},
      result: {
        success: true,
        data: {
          source: { filePath: '/books/a.epub', format: 'epub' },
          mode: 'vision',
          analysis: 'custom',
          images: [
            {
              path: '/tmp/page-1.jpg',
              webviewUri: 'vscode-webview://page-1.jpg',
              label: 'Page 1',
              width: 1494,
              height: 2133,
              byteSize: 2048,
              mimeType: 'image/jpeg',
              metadata: {
                documentIndex: 1,
                locator: {
                  kind: 'chapter',
                  chapterHref: 'Page_1',
                  spineIndex: 1,
                },
              },
              documentImage: {
                path: '/tmp/page-1.jpg',
                locator: {
                  kind: 'chapter',
                  chapterHref: 'Page_1',
                  spineIndex: 1,
                },
                resourceRef: {
                  kind: 'document-entry',
                  source: { filePath: '/books/a.epub', format: 'epub' },
                  entryPath: 'image/Page_1.jpg',
                  cachePath: '/tmp/page-1.jpg',
                  versionPolicy: 'versioned-export',
                },
                cacheResourceRef,
              },
            },
          ],
          imageCount: 1,
        },
      },
    });

    expect(projection.documentThumbnails).toEqual([
      expect.objectContaining({
        filePath: '/books/a.epub',
        path: '/tmp/page-1.jpg',
        src: 'vscode-webview://page-1.jpg',
        width: 1494,
        height: 2133,
        byteSize: 2048,
        mimeType: 'image/jpeg',
        label: 'Page 1',
        locator: {
          kind: 'chapter',
          chapterHref: 'Page_1',
          spineIndex: 1,
        },
        resourceRef: {
          kind: 'document-entry',
          source: { filePath: '/books/a.epub', format: 'epub' },
          entryPath: 'image/Page_1.jpg',
          cachePath: '/tmp/page-1.jpg',
          versionPolicy: 'versioned-export',
        },
        cacheResourceRef,
      }),
    ]);
    expect(projection.copyText).toBeNull();

    const reference = JSON.parse(projection.documentThumbnails[0]!.referenceJson);
    expect(reference).toEqual({
      kind: 'document-image-reference',
      document: {
        filePath: '/books/a.epub',
        source: { filePath: '/books/a.epub', format: 'epub' },
        locator: {
          kind: 'chapter',
          chapterHref: 'Page_1',
          spineIndex: 1,
        },
        resourceRef: {
          kind: 'document-entry',
          source: { filePath: '/books/a.epub', format: 'epub' },
          entryPath: 'image/Page_1.jpg',
          cachePath: '/tmp/page-1.jpg',
          versionPolicy: 'versioned-export',
        },
        cacheResourceRef,
      },
      image: {
        path: '/tmp/page-1.jpg',
        webviewUri: 'vscode-webview://page-1.jpg',
        index: 0,
        width: 1494,
        height: 2133,
        byteSize: 2048,
        mimeType: 'image/jpeg',
        resourceRef: {
          kind: 'document-entry',
          source: { filePath: '/books/a.epub', format: 'epub' },
          entryPath: 'image/Page_1.jpg',
          cachePath: '/tmp/page-1.jpg',
          versionPolicy: 'versioned-export',
        },
        cacheResourceRef,
      },
    });
  });

  it('projects ReadImage argument images into thumbnails while pending', () => {
    const projection = projectToolCallDisplayState({
      id: 'tool-3',
      name: 'ReadImage',
      arguments: {
        images: [
          {
            label: '第10页',
            path: '/tmp/page-10.jpg',
            webviewUri: 'vscode-webview://page-10.jpg',
          },
        ],
        mode: 'vision',
      },
    });

    expect(projection.isPending).toBe(true);
    expect(projection.documentThumbnails).toEqual([
      expect.objectContaining({
        filePath: '/tmp/page-10.jpg',
        path: '/tmp/page-10.jpg',
        src: 'vscode-webview://page-10.jpg',
        label: '第10页',
      }),
    ]);
  });

  it('projects ReadImage image_paths arguments into thumbnails when failed', () => {
    const projection = projectToolCallDisplayState({
      id: 'tool-4',
      name: 'ReadImage',
      arguments: {
        image_paths: ['/tmp/page-1.jpg'],
        imagePathWebviewUris: ['vscode-webview://page-1.jpg'],
      },
      result: {
        success: false,
        data: null,
        error: 'Invalid JSON response',
      },
    });

    expect(projection.isFailed).toBe(true);
    expect(projection.documentThumbnails).toEqual([
      expect.objectContaining({
        filePath: '/tmp/page-1.jpg',
        path: '/tmp/page-1.jpg',
        src: 'vscode-webview://page-1.jpg',
        label: '#1',
      }),
    ]);
  });

  it('projects ReadDocumentImage argument images into thumbnails when failed', () => {
    const projection = projectToolCallDisplayState({
      id: 'tool-5',
      name: 'ReadDocumentImage',
      arguments: {
        file_path: '/books/a.epub',
        source: { filePath: '/books/a.epub', format: 'epub' },
        images: [
          {
            label: 'Page 2',
            path: '/tmp/page-2.jpg',
            webviewUri: 'vscode-webview://page-2.jpg',
            metadata: {
              locator: {
                kind: 'chapter',
                chapterHref: 'Page_2',
                spineIndex: 2,
              },
            },
          },
        ],
      },
      result: {
        success: false,
        data: null,
        error: 'No data received for 30000ms',
      },
    });

    expect(projection.documentThumbnails).toEqual([
      expect.objectContaining({
        filePath: '/books/a.epub',
        path: '/tmp/page-2.jpg',
        src: 'vscode-webview://page-2.jpg',
        label: 'Page 2',
        locator: {
          kind: 'chapter',
          chapterHref: 'Page_2',
          spineIndex: 2,
        },
      }),
    ]);
  });

  it('projects compact copy text for ReadDocument range results', () => {
    const projection = projectToolCallDisplayState({
      id: 'tool-1',
      name: 'ReadDocument',
      arguments: {},
      result: {
        success: true,
        data: {
          source: { filePath: '/books/a.epub', format: 'epub' },
          locator: {
            kind: 'chapter',
            chapterHref: 'Page_10',
            spineIndex: 10,
          },
          text: 'EPUB chapter range with 1 image pages',
        },
      },
    });

    expect(projection.copyText).toBe(
      [
        'Document: /books/a.epub',
        'Location: chapter:Page_10@10',
        'EPUB chapter range with 1 image pages',
      ].join('\n'),
    );
  });
});
