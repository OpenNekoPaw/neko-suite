import { describe, expect, it } from 'vitest';
import type { MultimodalContextPacket } from '@neko/shared';
import { projectMultimodalPacketToChatMessage } from './multimodal-message-projection';

describe('multimodal-message-projection', () => {
  it('projects provider-neutral packets into platform chat content parts', () => {
    const packet: MultimodalContextPacket = {
      id: 'packet-1',
      selection: [],
      artifactRefs: [],
      projectRefs: [],
      perceptionInputs: [
        {
          id: 'input-text',
          kind: 'structured-data',
          modality: 'text',
          metadata: { text: 'describe this' },
        },
        {
          id: 'input-image',
          kind: 'image-file',
          modality: 'image',
          uri: 'data:image/png;base64,abc',
        },
        {
          id: 'input-video',
          kind: 'video-segment',
          modality: 'video',
          uri: '${WORKSPACE}/clip.mp4',
          metadata: { mimeType: 'video/mp4' },
        },
      ],
      uiContext: { activePanel: 'asset-browser', selectionIds: [] },
      createdAt: 1,
    };

    expect(projectMultimodalPacketToChatMessage(packet, { imageDetail: 'high' })).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'describe this' },
        { type: 'image', imageUrl: 'data:image/png;base64,abc', detail: 'high' },
        { type: 'video', videoUrl: '${WORKSPACE}/clip.mp4', mimeType: 'video/mp4' },
      ],
    });
  });
});
