import { describe, expect, it, vi } from 'vitest';
import { LegacyVideoModel } from './legacy-video-model';
import type { LegacyMediaAdapter } from '../types';

describe('LegacyVideoModel', () => {
  it('forwards image-to-video and provider options to legacy adapters', async () => {
    const generateVideo = vi.fn(async () => ({
      status: 'completed' as const,
      outputs: [
        {
          type: 'video',
          url: `data:video/mp4;base64,${Buffer.from('video').toString('base64')}`,
          mimeType: 'video/mp4',
        },
      ],
    }));
    const adapter: LegacyMediaAdapter = {
      generateImage: vi.fn(),
      generateVideo,
      generateAudio: vi.fn(),
      getTaskStatus: vi.fn(),
    };
    const model = new LegacyVideoModel('legacy-provider', 'legacy-video', adapter, {
      apiUrl: 'https://example.test',
      apiKey: 'test-key',
    });

    const result = await model.doGenerate({
      prompt: 'animate this comic panel',
      n: 1,
      aspectRatio: '16:9',
      resolution: '1280x720',
      duration: 4,
      fps: 24,
      seed: undefined,
      image: {
        type: 'file',
        mediaType: 'image/png',
        data: Buffer.from('reference').toString('base64'),
      },
      providerOptions: {
        neko: {
          cameraMovement: 'zoom-in',
          cameraAngle: 'eye-level',
          shotScale: 'MS',
          editInstruction: 'subtle breathing and drifting dust',
          motionStrength: 0.4,
          startFrameImageBase64: 'first-frame',
          endFrameImageBase64: 'last-frame',
        },
      },
      headers: {},
    });

    expect(result.videos).toHaveLength(1);
    expect(generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'animate this comic panel',
        width: 1280,
        height: 720,
        aspectRatio: '16:9',
        duration: 4,
        fps: 24,
        referenceImageBase64: Buffer.from('reference').toString('base64'),
        cameraMovement: 'zoom-in',
        cameraAngle: 'eye-level',
        shotScale: 'MS',
        editInstruction: 'subtle breathing and drifting dust',
        motionStrength: 0.4,
        startFrameImageBase64: 'first-frame',
        endFrameImageBase64: 'last-frame',
      }),
      expect.objectContaining({ name: 'legacy-video', id: 'legacy-video' }),
      expect.objectContaining({ type: 'legacy-provider' }),
    );
  });
});
