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
        {
          id: 'input-audio',
          kind: 'audio-segment',
          modality: 'audio',
          uri: '${WORKSPACE}/voice.wav',
          metadata: { mimeType: 'audio/wav', durationMs: 1200 },
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
        {
          type: 'text',
          text: 'Audio context: input-audio uri=${WORKSPACE}/voice.wav mimeType=audio/wav durationMs=1200',
        },
      ],
    });
  });

  it('projects compact feedback evidence summaries without raw payloads', () => {
    const packet: MultimodalContextPacket = {
      id: 'packet-1',
      selection: [],
      artifactRefs: [],
      projectRefs: [],
      perceptionInputs: [],
      uiContext: { activePanel: 'asset-browser', selectionIds: [] },
      createdAt: 1,
      metadata: {
        evidenceRefs: [
          {
            id: 'evidence-image',
            source: 'tool',
            modality: 'image',
            summary: 'Generated style frame',
            artifactId: 'generated-image',
          },
          {
            id: 'evidence-video',
            source: 'engine',
            modality: 'video',
            summary: 'Motion score',
            withheld: true,
            withheldReason: 'ablation',
          },
        ],
      },
    };

    expect(projectMultimodalPacketToChatMessage(packet)).toEqual({
      role: 'user',
      content: [
        {
          type: 'text',
          text:
            'Included feedback evidence: evidence-image [image] Generated style frame\n' +
            'Withheld feedback evidence: evidence-video [video] Motion score (ablation)',
        },
      ],
    });
  });
});
