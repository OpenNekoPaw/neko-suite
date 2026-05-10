import { describe, expect, it, vi } from 'vitest';
import {
  buildMediaTaskProgressViewDelivery,
  buildMediaTaskViewDelivery,
} from '../media-task-progress-view';
import type { MediaTask } from '../types';

describe('buildMediaTaskProgressViewDelivery', () => {
  it('finalizes completed outputs and projects a webview-safe progress view', async () => {
    const assetIndex = { add: vi.fn() };
    const saveOutputs = vi.fn().mockResolvedValue(['/repo/.neko/generated/video.mp4']);

    await expect(
      buildMediaTaskProgressViewDelivery({
        task: createMediaTask(),
        taskType: 'video',
        outputDir: '/repo/.neko/generated',
        workspaceRoot: '/repo',
        showSaveNotification: true,
        saveOutputs,
        assetIndex,
        generateAssetId: () => 'asset-1',
        resolveResultUrl: (url) => `webview://${url}`,
        toViewAsset: (asset) => ({ ...asset, webviewUri: `webview://${asset.path}` }),
        now: () => new Date('2026-01-01T00:00:02.000Z'),
      }),
    ).resolves.toEqual({
      view: {
        id: 'task-1',
        type: 'video',
        status: 'completed',
        progress: 100,
        result: {
          urls: ['webview:///repo/.neko/generated/video.mp4'],
          thumbnailUrl: 'webview:///repo/.neko/generated/video.mp4',
          localPaths: ['/repo/.neko/generated/video.mp4'],
          assets: [
            expect.objectContaining({
              id: 'asset-1',
              path: '/repo/.neko/generated/video.mp4',
              characterIds: ['char_linxia'],
              sourceNodeId: 'node-shot-1',
              webviewUri: 'webview:///repo/.neko/generated/video.mp4',
            }),
          ],
          creativeEntity: expect.objectContaining({
            characterIds: ['char_linxia'],
            sourceNodeId: 'node-shot-1',
            generatedAssetIds: ['asset-1'],
            requirements: [
              expect.objectContaining({
                entityId: 'char_linxia',
                requiredKinds: ['motion'],
                status: 'generated',
              }),
            ],
            bindingCandidates: [
              expect.objectContaining({
                entityId: 'char_linxia',
                generatedAssetId: 'asset-1',
                roles: ['motion'],
              }),
            ],
          }),
        },
        error: undefined,
        updatedAt: '2026-01-01T00:00:02.000Z',
      },
      deliveryPlan: expect.objectContaining({
        resultUrls: ['/repo/.neko/generated/video.mp4'],
        thumbnailUrl: '/repo/.neko/generated/video.mp4',
        localPaths: ['/repo/.neko/generated/video.mp4'],
        shouldPersistResultUrls: true,
        shouldUnsubscribe: true,
        notification: expect.objectContaining({
          filePath: '/repo/.neko/generated/video.mp4',
        }),
      }),
    });
    expect(saveOutputs).toHaveBeenCalledWith('task-1', '/repo/.neko/generated', {
      transcodeFile: undefined,
    });
    expect(assetIndex.add).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'asset-1', path: '/repo/.neko/generated/video.mp4' }),
    );
  });

  it('projects finalized outputs into a full media task view', async () => {
    await expect(
      buildMediaTaskViewDelivery({
        task: createMediaTask(),
        taskType: 'video',
        outputDir: '/repo/.neko/generated',
        workspaceRoot: '/repo',
        saveOutputs: vi.fn().mockResolvedValue(['/repo/.neko/generated/video.mp4']),
        generateAssetId: () => 'asset-1',
        resolveResultUrl: (url) => `webview://${url}`,
        toViewAsset: (asset) => ({ ...asset, webviewUri: `webview://${asset.path}` }),
      }),
    ).resolves.toEqual({
      view: expect.objectContaining({
        id: 'task-1',
        type: 'video',
        status: 'completed',
        result: {
          urls: ['webview:///repo/.neko/generated/video.mp4'],
          thumbnailUrl: 'webview:///repo/.neko/generated/video.mp4',
          localPaths: ['/repo/.neko/generated/video.mp4'],
          assets: [
            expect.objectContaining({
              id: 'asset-1',
              characterIds: ['char_linxia'],
              webviewUri: 'webview:///repo/.neko/generated/video.mp4',
            }),
          ],
          creativeEntity: expect.objectContaining({
            characterIds: ['char_linxia'],
            generatedAssetIds: ['asset-1'],
            actions: expect.arrayContaining([
              expect.objectContaining({
                kind: 'confirm-binding',
                entityId: 'char_linxia',
                generatedAssetId: 'asset-1',
                role: 'motion',
              }),
            ]),
          }),
        },
      }),
      deliveryPlan: expect.objectContaining({
        resultUrls: ['/repo/.neko/generated/video.mp4'],
        shouldPersistResultUrls: true,
      }),
    });
  });
});

function createMediaTask(): MediaTask {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 'task-1',
    type: 'text-to-video',
    status: 'completed',
    progress: 100,
    providerId: 'runway',
    modelId: 'gen-4',
    createdAt: now,
    updatedAt: now,
    request: {
      prompt: 'city flythrough',
      metadata: { characterIds: ['char_linxia'], sourceNodeId: 'node-shot-1' },
    },
    outputs: [
      {
        type: 'video',
        url: 'https://remote.test/video.mp4',
        width: 1280,
        height: 720,
        duration: 5,
      },
    ],
  };
}
