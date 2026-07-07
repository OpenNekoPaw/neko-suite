import { describe, expect, it } from 'vitest';
import type { MediaTask } from '@neko/platform';
import type { GeneratedAsset } from '@neko/shared';
import { toMediaTaskResultObservationTask } from './mediaTaskResultObservation';

describe('media task result observation projection', () => {
  it('returns generated asset refs and host-local save paths for completed outputs', () => {
    const localPath = '/workspace/neko/generated/image/asset-1.png';
    const asset: GeneratedAsset = {
      id: 'asset-1',
      type: 'generated-image',
      path: localPath,
      mimeType: 'image/png',
      generatedAt: '2026-01-01T00:00:00.000Z',
      prompt: 'cat',
      model: 'gpt-image-1',
      width: 1024,
      height: 1024,
      ratio: '1:1',
      assetRef: {
        assetId: 'asset-1',
        uri: 'generated-assets/asset-1.png',
        mimeType: 'image/png',
      },
    };

    const task = toMediaTaskResultObservationTask({
      conversationId: 'conv-1',
      taskId: 'task-1',
      progress: 100,
      mediaTask: createMediaTask(),
      deliveryPlan: {
        resultUrls: ['generated-assets/asset-1.png'],
        thumbnailUrl: 'generated-assets/asset-1.png',
        hostOutputPaths: [localPath],
        generatedAssets: [asset],
        shouldPersistResultUrls: true,
        shouldUnsubscribe: true,
      },
    });

    const data = task.output?.data as {
      readonly hostOutputPaths?: readonly string[];
      readonly assets?: readonly Array<Record<string, unknown>>;
    };
    const projectedAsset = data.assets?.[0];

    expect(data.hostOutputPaths).toEqual([localPath]);
    expect(projectedAsset).toMatchObject({
      id: 'asset-1',
      mimeType: 'image/png',
      label: 'generated-assets/asset-1.png',
      localPath,
      assetRef: {
        assetId: 'asset-1',
        uri: 'generated-assets/asset-1.png',
        mimeType: 'image/png',
      },
      resourceRef: {
        scope: 'project',
        provider: 'generated-asset',
        kind: 'generated',
        source: {
          kind: 'generated-asset',
          generatedAssetId: 'asset-1',
          filePath: localPath,
          metadata: {
            path: localPath,
            mimeType: 'image/png',
          },
        },
        locator: {
          kind: 'generated-asset',
          assetId: 'asset-1',
        },
      },
    });
  });
});

function createMediaTask(): MediaTask {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 'task-1',
    type: 'text-to-image',
    status: 'completed',
    progress: 100,
    providerId: 'openai',
    modelId: 'gpt-image-1',
    createdAt: now,
    updatedAt: now,
    completedAt: now,
    request: {
      prompt: 'cat',
      metadata: {
        conversationId: 'conv-1',
        runId: 'run-1',
        runStartedAt: 101,
      },
    },
    outputs: [{ type: 'image', url: 'https://example.test/image.png', mimeType: 'image/png' }],
  };
}
