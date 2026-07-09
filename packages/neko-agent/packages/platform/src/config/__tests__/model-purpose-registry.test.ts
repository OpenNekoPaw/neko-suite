import { describe, expect, it } from 'vitest';
import type { Model } from '../../types/provider';
import { modelSupportsPurpose } from '../model-purpose-registry';

const providerId = 'neko-gateway';

function createModel(input: Pick<Model, 'id' | 'type' | 'capabilities'> & Partial<Model>): Model {
  return {
    name: input.id,
    providerId,
    enabled: true,
    ...input,
  };
}

describe('model-purpose-registry', () => {
  it('treats existing catalog capability fields as satisfying internal purposes', () => {
    expect(
      modelSupportsPurpose(
        createModel({ id: 'suno-v4', type: 'audio', capabilities: ['text_to_music'] }),
        'audio.music.generate',
      ),
    ).toBe(true);
    expect(
      modelSupportsPurpose(
        createModel({ id: 'gpt', type: 'llm', capabilities: ['chat', 'streaming'] }),
        'llm.chat',
      ),
    ).toBe(true);
    expect(
      modelSupportsPurpose(
        createModel({ id: 'kling', type: 'video', capabilities: ['text_to_video'] }),
        'video.generate',
      ),
    ).toBe(true);
  });

  it('requires explicit native video understanding instead of generic vision', () => {
    expect(
      modelSupportsPurpose(
        createModel({ id: 'vision-only', type: 'llm', capabilities: ['chat', 'vision'] }),
        'video.understand',
      ),
    ).toBe(false);
    expect(
      modelSupportsPurpose(
        createModel({
          id: 'gemini-video',
          type: 'llm',
          capabilities: ['chat', 'vision', 'video.understand'],
        }),
        'video.understand',
      ),
    ).toBe(true);
  });

  it('requires explicit native image and audio understanding capabilities', () => {
    expect(
      modelSupportsPurpose(
        createModel({ id: 'vision-only', type: 'llm', capabilities: ['chat', 'vision'] }),
        'image.understand',
      ),
    ).toBe(false);
    expect(
      modelSupportsPurpose(
        createModel({ id: 'tts', type: 'audio', capabilities: ['text_to_audio', 'audio'] }),
        'audio.understand',
      ),
    ).toBe(false);
    expect(
      modelSupportsPurpose(
        createModel({
          id: 'gemini-media',
          type: 'llm',
          capabilities: ['chat', 'vision', 'image.understand', 'audio.understand'],
        }),
        'image.understand',
      ),
    ).toBe(true);
    expect(
      modelSupportsPurpose(
        createModel({
          id: 'gemini-media',
          type: 'llm',
          capabilities: ['chat', 'vision', 'image.understand', 'audio.understand'],
        }),
        'audio.understand',
      ),
    ).toBe(true);
  });
});
