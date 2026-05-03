import { describe, expect, it } from 'vitest';
import {
  createMediaTaskActionCandidate,
  createMediaTaskView,
  createMediaTaskProgressView,
  filterLocalMediaPaths,
  getMediaTaskConversationId,
  matchesMediaTaskConversation,
  toMediaBackgroundTaskStatus,
  toMediaBackgroundTaskType,
} from '../media-task-view';

describe('media task view helpers', () => {
  it('maps media generation types to background task types', () => {
    expect(toMediaBackgroundTaskType('text-to-image')).toBe('image');
    expect(toMediaBackgroundTaskType('image-edit')).toBe('image');
    expect(toMediaBackgroundTaskType('text-to-video')).toBe('video');
    expect(toMediaBackgroundTaskType('video-edit')).toBe('video');
    expect(toMediaBackgroundTaskType('text-to-music')).toBe('audio');
  });

  it('maps media task status to background task status', () => {
    expect(toMediaBackgroundTaskStatus('pending')).toBe('queued');
    expect(toMediaBackgroundTaskStatus('processing')).toBe('processing');
    expect(toMediaBackgroundTaskStatus('completed')).toBe('completed');
  });

  it('filters local filesystem paths from result urls', () => {
    expect(
      filterLocalMediaPaths(['/tmp/a.png', 'https://example.test/a.png', 'C:\\tmp\\b.png']),
    ).toEqual(['/tmp/a.png', 'C:\\tmp\\b.png']);
  });

  it('reads conversation id from media task metadata', () => {
    const task = {
      request: { prompt: 'cat', metadata: { conversationId: 'conv-1' } },
    };

    expect(getMediaTaskConversationId(task as any)).toBe('conv-1');
    expect(matchesMediaTaskConversation(task as any, 'conv-1')).toBe(true);
    expect(matchesMediaTaskConversation(task as any, 'conv-2')).toBe(false);
  });

  it('projects a media task into an action candidate for host task controls', () => {
    expect(
      createMediaTaskActionCandidate({
        id: 'task-1',
        request: { prompt: 'cat', metadata: { conversationId: 'conv-1' } },
        outputs: [{ type: 'image', url: 'https://example.test/image.png' }],
      } as any),
    ).toEqual({
      id: 'task-1',
      conversationId: 'conv-1',
      resultUrl: 'https://example.test/image.png',
    });
  });

  it('projects media task progress into a background task update view', () => {
    expect(
      createMediaTaskProgressView({
        task: {
          id: 'task-1',
          type: 'text-to-video',
          status: 'completed',
          progress: 100,
          providerId: 'runway',
          modelId: 'gen-3',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:01.000Z'),
          request: { prompt: 'cat' },
          error: undefined,
        } as any,
        urls: ['webview://video.mp4'],
        thumbnailUrl: 'webview://thumb.jpg',
        localPaths: ['/tmp/video.mp4'],
        assets: [
          {
            id: 'asset-1',
            type: 'generated-video',
            path: '/tmp/video.mp4',
            webviewUri: 'webview://video.mp4',
          } as any,
        ],
        now: () => new Date('2026-01-01T00:00:02.000Z'),
      }),
    ).toEqual({
      id: 'task-1',
      type: 'video',
      status: 'completed',
      progress: 100,
      result: {
        urls: ['webview://video.mp4'],
        thumbnailUrl: 'webview://thumb.jpg',
        localPaths: ['/tmp/video.mp4'],
        assets: [
          {
            id: 'asset-1',
            type: 'generated-video',
            path: '/tmp/video.mp4',
            webviewUri: 'webview://video.mp4',
          },
        ],
      },
      error: undefined,
      updatedAt: '2026-01-01T00:00:02.000Z',
    });
  });

  it('projects a raw media task into the webview-safe task schema', () => {
    expect(
      createMediaTaskView({
        id: 'task-1',
        type: 'text-to-video',
        status: 'completed',
        progress: 100,
        providerId: 'runway',
        modelId: 'gen-3',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:01.000Z'),
        request: { prompt: 'cinematic cat' },
        outputs: [
          {
            type: 'video',
            url: 'https://example.test/video.mp4',
            width: 1280,
            height: 720,
            duration: 5,
            thumbnailUrl: 'https://example.test/thumb.jpg',
          },
        ],
      } as any),
    ).toEqual({
      id: 'task-1',
      type: 'video',
      status: 'completed',
      progress: 100,
      providerId: 'runway',
      modelId: 'gen-3',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:01.000Z',
      outputs: [
        {
          url: 'https://example.test/video.mp4',
          width: 1280,
          height: 720,
          duration: 5,
          thumbnailUrl: 'https://example.test/thumb.jpg',
        },
      ],
      request: { prompt: 'cinematic cat' },
    });
  });

  it('projects finalized media result into the webview-safe task schema', () => {
    expect(
      createMediaTaskView(
        {
          id: 'task-1',
          type: 'text-to-image',
          status: 'completed',
          progress: 100,
          providerId: 'openai',
          modelId: 'gpt-image-1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:01.000Z'),
          request: { prompt: 'cat' },
          outputs: [{ type: 'image', url: 'https://remote.test/image.png' }],
        } as any,
        {
          urls: ['webview://local-image.png'],
          thumbnailUrl: 'webview://local-image.png',
          localPaths: ['/tmp/local-image.png'],
          assets: [
            {
              id: 'asset-1',
              type: 'generated-image',
              path: '/tmp/local-image.png',
              webviewUri: 'webview://local-image.png',
            } as any,
          ],
        },
      ),
    ).toMatchObject({
      id: 'task-1',
      result: {
        urls: ['webview://local-image.png'],
        thumbnailUrl: 'webview://local-image.png',
        localPaths: ['/tmp/local-image.png'],
        assets: [
          {
            id: 'asset-1',
            webviewUri: 'webview://local-image.png',
          },
        ],
      },
    });
  });
});
