import { describe, expect, it } from 'vitest';
import type { ChatModelOption } from '@neko/shared';
import { projectGenerationParamsBarState } from '../media-model-presenter';

const mediaModels: ChatModelOption[] = [
  {
    id: 'image-provider:model-image',
    label: 'Image Provider / Model Image',
    providerId: 'image-provider',
    modelId: 'model-image',
    category: 'image',
  },
  {
    id: 'video-provider:model-video',
    label: 'Video Provider / Model Video',
    providerId: 'video-provider',
    modelId: 'model-video',
    category: 'video',
  },
  {
    id: 'music-provider:model-music',
    label: 'Music Provider / Model Music',
    providerId: 'music-provider',
    modelId: 'model-music',
    category: 'audio',
    capabilities: ['audio.music.generate'],
  },
];

describe('media model presenter', () => {
  it('keeps generation model and params visible in agent mode without generation context', () => {
    const projection = projectGenerationParamsBarState({
      sessionMode: 'agent',
      generationCategory: 'image',
      mediaModelSelection: {
        image: 'image-provider:model-image',
        video: 'none',
        audio: 'none',
      },
      availableMediaModels: mediaModels,
      ambientNodeCount: 0,
      contextChips: [],
      manuallyExpanded: false,
    });

    expect(projection).toEqual(
      expect.objectContaining({
        category: 'image',
        selectedId: 'image-provider:model-image',
        hasModels: true,
        isAgentMode: true,
        showCategorySelector: true,
        showInlineMediaModelPicker: true,
        isExpanded: true,
        showManualCollapse: false,
      }),
    );
  });

  it('uses the session media category outside agent mode', () => {
    const projection = projectGenerationParamsBarState({
      sessionMode: 'video',
      generationCategory: 'image',
      mediaModelSelection: {
        image: 'image-provider:model-image',
        video: 'video-provider:model-video',
        audio: 'none',
      },
      availableMediaModels: mediaModels,
    });

    expect(projection).toEqual(
      expect.objectContaining({
        category: 'video',
        selectedId: 'video-provider:model-video',
        isAgentMode: false,
        showCategorySelector: false,
        showInlineMediaModelPicker: false,
        isExpanded: true,
      }),
    );
  });

  it('keeps music-capable models in the audio session category', () => {
    const projection = projectGenerationParamsBarState({
      sessionMode: 'audio',
      generationCategory: 'image',
      mediaModelSelection: {
        image: 'image-provider:model-image',
        video: 'video-provider:model-video',
        audio: 'music-provider:model-music',
      },
      availableMediaModels: mediaModels,
    });

    expect(projection).toEqual(
      expect.objectContaining({
        category: 'audio',
        selectedId: 'music-provider:model-music',
        isAgentMode: false,
        showCategorySelector: false,
        showInlineMediaModelPicker: false,
        isExpanded: true,
      }),
    );
  });
});
