import { afterEach, describe, expect, it, vi } from 'vitest';
import { EngineClient } from '../EngineClient';

function mockDispatchResponse(data: unknown): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ id: 'req-1', status: 'ok', data }),
  } as Response);
}

function lastDispatchBody(): Record<string, unknown> {
  const call = vi.mocked(globalThis.fetch).mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  const init = call[1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

describe('EngineClient perception facade', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delegates transcribe to the legacy models:transcribe action', async () => {
    mockDispatchResponse({
      text: 'hello world',
      segments: [{ start: 0, end: 1.2, text: 'hello world' }],
      language: 'en',
      durationSecs: 1.2,
    });
    const client = new EngineClient(7788);

    await expect(
      client.perception.transcribe({ model: 'whisper-small', audio: '/tmp/audio.wav' }),
    ).resolves.toEqual({
      text: 'hello world',
      segments: [{ start: 0, end: 1.2, text: 'hello world' }],
      language: 'en',
      durationSecs: 1.2,
    });

    expect(lastDispatchBody()).toEqual(
      expect.objectContaining({
        group: 'models',
        action: 'transcribe',
        options: { model: 'whisper-small', audio: '/tmp/audio.wav' },
      }),
    );
  });

  it('delegates similarity to the legacy models:clip action', async () => {
    mockDispatchResponse({ score: 0.82 });
    const client = new EngineClient(7788);

    await expect(
      client.perception.similarity({
        model: 'clip-vit-b32',
        image: '/tmp/frame.png',
        text: 'red umbrella',
      }),
    ).resolves.toBe(0.82);

    expect(lastDispatchBody()).toEqual(
      expect.objectContaining({
        group: 'models',
        action: 'clip',
        options: { model: 'clip-vit-b32', image: '/tmp/frame.png', text: 'red umbrella' },
      }),
    );
  });

  it('classifies by ranking labels through legacy models:clip similarity calls', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'req-1', status: 'ok', data: { score: 0.3 } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'req-2', status: 'ok', data: { score: 0.9 } }),
      } as Response);
    const client = new EngineClient(7788);

    await expect(
      client.perception.classify({
        model: 'clip-vit-b32',
        image: '/tmp/frame.png',
        labels: ['blue hair', 'red umbrella'],
      }),
    ).resolves.toEqual([
      { label: 'red umbrella', score: 0.9 },
      { label: 'blue hair', score: 0.3 },
    ]);

    const bodies = vi
      .mocked(globalThis.fetch)
      .mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)));
    expect(bodies).toEqual([
      expect.objectContaining({
        group: 'models',
        action: 'clip',
        options: { model: 'clip-vit-b32', image: '/tmp/frame.png', text: 'blue hair' },
      }),
      expect.objectContaining({
        group: 'models',
        action: 'clip',
        options: { model: 'clip-vit-b32', image: '/tmp/frame.png', text: 'red umbrella' },
      }),
    ]);
  });

  it('extracts audio segments through audios:segment', async () => {
    mockDispatchResponse({ data: 'BAUG' });
    const client = new EngineClient(7788);

    const result = await client.extractAudioSegment('/tmp/dialog.wav', 0.7, 1.25, {
      format: 'wav',
      sampleRate: 16_000,
      channels: 1,
    });

    expect(new Uint8Array(result ?? new ArrayBuffer(0))).toEqual(new Uint8Array([4, 5, 6]));
    expect(lastDispatchBody()).toEqual(
      expect.objectContaining({
        group: 'audios',
        action: 'segment',
        options: {
          source: '/tmp/dialog.wav',
          start: 0.7,
          duration: 1.25,
          format: 'wav',
          sampleRate: 16_000,
          channels: 1,
        },
      }),
    );
  });

  it('returns null when audio segment dispatch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'req-1', status: 'error', error: { message: 'segment failed' } }),
    } as Response);
    const client = new EngineClient(7788);

    await expect(client.extractAudioSegment('/tmp/dialog.wav', 0, 1)).resolves.toBeNull();
  });

  it('derives detectShots perception evidence from video keyframes', async () => {
    mockDispatchResponse({
      keyframes: [{ time: 0 }, { time: 2.5 }, { time: 5 }],
    });
    const client = new EngineClient(7788);

    await expect(client.perception.detectShots({ video: '/tmp/scene.mp4' })).resolves.toEqual([
      { index: 0, start: 0, end: 2.5, confidence: null },
      { index: 1, start: 2.5, end: 5, confidence: null },
      { index: 2, start: 5, end: null, confidence: null },
    ]);

    expect(lastDispatchBody()).toEqual(
      expect.objectContaining({
        group: 'videos',
        action: 'keyframes',
        options: { source: '/tmp/scene.mp4' },
      }),
    );
  });

  it('captures images through images:capture for perception input resolution', async () => {
    mockDispatchResponse({ data: 'AQID' });
    const client = new EngineClient(7788);

    const result = await client.captureImage('/tmp/reference.png', {
      quality: 90,
      format: 'png',
      width: 320,
      height: 180,
    });

    expect(new Uint8Array(result ?? new ArrayBuffer(0))).toEqual(new Uint8Array([1, 2, 3]));
    expect(lastDispatchBody()).toEqual(
      expect.objectContaining({
        group: 'images',
        action: 'capture',
        options: {
          source: '/tmp/reference.png',
          quality: 90,
          format: 'png',
          width: 320,
          height: 180,
        },
      }),
    );
  });

  it('returns null when image capture dispatch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'req-1', status: 'error', error: { message: 'capture failed' } }),
    } as Response);
    const client = new EngineClient(7788);

    await expect(client.captureImage('/tmp/reference.png')).resolves.toBeNull();
  });

  it('keeps legacy methods available while sharing the same dispatch path', async () => {
    mockDispatchResponse({ score: 0.5 });
    const client = new EngineClient(7788);

    await expect(client.clipScore('clip', '/tmp/image.png', 'cat')).resolves.toBe(0.5);

    expect(lastDispatchBody()).toEqual(
      expect.objectContaining({
        group: 'models',
        action: 'clip',
        options: { model: 'clip', image: '/tmp/image.png', text: 'cat' },
      }),
    );
  });
});
