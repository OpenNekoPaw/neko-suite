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
});
