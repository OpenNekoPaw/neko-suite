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

  it('projects single url fields and preserves the original localPath', () => {
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
      localPath: '/tmp/image.png',
      thumbnailUrl: 'webview:///tmp/thumb.png',
    });
  });

  it('projects urls arrays and preserves localPaths', () => {
    expect(
      projectResourceValue(
        {
          urls: ['/tmp/a.png', 'https://example.test/b.png', '/tmp/c.jpg'],
        },
        { resolveLocalMediaPath: (path) => `webview://${path}` },
      ),
    ).toEqual({
      urls: ['webview:///tmp/a.png', 'https://example.test/b.png', 'webview:///tmp/c.jpg'],
      localPaths: ['/tmp/a.png', '/tmp/c.jpg'],
    });
  });

  it('does not rewrite explicit localPath and localPaths fields', () => {
    expect(
      projectResourceValue(
        {
          localPath: '/tmp/image.png',
          localPaths: ['/tmp/a.png'],
        },
        { resolveLocalMediaPath: (path) => `webview://${path}` },
      ),
    ).toEqual({
      localPath: '/tmp/image.png',
      localPaths: ['/tmp/a.png'],
    });
  });

  it('adds webview URI siblings for document image paths without replacing local paths', () => {
    expect(
      projectResourceValue(
        {
          imagePaths: ['/tmp/page-1.jpg'],
          imageInfo: [{ path: '/tmp/page-1.jpg', width: 1494, height: 2133 }],
        },
        { resolveLocalMediaPath: (path) => `webview://${path}` },
      ),
    ).toEqual({
      imagePaths: ['/tmp/page-1.jpg'],
      imagePathWebviewUris: ['webview:///tmp/page-1.jpg'],
      imageInfo: [
        {
          path: '/tmp/page-1.jpg',
          webviewUri: 'webview:///tmp/page-1.jpg',
          width: 1494,
          height: 2133,
        },
      ],
    });
  });

  it('adds webview URI siblings for snake_case image path arguments', () => {
    expect(
      projectResourceValue(
        {
          image_paths: ['/tmp/page-1.jpg'],
        },
        { resolveLocalMediaPath: (path) => `webview://${path}` },
      ),
    ).toEqual({
      image_paths: ['/tmp/page-1.jpg'],
      imagePathWebviewUris: ['webview:///tmp/page-1.jpg'],
    });
  });

  it('projects structured image argument paths without replacing local paths', () => {
    expect(
      projectResourceValue(
        {
          images: [{ label: 'Page 1', path: '/tmp/page-1.jpg' }],
        },
        { resolveLocalMediaPath: (path) => `webview://${path}` },
      ),
    ).toEqual({
      images: [
        { label: 'Page 1', path: '/tmp/page-1.jpg', webviewUri: 'webview:///tmp/page-1.jpg' },
      ],
    });
  });

  it('projects tool result payloads in legacy toolCalls and content blocks', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: '',
        timestamp: 1,
        toolCalls: [
          {
            id: 'tool-1',
            name: 'GenerateImage',
            arguments: {},
            result: { success: true, data: { url: '/tmp/legacy.png' } },
          },
        ],
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
        toolCalls: [
          {
            id: 'tool-1',
            name: 'GenerateImage',
            arguments: {},
            result: {
              success: true,
              data: { url: 'webview:///tmp/legacy.png', localPath: '/tmp/legacy.png' },
            },
          },
        ],
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
                data: { urls: ['webview:///tmp/video.mp4'], localPaths: ['/tmp/video.mp4'] },
              },
            },
          },
        ],
      },
    ]);
  });

  it('projects tool argument payloads in legacy toolCalls and content blocks', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: '',
        timestamp: 1,
        toolCalls: [
          {
            id: 'tool-1',
            name: 'ReadImage',
            arguments: { image_paths: ['/tmp/legacy-page.jpg'] },
          },
        ],
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
        toolCalls: [
          {
            id: 'tool-1',
            name: 'ReadImage',
            arguments: {
              image_paths: ['/tmp/legacy-page.jpg'],
              imagePathWebviewUris: ['webview:///tmp/legacy-page.jpg'],
            },
          },
        ],
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
                    path: '/tmp/block-page.jpg',
                    webviewUri: 'webview:///tmp/block-page.jpg',
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
      localPath: '/tmp/image.png',
      imagePaths: ['/tmp/page-1.jpg'],
      imageInfo: [{ path: '/tmp/page-1.jpg', width: 1494, height: 2133 }],
    });
  });

  it('updates matching background task tool results with completed urls', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: '',
        timestamp: 1,
        toolCalls: [
          {
            id: 'tool-1',
            name: 'GenerateImage',
            arguments: {},
            result: {
              success: true,
              data: { taskId: 'task-1', backgroundMode: true, status: 'running' },
            },
          },
        ],
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
    expect(result.messages[0]?.toolCalls?.[0]?.result?.data).toEqual({
      taskId: 'task-1',
      backgroundMode: true,
      status: 'completed',
      url: '/tmp/output.png',
      urls: ['/tmp/output.png'],
      localPath: '/tmp/output.png',
      localPaths: ['/tmp/output.png'],
    });
    expect(result.messages[0]?.contentBlocks?.[0]?.toolCall?.result?.data).toEqual({
      taskId: 'task-1',
      backgroundMode: true,
      status: 'completed',
      url: '/tmp/output.png',
      urls: ['/tmp/output.png'],
      localPath: '/tmp/output.png',
      localPaths: ['/tmp/output.png'],
    });
  });

  it('does not update non-matching background task tool results', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: '',
        timestamp: 1,
        toolCalls: [
          {
            id: 'tool-1',
            name: 'GenerateImage',
            arguments: {},
            result: { success: true, data: { taskId: 'other', backgroundMode: true } },
          },
        ],
      },
    ];

    expect(updateBackgroundTaskToolResultUrls(messages, 'task-1', ['/tmp/output.png'])).toEqual({
      messages,
      updated: false,
    });
  });
});
