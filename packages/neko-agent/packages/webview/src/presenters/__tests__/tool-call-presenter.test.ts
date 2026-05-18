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
  });
});
