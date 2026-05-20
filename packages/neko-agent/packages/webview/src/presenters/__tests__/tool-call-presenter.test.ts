import { describe, expect, it } from 'vitest';
import { projectToolCallDisplayState } from '../tool-call-presenter';

describe('tool-call-presenter', () => {
  it('projects ReadDocument image metadata into thumbnail view models', () => {
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
            },
          ],
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
        byteSize: 1024,
        mimeType: 'image/jpeg',
        label: 'C2',
        locator: {
          kind: 'chapter',
          chapterHref: 'Page_1',
          spineIndex: 1,
        },
      }),
    ]);
    expect(projection.copyText).toContain('Document: /books/a.epub');
    expect(projection.copyText).toContain('C2 · 1494 x 2133 · 1 KB · /tmp/page-1.jpg');

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
      },
      image: {
        path: '/tmp/page-1.jpg',
        webviewUri: 'vscode-webview://page-1.jpg',
        index: 0,
        width: 1494,
        height: 2133,
        byteSize: 1024,
        mimeType: 'image/jpeg',
      },
    });
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
