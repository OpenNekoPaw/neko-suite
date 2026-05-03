import { describe, expect, it } from 'vitest';
import {
  buildGeneratedMediaAssets,
  computeAspectRatioLabel,
  inferGeneratedMediaMimeType,
} from '../media-generated-asset';

describe('media generated asset helpers', () => {
  it('infers media mime types from file extensions', () => {
    expect(inferGeneratedMediaMimeType('/tmp/a.png')).toBe('image/png');
    expect(inferGeneratedMediaMimeType('/tmp/a.mp4')).toBe('video/mp4');
    expect(inferGeneratedMediaMimeType('/tmp/a.unknown')).toBe('application/octet-stream');
  });

  it('computes simplified aspect ratio labels', () => {
    expect(computeAspectRatioLabel(1920, 1080)).toBe('16:9');
    expect(computeAspectRatioLabel(1024, 1024)).toBe('1:1');
  });

  it('builds generated image assets with lineage metadata', () => {
    expect(
      buildGeneratedMediaAssets({
        localPaths: ['/tmp/image.png'],
        outputs: [
          { type: 'image', url: 'https://example.test/image.png', width: 768, height: 512 },
        ],
        taskType: 'image',
        prompt: 'A cat',
        model: 'flux',
        request: {
          metadata: {
            sourceNodeId: 'node-1',
            characterIds: ['char-1', ''],
          },
        },
        generateAssetId: () => 'asset-1',
        now: () => '2026-01-01T00:00:00.000Z',
      }),
    ).toEqual([
      {
        id: 'asset-1',
        path: '/tmp/image.png',
        mimeType: 'image/png',
        generatedAt: '2026-01-01T00:00:00.000Z',
        prompt: 'A cat',
        model: 'flux',
        sourceNodeId: 'node-1',
        characterIds: ['char-1'],
        type: 'generated-image',
        width: 768,
        height: 512,
        ratio: '3:2',
      },
    ]);
  });

  it('builds generated video and audio assets with safe defaults', () => {
    expect(
      buildGeneratedMediaAssets({
        localPaths: ['/tmp/video.mp4'],
        outputs: [{ type: 'video', url: 'https://example.test/video.mp4' }],
        taskType: 'video',
        generateAssetId: () => 'video-1',
        now: () => '2026-01-01T00:00:00.000Z',
      })[0],
    ).toEqual(
      expect.objectContaining({
        type: 'generated-video',
        width: 1280,
        height: 720,
        duration: 0,
        fps: 24,
      }),
    );

    expect(
      buildGeneratedMediaAssets({
        localPaths: ['/tmp/audio.mp3'],
        outputs: [{ type: 'audio', url: 'https://example.test/audio.mp3' }],
        taskType: 'audio',
        generateAssetId: () => 'audio-1',
        now: () => '2026-01-01T00:00:00.000Z',
      })[0],
    ).toEqual(
      expect.objectContaining({
        type: 'generated-audio',
        duration: 0,
        sampleRate: 44100,
        channels: 2,
      }),
    );
  });
});
