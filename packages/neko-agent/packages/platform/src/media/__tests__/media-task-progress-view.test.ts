import { describe, expect, it, vi } from 'vitest';
import {
  buildMediaTaskProgressViewDelivery,
  buildMediaTaskViewDelivery,
} from '../media-task-progress-view';
import type { MediaTask } from '../types';

describe('buildMediaTaskProgressViewDelivery', () => {
  it('finalizes completed outputs and projects a webview-safe progress view', async () => {
    const assetIndex = { add: vi.fn() };
    const saveOutputs = vi.fn().mockResolvedValue(['/repo/.neko/.cache/generated/video.mp4']);

    const delivery = await buildMediaTaskProgressViewDelivery({
      task: createMediaTask(),
      taskType: 'video',
      outputDir: '/repo/.neko/.cache/generated',
      workspaceRoot: '/repo',
      showSaveNotification: true,
      saveOutputs,
      assetIndex,
      generateAssetId: () => 'asset-1',
      computeContentDigest: vi.fn().mockResolvedValue('sha256:video'),
      resolveResultUrl: (url) =>
        url.startsWith('generated-assets/')
          ? `webview://media/task-1/${url.split('/').pop()}`
          : undefined,
      toViewAsset: ({ path: _path, ...asset }) => ({
        ...asset,
        renderUri: `webview://generated/${asset.id}`,
      }),
      now: () => new Date('2026-01-01T00:00:02.000Z'),
    });

    expect(delivery).toEqual({
      view: {
        id: 'task-1',
        type: 'video',
        status: 'completed',
        progress: 100,
        result: {
          urls: ['webview://media/task-1/asset-1.mp4'],
          thumbnailUrl: 'webview://media/task-1/asset-1.mp4',
          assets: [
            expect.objectContaining({
              id: 'asset-1',
              characterIds: ['char_linxia'],
              sourceNodeId: 'node-shot-1',
              renderUri: 'webview://generated/asset-1',
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
        resultUrls: ['generated-assets/asset-1.mp4'],
        thumbnailUrl: 'generated-assets/asset-1.mp4',
        hostOutputPaths: ['/repo/.neko/.cache/generated/video.mp4'],
        shouldPersistResultUrls: true,
        shouldUnsubscribe: true,
        notification: expect.objectContaining({
          filePath: '/repo/.neko/.cache/generated/video.mp4',
          displayRef: 'generated-assets/asset-1.mp4',
          message: 'Video saved as generated-assets/asset-1.mp4',
        }),
      }),
    });
    expect(delivery.deliveryPlan.notification?.message).not.toContain('.neko/.cache/generated');
    expect(saveOutputs).toHaveBeenCalledWith('task-1', '/repo/.neko/.cache/generated', {
      transcodeFile: undefined,
    });
    expect(assetIndex.add).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'asset-1', path: '/repo/.neko/.cache/generated/video.mp4' }),
    );
    expect(JSON.stringify(delivery.view.result?.assets)).not.toContain('.neko/.cache/generated');
    expect(delivery.view.result?.assets?.[0]).not.toHaveProperty('path');
  });

  it('projects finalized outputs into a full media task view', async () => {
    await expect(
      buildMediaTaskViewDelivery({
        task: createMediaTask(),
        taskType: 'video',
        outputDir: '/repo/.neko/.cache/generated',
        workspaceRoot: '/repo',
        saveOutputs: vi.fn().mockResolvedValue(['/repo/.neko/.cache/generated/video.mp4']),
        generateAssetId: () => 'asset-1',
        computeContentDigest: vi.fn().mockResolvedValue('sha256:video'),
        resolveResultUrl: (url) =>
          url.startsWith('generated-assets/')
            ? `webview://media/task-1/${url.split('/').pop()}`
            : undefined,
        toViewAsset: ({ path: _path, ...asset }) => ({
          ...asset,
          renderUri: `webview://generated/${asset.id}`,
        }),
      }),
    ).resolves.toEqual({
      view: expect.objectContaining({
        id: 'task-1',
        type: 'video',
        status: 'completed',
        result: {
          urls: ['webview://media/task-1/asset-1.mp4'],
          thumbnailUrl: 'webview://media/task-1/asset-1.mp4',
          assets: [
            expect.objectContaining({
              id: 'asset-1',
              characterIds: ['char_linxia'],
              renderUri: 'webview://generated/asset-1',
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
        resultUrls: ['generated-assets/asset-1.mp4'],
        shouldPersistResultUrls: true,
      }),
    });
  });

  it('omits renderable URLs and assets when host projection fails', async () => {
    const delivery = await buildMediaTaskProgressViewDelivery({
      task: createMediaTask(),
      taskType: 'video',
      outputDir: '/repo/.neko/.cache/generated',
      workspaceRoot: '/repo',
      saveOutputs: vi.fn().mockResolvedValue(['/repo/.neko/.cache/generated/video.mp4']),
      generateAssetId: () => 'asset-1',
      computeContentDigest: vi.fn().mockResolvedValue('sha256:video'),
      resolveResultUrl: () => undefined,
      toViewAsset: () => undefined,
    });

    expect(delivery).toMatchObject({
      view: {
        id: 'task-1',
        result: {
          urls: [],
        },
      },
      deliveryPlan: {
        resultUrls: ['generated-assets/asset-1.mp4'],
      },
    });
    expect(delivery.view.result).not.toHaveProperty('assets');
    expect(JSON.stringify(delivery.view)).not.toContain('renderUri');
    expect(JSON.stringify(delivery.view.result?.urls)).not.toContain('.neko/.cache/generated');
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
