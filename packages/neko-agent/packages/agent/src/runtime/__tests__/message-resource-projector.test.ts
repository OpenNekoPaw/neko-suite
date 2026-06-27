import { describe, expect, it } from 'vitest';
import type { Message } from '@neko-agent/types';
import {
  isLocalMediaFilePath,
  projectMessagesForResourceDisplay,
  projectResourceValue,
  updateBackgroundTaskToolResultUrls,
} from '../message-resource-projector';

describe('message resource projector', () => {
  it('detects absolute local media paths only', () => {
    expect(isLocalMediaFilePath('/tmp/image.png')).toBe(true);
    expect(isLocalMediaFilePath('C:\\tmp\\video.mp4')).toBe(true);
    expect(isLocalMediaFilePath('/tmp/readme.txt')).toBe(false);
    expect(isLocalMediaFilePath('relative/image.png')).toBe(false);
    expect(isLocalMediaFilePath('https://example.test/image.png')).toBe(false);
  });

  it('projects single url fields without preserving raw local paths', () => {
    expect(
      projectResourceValue(
        {
          url: '/tmp/image.png',
          thumbnailUrl: '/tmp/thumb.png',
        },
        { resolveLocalMediaPath: (path) => `webview://${path}` },
      ),
    ).toEqual({
      url: 'webview:///tmp/image.png',
      thumbnailUrl: 'webview:///tmp/thumb.png',
    });
  });

  it('projects urls arrays without preserving raw local paths', () => {
    expect(
      projectResourceValue(
        {
          urls: ['/tmp/a.png', 'https://example.test/b.png', '/tmp/c.jpg'],
        },
        { resolveLocalMediaPath: (path) => `webview://${path}` },
      ),
    ).toEqual({
      urls: ['webview:///tmp/a.png', 'https://example.test/b.png', 'webview:///tmp/c.jpg'],
    });
  });

  it('strips runtime-only localPath and localPaths fields', () => {
    expect(
      projectResourceValue(
        {
          localPath: '/tmp/image.png',
          localPaths: ['/tmp/a.png'],
        },
        { resolveLocalMediaPath: (path) => `webview://${path}` },
      ),
    ).toEqual({});
  });

  it('strips runtime-only document scratch fields while preserving stable document refs', () => {
    expect(
      projectResourceValue(
        {
          runtimePath: '/tmp/neko_epub/page-1.jpg',
          runtimeImagePaths: ['/tmp/neko_epub/page-1.jpg'],
          cachePath: '/tmp/neko_epub/page-1.jpg',
          path: '/workspace/.neko/.cache/resources/documents/page-1.jpg',
          resourceRef: {
            kind: 'document-entry',
            source: { filePath: '/books/a.epub', format: 'epub' },
            entryPath: 'OPS/page-1.jpg',
          },
        },
        { resolveLocalMediaPath: (path) => `webview://${path}` },
      ),
    ).toEqual({
      resourceRef: {
        kind: 'document-entry',
        source: { filePath: '/books/a.epub', format: 'epub' },
        entryPath: 'OPS/page-1.jpg',
      },
    });
  });

  it('strips legacy document image path arrays and sanitizes image info', () => {
    expect(
      projectResourceValue(
        {
          imagePaths: ['/tmp/page-1.jpg'],
          imageInfo: [{ path: '/tmp/page-1.jpg', width: 1494, height: 2133 }],
        },
        { resolveLocalMediaPath: (path) => `webview://${path}` },
      ),
    ).toEqual({
      imageInfo: [
        {
          width: 1494,
          height: 2133,
        },
      ],
    });
  });

  it('leaves explicit snake_case image path inputs unprojected', () => {
    expect(
      projectResourceValue(
        {
          image_paths: ['/tmp/page-1.jpg'],
        },
        { resolveLocalMediaPath: (path) => `webview://${path}` },
      ),
    ).toEqual({
      image_paths: ['/tmp/page-1.jpg'],
    });
  });

  it('strips managed cache paths from explicit image path inputs', () => {
    expect(
      projectResourceValue(
        {
          image_paths: ['/workspace/.neko/.cache/resources/documents/page-1.jpg'],
        },
        { resolveLocalMediaPath: (path) => `webview://${path}` },
      ),
    ).toEqual({
      resourceProjectionDiagnostics: [
        {
          code: 'resource-projection-denied',
          severity: 'error',
          field: 'image_paths',
          sourceKind: 'managed-runtime-path',
          message:
            'Local media path could not be projected for Webview display. Use ResourceRef, source refs, workspace-relative paths, or adapter-projected render descriptors.',
        },
      ],
    });
  });

  it('strips legacy document-image-cache paths from explicit image path inputs', () => {
    const legacyCachePath =
      '/Users/feng/Library/Application Support/Code/User/globalStorage/neko.neko-agent/document-image-cache/neko_epub_1/page-1.jpg';

    expect(
      projectResourceValue(
        {
          image_paths: [legacyCachePath],
        },
        { resolveLocalMediaPath: (path) => `webview://${path}` },
      ),
    ).toEqual({
      resourceProjectionDiagnostics: [
        {
          code: 'resource-projection-denied',
          severity: 'error',
          field: 'image_paths',
          sourceKind: 'managed-runtime-path',
          message:
            'Local media path could not be projected for Webview display. Use ResourceRef, source refs, workspace-relative paths, or adapter-projected render descriptors.',
        },
      ],
    });
  });

  it('does not project legacy document-image-cache path fields into Webview messages', () => {
    const legacyCachePath =
      '/Users/feng/Library/Application Support/Code/User/globalStorage/neko.neko-agent/document-image-cache/neko_epub_1/page-1.jpg';

    const projected = projectResourceValue(
      {
        images: [{ label: 'Page 1', path: legacyCachePath }],
      },
      { resolveLocalMediaPath: (path) => `webview://${path}` },
    );

    expect(JSON.stringify(projected)).not.toContain('document-image-cache');
    expect(JSON.stringify(projected)).not.toContain('webview://');
    expect(projected).toEqual({
      images: [
        {
          label: 'Page 1',
          resourceProjectionDiagnostics: [
            {
              code: 'resource-projection-denied',
              severity: 'error',
              field: 'path',
              sourceKind: 'managed-runtime-path',
              message:
                'Local media path could not be projected for Webview display. Use ResourceRef, source refs, workspace-relative paths, or adapter-projected render descriptors.',
            },
          ],
        },
      ],
    });
  });

  it('projects structured image argument paths without adding webview handles', () => {
    expect(
      projectResourceValue(
        {
          images: [{ label: 'Page 1', path: '/tmp/page-1.jpg' }],
        },
        { resolveLocalMediaPath: (path) => `webview://${path}` },
      ),
    ).toEqual({
      images: [{ label: 'Page 1', path: 'webview:///tmp/page-1.jpg' }],
    });
  });

  it('projects tool result payloads in content blocks', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: '',
        timestamp: 1,
        contentBlocks: [
          {
            id: 'block-1',
            type: 'tool_call',
            timestamp: 1,
            toolCall: {
              id: 'tool-2',
              name: 'GenerateVideo',
              arguments: {},
              result: { success: true, data: { urls: ['/tmp/video.mp4'] } },
            },
          },
        ],
      },
    ];

    expect(
      projectMessagesForResourceDisplay(messages, {
        resolveLocalMediaPath: (path) => `webview://${path}`,
      }),
    ).toEqual([
      {
        ...messages[0],
        contentBlocks: [
          {
            id: 'block-1',
            type: 'tool_call',
            timestamp: 1,
            toolCall: {
              id: 'tool-2',
              name: 'GenerateVideo',
              arguments: {},
              result: {
                success: true,
                data: { urls: ['webview:///tmp/video.mp4'] },
              },
            },
          },
        ],
      },
    ]);
  });

  it('projects top-level tool result media fields in content blocks', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: '',
        timestamp: 1,
        contentBlocks: [
          {
            id: 'block-1',
            type: 'tool_call',
            timestamp: 1,
            toolCall: {
              id: 'tool-2',
              name: 'ReadImage',
              arguments: {},
              result: {
                success: true,
                data: {},
                attachments: [
                  {
                    type: 'image',
                    path: '/tmp/page-1.jpg',
                    mimeType: 'image/jpeg',
                    assetRef: {
                      assetId: 'read-image-page-1',
                      uri: '/tmp/page-1.jpg',
                      mimeType: 'image/jpeg',
                    },
                  },
                ],
                perceptionCards: [
                  {
                    version: 1,
                    assetId: 'read-image-page-1',
                    modality: 'image',
                    createdAt: 1,
                    layerStatus: { layer0: 'complete', layer1: 'skipped', layer2: 'complete' },
                    structural: { format: 'jpeg', mimeType: 'image/jpeg', byteSize: 10 },
                    perceptual: {
                      keyframeRefs: [
                        {
                          assetId: 'read-image-page-1',
                          uri: '/tmp/page-1.jpg',
                          mimeType: 'image/jpeg',
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    ];

    expect(
      projectMessagesForResourceDisplay(messages, {
        resolveLocalMediaPath: (path) => `webview://${path}`,
      }),
    ).toEqual([
      {
        ...messages[0],
        contentBlocks: [
          {
            id: 'block-1',
            type: 'tool_call',
            timestamp: 1,
            toolCall: {
              id: 'tool-2',
              name: 'ReadImage',
              arguments: {},
              result: {
                success: true,
                data: {},
                attachments: [
                  {
                    type: 'image',
                    path: 'webview:///tmp/page-1.jpg',
                    mimeType: 'image/jpeg',
                    assetRef: {
                      assetId: 'read-image-page-1',
                      uri: 'webview:///tmp/page-1.jpg',
                      mimeType: 'image/jpeg',
                    },
                  },
                ],
                perceptionCards: [
                  {
                    version: 1,
                    assetId: 'read-image-page-1',
                    modality: 'image',
                    createdAt: 1,
                    layerStatus: { layer0: 'complete', layer1: 'skipped', layer2: 'complete' },
                    structural: { format: 'jpeg', mimeType: 'image/jpeg', byteSize: 10 },
                    perceptual: {
                      keyframeRefs: [
                        {
                          assetId: 'read-image-page-1',
                          uri: 'webview:///tmp/page-1.jpg',
                          mimeType: 'image/jpeg',
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    ]);
  });

  it('projects tool argument payloads in content blocks', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: '',
        timestamp: 1,
        contentBlocks: [
          {
            id: 'block-1',
            type: 'tool_call',
            timestamp: 1,
            toolCall: {
              id: 'tool-2',
              name: 'ReadImage',
              arguments: { images: [{ label: 'Page 1', path: '/tmp/block-page.jpg' }] },
            },
          },
        ],
      },
    ];

    expect(
      projectMessagesForResourceDisplay(messages, {
        resolveLocalMediaPath: (path) => `webview://${path}`,
      }),
    ).toEqual([
      {
        ...messages[0],
        contentBlocks: [
          {
            id: 'block-1',
            type: 'tool_call',
            timestamp: 1,
            toolCall: {
              id: 'tool-2',
              name: 'ReadImage',
              arguments: {
                images: [
                  {
                    label: 'Page 1',
                    path: 'webview:///tmp/block-page.jpg',
                  },
                ],
              },
            },
          },
        ],
      },
    ]);
  });

  it('does not emit display URLs when the host resolver fails', () => {
    expect(
      projectResourceValue(
        {
          url: '/tmp/image.png',
          imagePaths: ['/tmp/page-1.jpg'],
          imageInfo: [{ path: '/tmp/page-1.jpg', width: 1494, height: 2133 }],
        },
        {
          resolveLocalMediaPath: () => {
            throw new Error('bad uri');
          },
        },
      ),
    ).toEqual({
      resourceProjectionDiagnostics: [
        {
          code: 'resource-projection-denied',
          severity: 'error',
          field: 'url',
          sourceKind: 'local-media-path',
          message:
            'Local media path could not be projected for Webview display. Use ResourceRef, source refs, workspace-relative paths, or adapter-projected render descriptors.',
        },
      ],
      imageInfo: [
        {
          width: 1494,
          height: 2133,
        },
      ],
    });
  });

  it('strips legacy runtime/cache projection fields from successful resource payloads', () => {
    expect(
      projectResourceValue(
        {
          images: [
            {
              label: 'Page 1',
              path: '/tmp/page-1.jpg',
              runtimePath: '/tmp/neko_epub/page-1.jpg',
              runtimeKind: 'scratch-path',
              cachePath: '/workspace/.neko/.cache/resources/documents/page-1.jpg',
              cacheResourceRef: {
                cachePath: '/workspace/.neko/.cache/resources/documents/page-1.jpg',
              },
              webviewUri: 'vscode-webview://page-1.jpg',
              imagePathWebviewUris: ['vscode-webview://page-1.jpg'],
            },
          ],
        },
        { resolveLocalMediaPath: (path) => `webview://${path}` },
      ),
    ).toEqual({
      images: [
        {
          label: 'Page 1',
          path: 'webview:///tmp/page-1.jpg',
        },
      ],
    });
  });

  it('updates matching background task tool results with completed urls', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: '',
        timestamp: 1,
        contentBlocks: [
          {
            id: 'block-1',
            type: 'tool_call',
            timestamp: 1,
            toolCall: {
              id: 'tool-1',
              name: 'GenerateImage',
              arguments: {},
              result: {
                success: true,
                data: { taskId: 'task-1', backgroundMode: true, status: 'running' },
              },
            },
          },
        ],
      },
    ];

    const result = updateBackgroundTaskToolResultUrls(messages, 'task-1', ['/tmp/output.png']);

    expect(result.updated).toBe(true);
    expect(result.messages[0]?.contentBlocks?.[0]?.toolCall?.result?.data).toEqual({
      taskId: 'task-1',
      backgroundMode: true,
      status: 'completed',
      url: '/tmp/output.png',
      urls: ['/tmp/output.png'],
    });
  });

  it('does not update non-matching background task tool results', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: '',
        timestamp: 1,
        contentBlocks: [],
      },
    ];

    expect(updateBackgroundTaskToolResultUrls(messages, 'task-1', ['/tmp/output.png'])).toEqual({
      messages,
      updated: false,
    });
  });
});
