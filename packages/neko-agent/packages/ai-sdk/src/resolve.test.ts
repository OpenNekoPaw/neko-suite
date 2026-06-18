import { describe, expect, it, vi } from 'vitest';
import type { LegacyAdapterResult, LegacyMediaAdapter } from './types';
import { AI_SDK_LEGACY_BRIDGE_MIGRATION_PROVIDER_TYPES, resolveProvider } from './resolve';
import { LegacyImageModel } from './bridge/legacy-image-model';
import { LegacySpeechModel } from './bridge/legacy-speech-model';
import { LegacyVideoModel } from './bridge/legacy-video-model';

describe('resolveProvider', () => {
  it('keeps only explicit migration providers on the adapter bridge', () => {
    const adapter = createLegacyMediaAdapter();
    const config = { apiUrl: 'https://api.example.test/v1', apiKey: 'test-key' };

    for (const providerType of ['fal', 'dashscope']) {
      const resolved = resolveProvider(providerType, config, adapter, {
        allowLegacyBridge: true,
      });

      expect(resolved?.type).toBe(providerType);
      expect(resolved?.source).toBe('legacy-bridge');
      expect(resolved?.image('image-model')).toBeInstanceOf(LegacyImageModel);
      expect(resolved?.video('video-model')).toBeInstanceOf(LegacyVideoModel);
      expect(resolved?.speech('speech-model')).toBeInstanceOf(LegacySpeechModel);
    }
  });

  it('does not synthesize unsupported providers without explicit migration bridge opt-in', () => {
    const adapter = createLegacyMediaAdapter();
    expect(
      resolveProvider('fal', { apiUrl: 'https://api.example.test/v1', apiKey: 'test-key' }),
    ).toBeNull();
    expect(
      resolveProvider(
        'fal',
        { apiUrl: 'https://api.example.test/v1', apiKey: 'test-key' },
        adapter,
      ),
    ).toBeNull();
  });

  it('resolves native OpenAI-compatible paths without requiring a package media adapter', () => {
    const config = { apiUrl: 'https://api.example.test/v1', apiKey: 'test-key' };

    expect(resolveProvider('openai', config)).toMatchObject({ type: 'openai', source: 'native' });
    expect(resolveProvider('newapi', config)).toMatchObject({ type: 'newapi', source: 'native' });
    expect(resolveProvider('oneapi', config)).toMatchObject({ type: 'newapi', source: 'native' });
    expect(resolveProvider('generic', config)).toMatchObject({ type: 'newapi', source: 'native' });
    expect(resolveProvider('xai', config)).toMatchObject({ type: 'xai', source: 'native' });
  });

  it('resolves Kling through the compatible native path and does not invoke the bridge', () => {
    const poisonedAdapter = createPoisonedLegacyMediaAdapter();
    const resolved = resolveProvider(
      'kling',
      { apiUrl: 'https://api.example.test/v1', apiKey: 'test-key' },
      poisonedAdapter,
      { allowLegacyBridge: true },
    );

    expect(resolved).toMatchObject({ type: 'kling', source: 'native' });
    expect(resolved?.image('image-model')).not.toBeInstanceOf(LegacyImageModel);
    expect(resolved?.video('video-model')).not.toBeInstanceOf(LegacyVideoModel);
    expect(resolved?.speech('speech-model')).not.toBeInstanceOf(LegacySpeechModel);
  });

  it('tracks provider types still allowed to use the migration bridge', () => {
    expect(AI_SDK_LEGACY_BRIDGE_MIGRATION_PROVIDER_TYPES).toEqual([
      'fal',
      'dashscope',
      'runway',
      'luma',
      'suno',
      'vidu',
      'midjourney',
      'minimax',
      'liblib',
    ]);
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

function createPoisonedLegacyMediaAdapter(): LegacyMediaAdapter {
  const fail = vi.fn(async () => {
    throw new Error('legacy bridge should not be invoked');
  });
  return {
    generateImage: fail,
    generateVideo: fail,
    generateAudio: fail,
    getTaskStatus: fail,
  };
}
