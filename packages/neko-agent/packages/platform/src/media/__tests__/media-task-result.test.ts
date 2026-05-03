import { describe, expect, it, vi } from 'vitest';
import {
  finalizeCompletedMediaTaskOutputs,
  getMediaTaskPrimaryOutputUrl,
} from '../media-task-result';
import type { MediaTask } from '../types';

describe('media-task-result', () => {
  it('returns the first output URL as primary URL', () => {
    expect(
      getMediaTaskPrimaryOutputUrl({
        outputs: [
          { type: 'image', url: '' },
          { type: 'image', url: 'https://example.com/image.png' },
        ],
      }),
    ).toBe('https://example.com/image.png');
  });

  it('keeps remote outputs when task is not completed', async () => {
    const result = await finalizeCompletedMediaTaskOutputs({
      task: makeTask({ status: 'processing' }),
      taskType: 'image',
      outputDir: '/repo/.neko/generated',
      saveOutputs: vi.fn(),
      generateAssetId: () => 'asset-1',
    });

    expect(result.resultUrls).toEqual(['https://example.com/image.png']);
    expect(result.thumbnailUrl).toBe('https://example.com/image.png');
    expect(result.generatedAssets).toEqual([]);
  });

  it('saves completed outputs and registers generated assets', async () => {
    const saveOutputs = vi.fn().mockResolvedValue(['/repo/.neko/generated/image.png']);
    const assetIndex = { add: vi.fn() };

    const result = await finalizeCompletedMediaTaskOutputs({
      task: makeTask({ status: 'completed' }),
      taskType: 'image',
      outputDir: '/repo/.neko/generated',
      saveOutputs,
      assetIndex,
      generateAssetId: () => 'asset-1',
    });

    expect(saveOutputs).toHaveBeenCalledWith('task-1', '/repo/.neko/generated', {
      transcodeFile: undefined,
    });
    expect(result.resultUrls).toEqual(['/repo/.neko/generated/image.png']);
    expect(result.thumbnailUrl).toBe('/repo/.neko/generated/image.png');
    expect(result.generatedAssets).toHaveLength(1);
    expect(assetIndex.add).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'asset-1',
        path: '/repo/.neko/generated/image.png',
        type: 'generated-image',
      }),
    );
  });

  it('falls back to remote outputs when saving fails', async () => {
    const warn = vi.fn();

    const result = await finalizeCompletedMediaTaskOutputs({
      task: makeTask({ status: 'completed' }),
      taskType: 'image',
      outputDir: '/repo/.neko/generated',
      saveOutputs: vi.fn().mockRejectedValue(new Error('download failed')),
      generateAssetId: () => 'asset-1',
      logger: { warn },
    });

    expect(result.resultUrls).toEqual(['https://example.com/image.png']);
    expect(result.generatedAssets).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });
});

function makeTask(overrides: Partial<MediaTask> = {}): MediaTask {
  return {
    id: 'task-1',
    type: 'text-to-image',
    status: 'completed',
    progress: 100,
    providerId: 'openai',
    modelId: 'gpt-image',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:01.000Z'),
    outputs: [
      {
        type: 'image',
        url: 'https://example.com/image.png',
        width: 1024,
        height: 1024,
        mimeType: 'image/png',
      },
    ],
    request: { prompt: 'cat' },
    ...overrides,
  };
}
