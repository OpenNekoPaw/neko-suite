import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioStreamClient } from '../AudioStreamClient';
import { createRenderFrameMetaFromDescriptor, H264StreamClient } from '../H264StreamClient';
import type { AudioStreamDescriptor, RenderStreamDescriptor } from '@neko/shared';

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

  constructor(_init: VideoDecoderInit) {}

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

  decode(_chunk: EncodedVideoChunk): void {}

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

  constructor(readonly url: string) {}

  close(): void {
    this.onclose?.({ code: 1000 });
  }
}

describe('stream descriptor clients', () => {
  beforeEach(() => {
    supportDecoderConfigs.length = 0;
    configuredDecoderConfigs.length = 0;
    vi.stubGlobal('VideoDecoder', FakeVideoDecoder);
    vi.stubGlobal('WebSocket', FakeWebSocket);
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
      viewportId: 'main',
      frameId: 4,
      ptsUs: 33_333,
      durationUs: 33_333,
      isKeyframe: true,
      sceneRevision: 7,
      appliedSeq: 0,
    });
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
});
