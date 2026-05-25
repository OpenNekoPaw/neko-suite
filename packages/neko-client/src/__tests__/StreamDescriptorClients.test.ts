import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioStreamClient } from '../AudioStreamClient';
import { createRenderFrameMetaFromDescriptor, H264StreamClient } from '../H264StreamClient';
import type { AudioStreamDescriptor, RenderFrameMeta, RenderStreamDescriptor } from '@neko/shared';

const renderDescriptor: RenderStreamDescriptor = {
  streamId: 'scene-video',
  viewportId: 'main',
  container: 'h264-annexb',
  codecString: 'avc1.640028',
  frameHeader: 'neko-h264-v1',
  width: 1280,
  height: 720,
  fps: 30,
  colorSpace: 'srgb',
  bitDepth: 8,
  toneMapping: 'aces',
  initialRevision: 7,
};

const audioDescriptor: AudioStreamDescriptor = {
  streamId: 'scene-audio',
  codec: 'pcm-f32le',
  frameHeader: 'neko-pcm-v1',
  sampleRate: 48000,
  channels: 2,
};

type H264AvcBitstreamFormat = 'annexb' | 'avc';

type CapturedVideoDecoderConfig = VideoDecoderConfig & {
  avc?: {
    format: H264AvcBitstreamFormat;
  };
};

const supportDecoderConfigs: CapturedVideoDecoderConfig[] = [];
const configuredDecoderConfigs: CapturedVideoDecoderConfig[] = [];
const fakeWebSockets: FakeWebSocket[] = [];
const pendingFakeDecoderOutputs: Array<() => void> = [];
let fakeDecoderAutoOutput = true;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readAvcConfig(config: VideoDecoderConfig): CapturedVideoDecoderConfig['avc'] {
  if (!isRecord(config)) return undefined;
  const avc = config.avc;
  if (!isRecord(avc)) return undefined;
  const format = avc.format;
  return format === 'annexb' || format === 'avc' ? { format } : undefined;
}

function captureDecoderConfig(config: VideoDecoderConfig): CapturedVideoDecoderConfig {
  const avc = readAvcConfig(config);
  return avc ? { ...config, avc } : { ...config };
}

class FakeVideoDecoder {
  readonly decodeQueueSize = 0;
  ondequeue: ((this: VideoDecoder, ev: Event) => unknown) | null = null;
  state: CodecState = 'unconfigured';

  constructor(private readonly init: VideoDecoderInit) {}

  static isConfigSupported(config: VideoDecoderConfig): Promise<VideoDecoderSupport> {
    supportDecoderConfigs.push(captureDecoderConfig(config));
    return Promise.resolve({ supported: true, config });
  }

  configure(config: VideoDecoderConfig): void {
    configuredDecoderConfigs.push(captureDecoderConfig(config));
    this.state = 'configured';
  }

  close(): void {
    this.state = 'closed';
  }

  decode(chunk: EncodedVideoChunk): void {
    const output = () => {
      this.init.output({
        timestamp: chunk.timestamp,
        displayWidth: renderDescriptor.width,
        displayHeight: renderDescriptor.height,
        close: vi.fn(),
      } as unknown as VideoFrame);
    };
    if (fakeDecoderAutoOutput) {
      output();
    } else {
      pendingFakeDecoderOutputs.push(output);
    }
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }

  reset(): void {
    this.state = 'unconfigured';
  }

  addEventListener(): void {}

  removeEventListener(): void {}
}

class FakeWebSocket {
  binaryType: BinaryType = 'arraybuffer';
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;

  constructor(readonly url: string) {
    fakeWebSockets.push(this);
  }

  close(): void {
    this.onclose?.({ code: 1000 });
  }
}

class FakeEncodedVideoChunk {
  readonly timestamp: number;
  readonly duration?: number;

  constructor(init: EncodedVideoChunkInit) {
    this.timestamp = init.timestamp;
    this.duration = init.duration;
  }
}

class FakeGainNode {
  gain = {
    value: 1,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn((value: number) => {
      this.gain.value = value;
    }),
    linearRampToValueAtTime: vi.fn((value: number) => {
      this.gain.value = value;
    }),
  };
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeBufferSource {
  buffer: AudioBuffer | null = null;
  connect = vi.fn();
  start = vi.fn();
}

class FakeAudioContext {
  currentTime = 0;
  state: AudioContextState = 'running';
  close = vi.fn(() => {
    this.state = 'closed';
    return Promise.resolve();
  });
  resume = vi.fn(() => Promise.resolve());
  createGain = vi.fn(() => new FakeGainNode());
  createBufferSource = vi.fn(() => new FakeBufferSource());
  createBuffer = vi.fn();
  getOutputTimestamp = vi.fn(() => ({ contextTime: this.currentTime, performanceTime: 0 }));
}

describe('stream descriptor clients', () => {
  beforeEach(() => {
    supportDecoderConfigs.length = 0;
    configuredDecoderConfigs.length = 0;
    fakeWebSockets.length = 0;
    pendingFakeDecoderOutputs.length = 0;
    fakeDecoderAutoOutput = true;
    vi.stubGlobal('VideoDecoder', FakeVideoDecoder);
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.stubGlobal('EncodedVideoChunk', FakeEncodedVideoChunk);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts descriptor-driven raw H.264 scene streams', () => {
    expect(
      () =>
        new H264StreamClient({
          websocketUrl: 'ws://127.0.0.1:3000/v1/streams/scene-video',
          descriptor: renderDescriptor,
          width: 1,
          height: 1,
        }),
    ).not.toThrow();
  });

  it('rejects fMP4 descriptors for realtime 3D H.264 streams', () => {
    expect(
      () =>
        new H264StreamClient({
          websocketUrl: 'ws://127.0.0.1:3000/v1/streams/scene-video',
          descriptor: {
            ...renderDescriptor,
            container: 'fmp4',
            frameHeader: 'neko-fmp4-v1',
          } as unknown as RenderStreamDescriptor,
          width: 1280,
          height: 720,
        }),
    ).toThrow(/Unsupported 3D H\.264/);
  });

  it('passes Annex B H.264 packetization to WebCodecs for engine scene streams', async () => {
    const client = new H264StreamClient({
      websocketUrl: 'ws://127.0.0.1:3000/v1/streams/scene-video',
      descriptor: renderDescriptor,
      width: 1,
      height: 1,
    });

    await client.connect();

    expect(supportDecoderConfigs[0]).toMatchObject({
      codec: 'avc1.640028',
      avc: { format: 'annexb' },
    });
    expect(configuredDecoderConfigs[0]).toMatchObject({
      avc: { format: 'annexb' },
      optimizeForLatency: true,
    });

    client.dispose();
  });

  it('passes AVCC H.264 packetization to WebCodecs for AVCC descriptors', async () => {
    const client = new H264StreamClient({
      websocketUrl: 'ws://127.0.0.1:3000/v1/streams/scene-video',
      descriptor: {
        ...renderDescriptor,
        container: 'h264-avcc',
      },
      width: 1,
      height: 1,
    });

    await client.connect();

    expect(supportDecoderConfigs[0]).toMatchObject({
      codec: 'avc1.640028',
      avc: { format: 'avc' },
    });
    expect(configuredDecoderConfigs[0]).toMatchObject({
      avc: { format: 'avc' },
      optimizeForLatency: true,
    });

    client.dispose();
  });

  it('accepts PCM f32le audio descriptors', () => {
    expect(() => AudioStreamClient.validateDescriptor(audioDescriptor)).not.toThrow();
  });

  it('rejects non-PCM audio descriptors', () => {
    expect(() =>
      AudioStreamClient.validateDescriptor({
        ...audioDescriptor,
        codec: 'aac',
      } as unknown as AudioStreamDescriptor),
    ).toThrow(/Unsupported audio stream codec/);
  });

  it('does not close an externally owned AudioContext on dispose', async () => {
    const client = new AudioStreamClient({
      websocketUrl: 'ws://127.0.0.1:3000/v1/streams/scene-audio',
      descriptor: audioDescriptor,
    });
    const audioContext = new FakeAudioContext();

    await client.connect(audioContext as unknown as AudioContext);
    client.dispose();

    expect(audioContext.close).not.toHaveBeenCalled();
  });

  it('closes an internally owned AudioContext on dispose', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const client = new AudioStreamClient({
      websocketUrl: 'ws://127.0.0.1:3000/v1/streams/scene-audio',
      descriptor: audioDescriptor,
    });

    await client.connect();
    const audioContext = client.getAudioContext() as unknown as FakeAudioContext;
    client.dispose();

    expect(audioContext.close).toHaveBeenCalledOnce();
  });

  it('keeps media clock continuous when playback rate changes', async () => {
    const client = new AudioStreamClient({
      websocketUrl: 'ws://127.0.0.1:3000/v1/streams/scene-audio',
      descriptor: audioDescriptor,
    });
    const audioContext = new FakeAudioContext();

    await client.connect(audioContext as unknown as AudioContext);
    const clockState = client as unknown as {
      ptsOffset: number | null;
      clockAnchorCtxTime: number | null;
      clockAnchorPts: number | null;
    };
    clockState.ptsOffset = 0;
    clockState.clockAnchorCtxTime = 0;
    clockState.clockAnchorPts = 0;
    audioContext.currentTime = 1;

    expect(client.getCurrentTime()).toBe(1);

    client.setClockPlaybackRate(2);
    audioContext.currentTime = 1.5;

    expect(client.getCurrentTime()).toBe(2);
    client.dispose();
  });

  it('aligns render frame metadata from the descriptor and packet header', () => {
    expect(
      createRenderFrameMetaFromDescriptor(
        renderDescriptor,
        {
          pts: 33_333,
          duration: 33_333,
          isKeyframe: true,
        },
        4,
      ),
    ).toEqual({
      streamId: 'scene-video',
      sceneId: 'default',
      viewportId: 'main',
      frameId: 4,
      ptsUs: 33_333,
      durationUs: 33_333,
      isKeyframe: true,
      sceneRevision: 7,
      appliedSeq: 0,
      frameTimestamp: 33.333,
      viewTransform: [1, 0, 0, 1, 0, 0],
    });
  });

  it('uses descriptor scene id when present on compositor stream descriptors', () => {
    const liveDescriptor: RenderStreamDescriptor & { sceneId: string } = {
      ...renderDescriptor,
      sceneId: 'live-scene-main',
    };

    expect(
      createRenderFrameMetaFromDescriptor(
        liveDescriptor,
        {
          pts: 33_333,
          duration: 33_333,
          isKeyframe: true,
        },
        4,
      ).sceneId,
    ).toBe('live-scene-main');
  });

  it('carries active scene stream quality tier into frame diagnostics', () => {
    const meta = createRenderFrameMetaFromDescriptor(
      {
        ...renderDescriptor,
        qualityTier: 'auxiliary-reduced',
      },
      {
        pts: 66_666,
        duration: 33_333,
        isKeyframe: true,
      },
      5,
    );

    expect(meta.diagnostics?.qualityTier).toBe('auxiliary-reduced');
  });

  it('merges stream diagnostics text messages into decoded frame metadata', async () => {
    const metas: RenderFrameMeta[] = [];
    const frameMetas: RenderFrameMeta[] = [];
    const client = new H264StreamClient({
      websocketUrl: 'ws://127.0.0.1:3000/v1/streams/scene-video',
      descriptor: renderDescriptor,
      width: 1,
      height: 1,
      onFrameMeta: (meta) => metas.push(meta),
      onFrame: (_frame, meta) => {
        if (meta) {
          frameMetas.push(meta);
        }
      },
    });

    await client.connect();
    const socket = fakeWebSockets[0];
    expect(socket).toBeDefined();

    socket?.onmessage?.({
      data: JSON.stringify({
        type: 'renderFrameDiagnostics',
        ptsUs: 66_666,
        diagnostics: {
          renderPath: 'gpu-zero-copy',
          iosurfaceCreations: 2,
          textureAllocations: 3,
          renderTimeMs: 4.5,
          convertTimeMs: 1.2,
          encodeTimeMs: 0.9,
          queueDepth: 4,
        },
      }),
    });
    socket?.onmessage?.({ data: createH264Packet(66_666, 16_666, true) });

    expect(metas[0]?.diagnostics).toMatchObject({
      renderPath: 'gpu-zero-copy',
      iosurfaceCreations: 2,
      textureAllocations: 3,
      renderTimeMs: 4.5,
      convertTimeMs: 1.2,
      encodeTimeMs: 0.9,
      queueDepth: 0,
    });
    expect(metas[0]?.diagnostics?.decodeTimeMs).toBeTypeOf('number');
    expect(frameMetas[0]).toEqual(metas[0]);

    client.dispose();
  });

  it('aligns engine sideband render frame metadata with decoded compositor frames', async () => {
    const metas: RenderFrameMeta[] = [];
    const frameMetas: RenderFrameMeta[] = [];
    const client = new H264StreamClient({
      websocketUrl: 'ws://127.0.0.1:3000/v1/streams/live-video',
      descriptor: {
        ...renderDescriptor,
        streamId: 'live-video',
      },
      width: 1,
      height: 1,
      onFrameMeta: (meta) => metas.push(meta),
      onFrame: (_frame, meta) => {
        if (meta) {
          frameMetas.push(meta);
        }
      },
    });

    await client.connect();
    const socket = fakeWebSockets[0];
    expect(socket).toBeDefined();

    socket?.onmessage?.({
      data: JSON.stringify({
        type: 'renderFrameMeta',
        meta: {
          streamId: 'live-video',
          viewportId: 'viewport-live-main',
          frameId: 42,
          ptsUs: 99_999,
          durationUs: 33_333,
          isKeyframe: true,
          sceneRevision: 13,
          appliedSeq: 70,
          sceneId: 'live-scene-main',
          frameTimestamp: 99.999,
          viewTransform: [1, 0, 0, 1, 0, 0],
          projectionJson: '{"kind":"live-compositor"}',
          diagnostics: {
            renderPath: 'legacy-cpu',
            queueDepth: 1,
          },
        },
      }),
    });
    socket?.onmessage?.({ data: createH264Packet(99_999, 33_333, true) });

    expect(metas[0]).toMatchObject({
      streamId: 'live-video',
      viewportId: 'viewport-live-main',
      frameId: 42,
      ptsUs: 99_999,
      sceneRevision: 13,
      appliedSeq: 70,
      sceneId: 'live-scene-main',
      projectionJson: '{"kind":"live-compositor"}',
      diagnostics: {
        renderPath: 'legacy-cpu',
        queueDepth: 0,
      },
    });
    expect(frameMetas[0]).toEqual(metas[0]);

    client.dispose();
  });

  it('defaults sideband render metadata fields omitted by older engines', async () => {
    const metas: RenderFrameMeta[] = [];
    const client = new H264StreamClient({
      websocketUrl: 'ws://127.0.0.1:3000/v1/streams/live-video',
      descriptor: {
        ...renderDescriptor,
        streamId: 'live-video',
      },
      width: 1,
      height: 1,
      onFrameMeta: (meta) => metas.push(meta),
    });

    await client.connect();
    const socket = fakeWebSockets[0];

    socket?.onmessage?.({
      data: JSON.stringify({
        type: 'renderFrameMeta',
        meta: {
          streamId: 'live-video',
          viewportId: 'viewport-live-main',
          frameId: 43,
          ptsUs: 100_000,
          durationUs: 33_333,
          isKeyframe: true,
          sceneRevision: 14,
          appliedSeq: 71,
        },
      }),
    });
    socket?.onmessage?.({ data: createH264Packet(100_000, 33_333, true) });

    expect(metas[0]).toMatchObject({
      frameTimestamp: 100,
      viewTransform: [1, 0, 0, 1, 0, 0],
    });

    client.dispose();
  });

  it('reports delayed, ack-before-frame, and stale render metadata without stopping decode', async () => {
    let now = 1_000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    fakeDecoderAutoOutput = false;
    const diagnostics: string[] = [];
    const frames: Array<{ readonly timestamp: number; readonly hasMeta: boolean }> = [];
    const client = new H264StreamClient({
      websocketUrl: 'ws://127.0.0.1:3000/v1/streams/live-video',
      descriptor: {
        ...renderDescriptor,
        streamId: 'live-video',
      },
      width: 1,
      height: 1,
      metadataDelayBudgetMs: 25,
      onControlFlowDiagnostic: (diagnostic) => diagnostics.push(diagnostic.code),
      onFrame: (frame, meta) => {
        frames.push({ timestamp: frame.timestamp, hasMeta: meta !== undefined });
      },
    });

    await client.connect();
    const socket = fakeWebSockets[0];

    client.expectCompatibleFrameMeta({
      sceneId: 'live-scene-main',
      viewportId: 'viewport-live-main',
      streamId: 'live-video',
      revision: 14,
      appliedSeq: 71,
      seq: 71,
      correlationId: 'cmd-71',
    });

    now = 1_010;
    socket?.onmessage?.({ data: createH264Packet(120_000, 33_333, true) });
    expect(frames).toEqual([]);

    now = 1_050;
    socket?.onmessage?.({
      data: JSON.stringify({
        type: 'renderFrameMeta',
        meta: {
          streamId: 'live-video',
          sceneId: 'live-scene-main',
          viewportId: 'viewport-live-main',
          frameId: 44,
          ptsUs: 120_000,
          durationUs: 33_333,
          isKeyframe: true,
          sceneRevision: 13,
          appliedSeq: 70,
        },
      }),
    });
    now = 1_060;
    pendingFakeDecoderOutputs.shift()?.();

    expect(frames).toEqual([{ timestamp: 120_000, hasMeta: true }]);
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        'render-frame-meta-ack-before-frame',
        'render-frame-meta-delayed',
        'render-frame-meta-stale',
      ]),
    );

    client.dispose();
  });

  it('reports missing metadata while still delivering decoded video frames', async () => {
    const diagnostics: string[] = [];
    const frames: number[] = [];
    const client = new H264StreamClient({
      websocketUrl: 'ws://127.0.0.1:3000/v1/streams/raw-video',
      width: 1,
      height: 1,
      codecString: 'avc1.640028',
      onControlFlowDiagnostic: (diagnostic) => diagnostics.push(diagnostic.code),
      onFrame: (frame, meta) => {
        frames.push(frame.timestamp);
        expect(meta).toBeUndefined();
      },
    });

    await client.connect();
    const socket = fakeWebSockets[0];
    socket?.onmessage?.({ data: createH264Packet(140_000, 33_333, true) });

    expect(frames).toEqual([140_000]);
    expect(diagnostics).toContain('render-frame-meta-missing');

    client.dispose();
  });
});

function createH264Packet(ptsUs: number, durationUs: number, isKeyframe: boolean): ArrayBuffer {
  const data = new ArrayBuffer(25 + 4);
  const view = new DataView(data);
  view.setBigInt64(0, BigInt(ptsUs), true);
  view.setBigInt64(8, BigInt(ptsUs), true);
  view.setUint8(16, isKeyframe ? 1 : 0);
  view.setBigInt64(17, BigInt(durationUs), true);
  return data;
}
