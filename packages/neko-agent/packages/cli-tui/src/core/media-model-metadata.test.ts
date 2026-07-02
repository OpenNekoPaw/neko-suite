import { describe, expect, it } from 'vitest';
import { buildTuiMediaModelMetadata, mergeTuiMediaModelMetadata } from './media-model-metadata';

describe('TUI media model metadata', () => {
  it('normalizes default media model option ids into runtime provider/model refs', () => {
    expect(
      buildTuiMediaModelMetadata(
        {
          image: 'openai:gpt-image-1',
          video: 'runway/gen-4',
          audio: 'none',
        },
        'anthropic',
      ),
    ).toEqual({
      image: { providerId: 'openai', modelId: 'gpt-image-1' },
      video: { providerId: 'runway', modelId: 'gen-4' },
    });
  });

  it('uses the current chat provider for legacy bare media model ids', () => {
    expect(buildTuiMediaModelMetadata({ image: 'gpt-image-1' }, 'openai')).toEqual({
      image: { providerId: 'openai', modelId: 'gpt-image-1' },
    });
  });

  it('preserves existing execution metadata while injecting media models', () => {
    expect(
      mergeTuiMediaModelMetadata(
        {
          agentCreation: { entrySignal: 'prompt-chain-skill' },
          traceId: 'trace-1',
        },
        { image: 'openai:gpt-image-1' },
        'anthropic',
      ),
    ).toEqual({
      agentCreation: { entrySignal: 'prompt-chain-skill' },
      traceId: 'trace-1',
      mediaModels: {
        image: { providerId: 'openai', modelId: 'gpt-image-1' },
      },
    });
  });
});
