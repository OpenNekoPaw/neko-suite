import { describe, expect, it } from 'vitest';
import type { MultimodalContextPacket, PerceptionCard } from '@neko/shared';
import {
  projectMultimodalPacketToChatMessage,
  projectMultimodalPacketToChatMessageAsync,
  resolveProviderInputModalities,
} from './multimodal-message-projection';

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

  it('resolves provider input modalities by runtime, card, defaults, then text fallback', () => {
    expect(resolveProviderInputModalities({ providerId: 'openai' })).toMatchObject({
      text: true,
      image: true,
      video: false,
    });
    expect(
      resolveProviderInputModalities({
        providerId: 'unknown',
        providerCard: { inputModalities: { video: true } },
        runtime: { image: true },
      }),
    ).toEqual({ text: true, image: true, video: true, audio: false });
    expect(resolveProviderInputModalities({ providerId: 'unknown' })).toEqual({
      text: true,
      image: false,
      video: false,
      audio: false,
    });
  });

  it('async projection includes perception summary and image payload for image-capable providers', async () => {
    const loader = {
      load: async () => ({
        kind: 'image' as const,
        url: 'data:image/png;base64,thumb',
        mimeType: 'image/png',
      }),
    };

    const result = await projectMultimodalPacketToChatMessageAsync(emptyPacket(), {
      provider: { providerId: 'openai' },
      perceptionCards: [imageCard()],
      assetLoader: loader,
      imageDetail: 'high',
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.message.content).toEqual([
      expect.objectContaining({ type: 'text', text: expect.stringContaining('PerceptionCard') }),
      { type: 'image', imageUrl: 'data:image/png;base64,thumb', detail: 'high' },
    ]);
  });

  it('async projection falls back to text for text-only providers', async () => {
    const result = await projectMultimodalPacketToChatMessageAsync(emptyPacket(), {
      provider: { providerId: 'unknown' },
      perceptionCards: [imageCard()],
      assetLoader: {
        load: async () => {
          throw new Error('should not load');
        },
      },
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.message.content).toEqual([
      expect.objectContaining({ type: 'text', text: expect.stringContaining('PerceptionCard') }),
    ]);
  });

  it('records loader failure diagnostics while keeping text summary', async () => {
    const result = await projectMultimodalPacketToChatMessageAsync(emptyPacket(), {
      provider: { providerId: 'openai' },
      perceptionCards: [imageCard()],
      assetLoader: {
        load: async () => {
          throw new Error('cannot read asset');
        },
      },
    });

    expect(result.diagnostics).toEqual([
      { code: 'asset-load-failed', assetId: 'thumb-1', message: 'cannot read asset' },
    ]);
    expect(result.message.content).toEqual([
      expect.objectContaining({ type: 'text', text: expect.stringContaining('PerceptionCard') }),
    ]);
  });

  it('projects realtime-only audio as text fallback diagnostics', async () => {
    const result = await projectMultimodalPacketToChatMessageAsync(emptyPacket(), {
      provider: { runtime: { audio: 'realtime-only' } },
      perceptionCards: [audioCard()],
    });

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'unsupported-modality',
        assetId: 'audio-1',
      }),
    ]);
    expect(result.message.content).toEqual([
      expect.objectContaining({ type: 'text', text: expect.stringContaining('transcript') }),
    ]);
  });
});

function emptyPacket(): MultimodalContextPacket {
  return {
    id: 'packet-empty',
    selection: [],
    artifactRefs: [],
    projectRefs: [],
    perceptionInputs: [],
    uiContext: { activePanel: 'asset-browser', selectionIds: [] },
    createdAt: 1,
  };
}

function imageCard(): PerceptionCard {
  return {
    version: 1,
    assetId: 'asset-1',
    modality: 'image',
    createdAt: 1,
    layerStatus: { layer0: 'complete', layer1: 'complete', layer2: 'complete' },
    structural: { format: 'png', mimeType: 'image/png', byteSize: 10, width: 512, height: 512 },
    semantic: {
      evidences: [{ kind: 'description', confidence: 0.9, value: 'rainy street' }],
    },
    perceptual: {
      thumbnailRef: {
        assetId: 'thumb-1',
        uri: '${WORKSPACE}/thumb.png',
        mimeType: 'image/png',
      },
    },
  };
}

function audioCard(): PerceptionCard {
  return {
    version: 1,
    assetId: 'audio-1',
    modality: 'audio',
    createdAt: 1,
    layerStatus: { layer0: 'complete', layer1: 'complete', layer2: 'skipped' },
    structural: {
      format: 'wav',
      mimeType: 'audio/wav',
      byteSize: 10,
      durationMs: 1000,
      channels: 2,
    },
    semantic: {
      evidences: [{ kind: 'transcript', confidence: 0.8, value: 'hello' }],
    },
  };
}
