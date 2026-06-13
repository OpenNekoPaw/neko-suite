import { describe, expect, it, vi } from 'vitest';
import type { LegacyAdapterResult, LegacyMediaAdapter } from './types';
import { resolveProvider } from './resolve';
import { LegacyImageModel } from './bridge/legacy-image-model';
import { LegacySpeechModel } from './bridge/legacy-speech-model';
import { LegacyVideoModel } from './bridge/legacy-video-model';

describe('resolveProvider', () => {
  it('keeps fal.ai, DashScope, and Kling on the adapter bridge until native paths exist', () => {
    const adapter = createLegacyMediaAdapter();
    const config = { apiUrl: 'https://api.example.test/v1', apiKey: 'test-key' };

    for (const providerType of ['fal', 'dashscope', 'kling']) {
      const resolved = resolveProvider(providerType, config, adapter);

      expect(resolved?.type).toBe(providerType);
      expect(resolved?.image('image-model')).toBeInstanceOf(LegacyImageModel);
      expect(resolved?.video('video-model')).toBeInstanceOf(LegacyVideoModel);
      expect(resolved?.speech('speech-model')).toBeInstanceOf(LegacySpeechModel);
    }
  });

  it('does not synthesize unsupported providers without a package media adapter', () => {
    expect(
      resolveProvider('fal', { apiUrl: 'https://api.example.test/v1', apiKey: 'test-key' }),
    ).toBeNull();
  });

  it('resolves native OpenAI-compatible paths without requiring a package media adapter', () => {
    const config = { apiUrl: 'https://api.example.test/v1', apiKey: 'test-key' };

    expect(resolveProvider('openai', config)?.type).toBe('openai');
    expect(resolveProvider('newapi', config)?.type).toBe('newapi');
    expect(resolveProvider('oneapi', config)?.type).toBe('newapi');
    expect(resolveProvider('generic', config)?.type).toBe('newapi');
  });
});

function createLegacyMediaAdapter(): LegacyMediaAdapter {
  const result: LegacyAdapterResult = {
    status: 'completed',
    outputs: [{ type: 'image', url: 'https://example.test/out.png' }],
  };
  return {
    generateImage: vi.fn(async () => result),
    generateVideo: vi.fn(async () => result),
    generateAudio: vi.fn(async () => result),
    getTaskStatus: vi.fn(async () => result),
  };
}
