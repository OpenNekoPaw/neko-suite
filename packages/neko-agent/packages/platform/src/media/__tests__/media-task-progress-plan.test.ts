import { describe, expect, it } from 'vitest';
import {
  MEDIA_TASK_SAVE_NOTIFICATION_ACTION,
  buildMediaTaskProgressDeliveryPlan,
  isTerminalMediaTaskStatus,
} from '../media-task-progress-plan';

describe('media-task-progress-plan', () => {
  it('builds completed delivery decisions with persistence and save notification', () => {
    const plan = buildMediaTaskProgressDeliveryPlan({
      status: 'completed',
      taskType: 'video',
      workspaceRoot: '/repo',
      finalized: {
        resultUrls: ['/repo/.neko/generated/video.mp4'],
        thumbnailUrl: '/repo/.neko/generated/video.mp4',
        generatedAssets: [
          {
            id: 'asset-1',
            type: 'generated-video',
            path: '/repo/.neko/generated/video.mp4',
            mimeType: 'video/mp4',
            generatedAt: '2026-01-01T00:00:00.000Z',
            duration: 5,
            width: 1280,
            height: 720,
            fps: 24,
          },
        ],
      },
    });

    expect(plan).toEqual(
      expect.objectContaining({
        resultUrls: ['/repo/.neko/generated/video.mp4'],
        thumbnailUrl: '/repo/.neko/generated/video.mp4',
        localPaths: ['/repo/.neko/generated/video.mp4'],
        shouldPersistResultUrls: true,
        shouldUnsubscribe: true,
        notification: {
          label: 'Video',
          filePath: '/repo/.neko/generated/video.mp4',
          relativePath: '.neko/generated/video.mp4',
          message: 'Video saved to .neko/generated/video.mp4',
          actionLabel: MEDIA_TASK_SAVE_NOTIFICATION_ACTION,
        },
      }),
    );
  });

  it('does not notify for remote fallback results or disabled notifications', () => {
    const baseInput = {
      status: 'completed' as const,
      taskType: 'image' as const,
      workspaceRoot: '/repo',
      finalized: {
        resultUrls: ['https://example.test/image.png'],
        generatedAssets: [],
      },
    };

    expect(buildMediaTaskProgressDeliveryPlan(baseInput).notification).toBeUndefined();
    expect(
      buildMediaTaskProgressDeliveryPlan({
        ...baseInput,
        showSaveNotification: false,
        finalized: {
          resultUrls: ['/repo/.neko/generated/image.png'],
          generatedAssets: [
            {
              id: 'asset-1',
              type: 'generated-image',
              path: '/repo/.neko/generated/image.png',
              mimeType: 'image/png',
              generatedAt: '2026-01-01T00:00:00.000Z',
              width: 1024,
              height: 1024,
              ratio: '1:1',
            },
          ],
        },
      }).notification,
    ).toBeUndefined();
  });

  it('keeps running tasks subscribed and avoids persistence until completion', () => {
    const plan = buildMediaTaskProgressDeliveryPlan({
      status: 'processing',
      taskType: 'audio',
      finalized: {
        resultUrls: ['https://example.test/audio.mp3'],
        thumbnailUrl: 'https://example.test/audio.mp3',
        generatedAssets: [],
      },
    });

    expect(plan.shouldPersistResultUrls).toBe(false);
    expect(plan.shouldUnsubscribe).toBe(false);
    expect(plan.localPaths).toEqual([]);
    expect(plan.notification).toBeUndefined();
  });

  it('centralizes terminal media task status checks', () => {
    expect(isTerminalMediaTaskStatus('completed')).toBe(true);
    expect(isTerminalMediaTaskStatus('failed')).toBe(true);
    expect(isTerminalMediaTaskStatus('cancelled')).toBe(true);
    expect(isTerminalMediaTaskStatus('processing')).toBe(false);
  });
});
