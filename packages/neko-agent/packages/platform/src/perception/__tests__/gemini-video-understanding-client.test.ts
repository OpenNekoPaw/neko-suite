import { describe, expect, it, vi } from 'vitest';
import type { IService } from '@neko/shared';
import { GeminiVideoUnderstandingClient } from '../gemini-video-understanding-client';

describe('GeminiVideoUnderstandingClient', () => {
  it('loads video refs and returns structured custom perception evidence', async () => {
    const chat = vi.fn(async () => ({
      id: 'response-1',
      model: 'gemini-2.5-flash',
      message: {
        role: 'assistant' as const,
        content: JSON.stringify({
          summary: 'A moody handheld hallway shot.',
          aestheticScore: 0.8,
          cinematicScore: 0.7,
          technicalQualityScore: 0.6,
          strengths: ['strong contrast'],
          issues: ['minor compression'],
          recommendations: ['stabilize the push-in'],
          tags: ['handheld', 'low-key'],
          notes: {
            aesthetic: 'Cohesive cool palette.',
            cinematic: 'Readable movement and blocking.',
            technicalQuality: 'Slight softness in motion.',
          },
        }),
      },
      finishReason: 'stop' as const,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    }));
    const service: IService = {
      chat,
      chatStream: async function* () {},
      embed: async () => ({ embeddings: [] }),
    };
    const load = vi.fn(async () => ({
      kind: 'video' as const,
      url: 'data:video/mp4;base64,abc',
      mimeType: 'video/mp4',
    }));
    const client = new GeminiVideoUnderstandingClient({
      service,
      configManager: {
        resolveModelRefForPurpose: vi.fn(() => ({
          providerId: 'google',
          modelId: 'gemini-flash',
        })),
        getModel: vi.fn(() => ({
          id: 'gemini-flash',
          name: 'gemini-2.5-flash',
          providerId: 'google',
          type: 'llm' as const,
          capabilities: ['chat', 'vision_video'],
          enabled: true,
        })),
      },
      assetLoader: { load },
      now: () => 42,
    });

    const evidence = await client.describe({
      asset: {
        assetId: 'video-1',
        modality: 'video',
        mimeType: 'video/mp4',
        width: 1920,
        height: 1080,
        durationMs: 2000,
        ref: {
          assetId: 'video-1',
          uri: '${WORKSPACE}/scene.mp4',
          mimeType: 'video/mp4',
        },
      },
      focus: 'composition',
    });

    expect(load).toHaveBeenCalledWith({
      assetId: 'video-1',
      uri: '${WORKSPACE}/scene.mp4',
      mimeType: 'video/mp4',
    });
    expect(chat).toHaveBeenCalledWith(
      [
        {
          role: 'user',
          content: [
            expect.objectContaining({
              type: 'text',
              text: expect.stringContaining('Focus: composition.'),
            }),
            {
              type: 'video',
              videoUrl: 'data:video/mp4;base64,abc',
              mimeType: 'video/mp4',
            },
          ],
        },
      ],
      expect.objectContaining({
        providerId: 'google',
        modelId: 'gemini-flash',
        modelCapabilities: ['chat', 'vision_video'],
        responseFormat: { type: 'json_object' },
      }),
    );
    expect(evidence).toEqual({
      kind: 'custom',
      confidence: 0.7,
      value: expect.objectContaining({
        schema: 'neko.video-understanding.v1',
        providerId: 'google',
        modelId: 'gemini-flash',
        analyzedAt: 42,
        assetId: 'video-1',
        summary: 'A moody handheld hallway shot.',
        aesthetic: { score: 0.8, notes: 'Cohesive cool palette.' },
        cinematic: { score: 0.7, notes: 'Readable movement and blocking.' },
        technicalQuality: { score: 0.6, notes: 'Slight softness in motion.' },
      }),
    });
  });

  it('fails visibly when no video understanding model is configured', async () => {
    const client = new GeminiVideoUnderstandingClient({
      service: {
        chat: async () => {
          throw new Error('should not call service');
        },
        chatStream: async function* () {},
        embed: async () => ({ embeddings: [] }),
      },
      configManager: {
        resolveModelRefForPurpose: () => undefined,
        getModel: () => undefined,
      },
      assetLoader: {
        load: async () => {
          throw new Error('should not load asset');
        },
      },
    });

    await expect(
      client.describe({
        asset: {
          assetId: 'video-1',
          modality: 'video',
          mimeType: 'video/mp4',
          ref: {
            assetId: 'video-1',
            uri: '${WORKSPACE}/scene.mp4',
            mimeType: 'video/mp4',
          },
        },
      }),
    ).rejects.toThrow('No enabled model supports video.understand');
  });
});
