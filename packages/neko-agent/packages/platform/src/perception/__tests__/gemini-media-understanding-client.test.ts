import { describe, expect, it, vi } from 'vitest';
import type { IService, ModelCapability } from '@neko/shared';
import { GeminiMediaUnderstandingClient } from '../gemini-media-understanding-client';

describe('GeminiMediaUnderstandingClient', () => {
  it('loads image refs and returns structured image understanding evidence', async () => {
    const chat = vi.fn(async (_messages: Parameters<IService['chat']>[0]) => ({
      id: 'response-image',
      model: 'gemini-2.5-flash',
      message: {
        role: 'assistant' as const,
        content: JSON.stringify({
          summary: 'A clean noir-style still frame.',
          aestheticScore: 0.8,
          cinematicScore: 0.7,
          technicalQualityScore: 0.9,
          strengths: ['clear subject silhouette'],
          issues: ['slight highlight clipping'],
          recommendations: ['soften the practical light'],
          tags: ['noir', 'high-contrast'],
          notes: {
            aesthetic: 'The palette is cohesive.',
            cinematic: 'The frame reads as a tense insert.',
            technicalQuality: 'Focus and exposure are mostly strong.',
          },
        }),
      },
      finishReason: 'stop' as const,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    }));
    const service = createService(chat);
    const load = vi.fn(async () => ({
      kind: 'image' as const,
      url: 'data:image/png;base64,abc',
      mimeType: 'image/png',
    }));
    const client = new GeminiMediaUnderstandingClient({
      service,
      configManager: createConfigManager(['chat', 'vision']),
      assetLoader: { load },
      now: () => 100,
    });

    const evidence = await client.describe({
      asset: {
        assetId: 'image-1',
        modality: 'image',
        mimeType: 'image/png',
        width: 1280,
        height: 720,
        ref: {
          assetId: 'image-1',
          uri: '${WORKSPACE}/frame.png',
          mimeType: 'image/png',
        },
      },
      focus: 'composition',
    });

    expect(chat).toHaveBeenCalledWith(
      [
        {
          role: 'user',
          content: [
            expect.objectContaining({ type: 'text' }),
            { type: 'image', imageUrl: 'data:image/png;base64,abc', detail: 'high' },
          ],
        },
      ],
      expect.objectContaining({
        providerId: 'google',
        modelId: 'gemini-flash',
        modelCapabilities: ['chat', 'vision'],
        responseFormat: { type: 'json_object' },
      }),
    );
    expect(evidence).toEqual({
      kind: 'custom',
      confidence: 0.8,
      value: expect.objectContaining({
        schema: 'neko.image-understanding.v1',
        analyzedAt: 100,
        assetId: 'image-1',
        summary: 'A clean noir-style still frame.',
        cinematic: { score: 0.7, notes: 'The frame reads as a tense insert.' },
      }),
    });
  });

  it('uses per-request understanding model overrides without leaking routing metadata into the prompt', async () => {
    let promptText = '';
    const chat = vi.fn(async (messages: Parameters<IService['chat']>[0]) => {
      const firstMessage = messages[0];
      const firstContent = Array.isArray(firstMessage?.content)
        ? firstMessage.content[0]
        : undefined;
      promptText =
        typeof firstContent === 'object' &&
        firstContent !== null &&
        'text' in firstContent &&
        typeof firstContent.text === 'string'
          ? firstContent.text
          : '';
      return {
        id: 'response-image',
        model: 'gemini-image-pro',
        message: {
          role: 'assistant' as const,
          content: JSON.stringify({
            summary: 'A balanced production still.',
            aestheticScore: 0.8,
            cinematicScore: 0.7,
            technicalQualityScore: 0.9,
            strengths: ['controlled lighting'],
            issues: ['minor compression'],
            recommendations: ['export at a higher bitrate'],
            tags: ['cinematic'],
            notes: {
              aesthetic: 'The palette is cohesive.',
              cinematic: 'The frame has clear depth.',
              technicalQuality: 'Detail is mostly preserved.',
            },
          }),
        },
        finishReason: 'stop' as const,
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      };
    });
    const configManager = {
      resolveModelRefForPurpose: vi.fn(() => ({
        providerId: 'google',
        modelId: 'gemini-flash',
      })),
      getModel: vi.fn((modelId: string) => ({
        id: modelId,
        name: modelId,
        providerId: modelId === 'gemini-image-pro' ? 'google-pro' : 'google',
        type: 'llm' as const,
        capabilities: ['chat', 'vision'] satisfies ModelCapability[],
        enabled: true,
      })),
    };
    const client = new GeminiMediaUnderstandingClient({
      service: createService(chat),
      configManager,
      assetLoader: {
        load: async () => ({
          kind: 'image' as const,
          url: 'data:image/png;base64,abc',
          mimeType: 'image/png',
        }),
      },
    });

    await client.describe({
      asset: {
        assetId: 'image-1',
        modality: 'image',
        mimeType: 'image/png',
        ref: {
          assetId: 'image-1',
          uri: '${WORKSPACE}/frame.png',
          mimeType: 'image/png',
        },
      },
      options: {
        frameDensity: 'sparse',
        understandingModels: {
          image: { providerId: 'google-pro', modelId: 'gemini-image-pro' },
        },
      },
    });

    expect(configManager.resolveModelRefForPurpose).not.toHaveBeenCalled();
    expect(chat).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'text',
              text: expect.stringContaining('frameDensity'),
            }),
          ]),
        }),
      ]),
      expect.objectContaining({
        providerId: 'google-pro',
        modelId: 'gemini-image-pro',
      }),
    );
    expect(promptText).toContain('frameDensity');
    expect(promptText).not.toContain('understandingModels');
  });

  it('loads audio refs and returns structured audio understanding evidence', async () => {
    const chat = vi.fn(async () => ({
      id: 'response-audio',
      model: 'gemini-2.5-flash',
      message: {
        role: 'assistant' as const,
        content: JSON.stringify({
          summary: 'Dialogue is intelligible with low room tone.',
          transcript: 'We have to leave now.',
          speechClarityScore: 0.9,
          soundQualityScore: 0.7,
          mixQualityScore: 0.8,
          strengths: ['clear dialogue'],
          issues: ['minor HVAC noise'],
          recommendations: ['apply a light noise reduction pass'],
          tags: ['dialogue', 'interior'],
          notes: {
            speech: 'Words are easy to follow.',
            soundQuality: 'There is a small broadband noise bed.',
            mix: 'Dialogue sits above ambience.',
          },
        }),
      },
      finishReason: 'stop' as const,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    }));
    const service = createService(chat);
    const load = vi.fn(async () => ({
      kind: 'audio' as const,
      url: 'data:audio/wav;base64,abc',
      mimeType: 'audio/wav',
    }));
    const client = new GeminiMediaUnderstandingClient({
      service,
      configManager: createConfigManager(['chat', 'audio']),
      assetLoader: { load },
      now: () => 200,
    });

    const evidence = await client.transcribe({
      asset: {
        assetId: 'audio-1',
        modality: 'audio',
        mimeType: 'audio/wav',
        durationMs: 1200,
        channels: 2,
        sampleRate: 48000,
        ref: {
          assetId: 'audio-1',
          uri: '${WORKSPACE}/dialogue.wav',
          mimeType: 'audio/wav',
        },
      },
      focus: 'audio',
    });

    expect(chat).toHaveBeenCalledWith(
      [
        {
          role: 'user',
          content: [
            expect.objectContaining({ type: 'text' }),
            {
              type: 'audio',
              audioUrl: 'data:audio/wav;base64,abc',
              mimeType: 'audio/wav',
            },
          ],
        },
      ],
      expect.objectContaining({
        providerId: 'google',
        modelId: 'gemini-flash',
        modelCapabilities: ['chat', 'audio'],
        responseFormat: { type: 'json_object' },
      }),
    );
    expect(evidence).toEqual({
      kind: 'custom',
      confidence: 0.8,
      value: expect.objectContaining({
        schema: 'neko.audio-understanding.v1',
        analyzedAt: 200,
        assetId: 'audio-1',
        transcript: 'We have to leave now.',
        soundQuality: { score: 0.7, notes: 'There is a small broadband noise bed.' },
      }),
    });
  });

  it('fails visibly when the loaded asset kind does not match the request modality', async () => {
    const client = new GeminiMediaUnderstandingClient({
      service: createService(vi.fn()),
      configManager: createConfigManager(['chat', 'audio']),
      assetLoader: {
        load: async () => ({
          kind: 'image' as const,
          url: 'data:image/png;base64,abc',
          mimeType: 'image/png',
        }),
      },
    });

    await expect(
      client.transcribe({
        asset: {
          assetId: 'audio-1',
          modality: 'audio',
          mimeType: 'audio/wav',
          ref: {
            assetId: 'audio-1',
            uri: '${WORKSPACE}/dialogue.wav',
            mimeType: 'audio/wav',
          },
        },
      }),
    ).rejects.toThrow('Audio understanding expected an audio asset');
  });
});

function createService(chat: IService['chat']): IService {
  return {
    chat,
    chatStream: async function* () {},
    embed: async () => ({ embeddings: [] }),
  };
}

function createConfigManager(capabilities: readonly ModelCapability[]) {
  return {
    resolveModelRefForPurpose: vi.fn(() => ({
      providerId: 'google',
      modelId: 'gemini-flash',
    })),
    getModel: vi.fn(() => ({
      id: 'gemini-flash',
      name: 'gemini-2.5-flash',
      providerId: 'google',
      type: 'llm' as const,
      capabilities: [...capabilities],
      enabled: true,
    })),
  };
}
