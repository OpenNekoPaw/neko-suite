import { describe, expect, it } from 'vitest';
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

describe('stream descriptor clients', () => {
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
