import { describe, expect, it } from 'vitest';
import { mergeConfigs } from './config-normalizer';

describe('config normalizer merge', () => {
  it('merges type default models by key', () => {
    const merged = mergeConfigs(
      {
        defaultModels: {
          llm: { providerId: 'chat-base-provider', modelId: 'chat-base' },
          audio: { providerId: 'audio-base-provider', modelId: 'audio-base' },
        },
      },
      {
        defaultModels: {
          audio: { providerId: 'audio-workspace-provider', modelId: 'audio-workspace' },
          video: { providerId: 'video-workspace-provider', modelId: 'video-workspace' },
        },
      },
    );

    expect(merged.defaultModels).toEqual({
      llm: { providerId: 'chat-base-provider', modelId: 'chat-base' },
      audio: { providerId: 'audio-workspace-provider', modelId: 'audio-workspace' },
      video: { providerId: 'video-workspace-provider', modelId: 'video-workspace' },
    });
  });
});
