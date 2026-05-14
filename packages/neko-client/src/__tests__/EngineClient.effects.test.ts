import { afterEach, describe, expect, it, vi } from 'vitest';
import { EngineClient } from '../EngineClient';
import { sourceReplacementToElementPatch } from '../engine/sourceReplacement';

function mockDispatchResponse(data: unknown): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ id: 'req-1', status: 'ok', data }),
  } as Response);
}

function lastDispatchBody(): Record<string, unknown> {
  const calls = vi.mocked(globalThis.fetch).mock.calls;
  const call = calls[calls.length - 1];
  if (!call) {
    throw new Error('fetch was not called');
  }
  const init = call[1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

describe('EngineClient effect discovery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dispatches effects:list-capabilities', async () => {
    mockDispatchResponse([
      {
        id: 'gaussian-blur',
        kind: 'shader',
        source: 'built-in',
        name: 'Gaussian Blur',
        gpuAccelerated: true,
        params: [],
      },
    ]);
    const client = new EngineClient(7788);

    await expect(client.listEffectCapabilities()).resolves.toEqual([
      {
        id: 'gaussian-blur',
        kind: 'shader',
        source: 'built-in',
        name: 'Gaussian Blur',
        gpuAccelerated: true,
        params: [],
      },
    ]);
    expect(lastDispatchBody()).toEqual(
      expect.objectContaining({
        group: 'effects',
        action: 'list-capabilities',
        options: {},
      }),
    );
  });

  it('dispatches models:preprocess and exposes source replacement metadata', async () => {
    mockDispatchResponse({
      operation: 'denoise',
      input: '/tmp/input.png',
      output: '/tmp/output.png',
      sourceReplacement: {
        trackId: 'track-1',
        elementId: 'clip-1',
        src: '/tmp/output.png',
        resourceId: 'asset-1',
      },
    });
    const client = new EngineClient(7788);

    const result = await client.preprocessModelSource({
      operation: 'denoise',
      model: 'denoise-v1',
      input: '/tmp/input.png',
      output: '/tmp/output.png',
      trackId: 'track-1',
      clipId: 'clip-1',
      strength: 0.35,
    });

    expect(lastDispatchBody()).toEqual(
      expect.objectContaining({
        group: 'models',
        action: 'preprocess',
        options: {
          operation: 'denoise',
          model: 'denoise-v1',
          input: '/tmp/input.png',
          output: '/tmp/output.png',
          trackId: 'track-1',
          clipId: 'clip-1',
          strength: 0.35,
        },
      }),
    );
    expect(sourceReplacementToElementPatch(result.sourceReplacement)).toEqual({
      src: '/tmp/output.png',
      resourceId: 'asset-1',
    });
  });

  it('builds puppet H.264 stream URLs and export requests', async () => {
    mockDispatchResponse({ frames_submitted: 12 });
    const client = new EngineClient(7788);

    expect(
      client.getPuppetStreamWsUrl({
        format: 'h264',
        width: 640,
        height: 360,
        fps: 30,
        bitrate: 1_500_000,
      }),
    ).toBe(
      'ws://127.0.0.1:7788/v1/puppets/stream?format=h264&width=640&height=360&fps=30&bitrate=1500000',
    );
    expect(client.openPuppetStream().url).toBe('ws://127.0.0.1:7788/v1/puppets/stream');
    expect(client.createPuppetH264StreamHandle({ width: 320, height: 240 })).toEqual({
      wsUrl: 'ws://127.0.0.1:7788/v1/puppets/stream?format=h264&width=320&height=240',
      width: 320,
      height: 240,
      fps: 60,
      codecString: 'avc1.42001f',
    });

    await expect(
      client.exportPuppetH264({
        outputPath: '/tmp/puppet.mp4',
        width: 640,
        height: 360,
        fps: 30,
        durationMs: 400,
        bitrate: 1_500_000,
        gopSize: 30,
      }),
    ).resolves.toEqual({ framesSubmitted: 12 });
    expect(lastDispatchBody()).toEqual(
      expect.objectContaining({
        group: 'puppets',
        action: 'export_h264',
        options: {
          output_path: '/tmp/puppet.mp4',
          width: 640,
          height: 360,
          fps: 30,
          duration_ms: 400,
          bitrate: 1_500_000,
          gop_size: 30,
        },
      }),
    );
  });
});
