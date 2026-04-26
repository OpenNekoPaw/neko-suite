import { describe, expect, it, vi } from 'vitest';
import type { MultimodalContextPacket } from '@neko/shared';
import {
  resolveTimelinePerceptionInputs,
  resolveTimelineVideoFrameInputs,
} from './perceptionInputResolver';

function createPacket(): MultimodalContextPacket {
  return {
    id: 'ctx-timeline-test',
    selection: [],
    artifactRefs: [],
    projectRefs: [],
    perceptionInputs: [
      {
        id: 'input-timeline-clip-3',
        kind: 'video-frame',
        modality: 'image',
        uri: '${PROJECT}/shots/shot-3.mp4',
        timeMs: 1_200,
        metadata: {
          startMs: 1_000,
          sourceInMs: 300,
        },
      },
      {
        id: 'input-audio-1',
        kind: 'audio-segment',
        modality: 'audio',
        uri: '${PROJECT}/audio/dialog.wav',
        rangeStartMs: 1_500,
        rangeEndMs: 2_750,
        metadata: {
          startMs: 1_000,
          sourceInMs: 200,
        },
      },
    ],
    uiContext: { activePanel: 'timeline', selectionIds: [] },
    createdAt: 1,
  };
}

describe('resolveTimelineVideoFrameInputs', () => {
  it('extracts timeline video-frame inputs to project cache image files', async () => {
    const extractFrame = vi.fn(async () => new Uint8Array([1, 2, 3]).buffer);
    const mkdir = vi.fn(async () => undefined);
    const writeFile = vi.fn(async () => undefined);

    const packet = await resolveTimelineVideoFrameInputs(createPacket(), {
      engineClient: { extractFrame },
      workspaceRoot: '/workspace/project',
      fsOps: { mkdir, writeFile },
      cacheDir: '.neko/.cache/perception-test',
      imageFormat: 'png',
      quality: 90,
    });

    expect(extractFrame).toHaveBeenCalledWith('/workspace/project/shots/shot-3.mp4', 0.5, {
      quality: 90,
      format: 'png',
    });
    expect(mkdir).toHaveBeenCalledWith('/workspace/project/.neko/.cache/perception-test', {
      recursive: true,
    });
    expect(writeFile).toHaveBeenCalledWith(
      '/workspace/project/.neko/.cache/perception-test/input-timeline-clip-3-500.png',
      new Uint8Array([1, 2, 3]),
    );
    expect(packet.perceptionInputs[0]).toEqual(
      expect.objectContaining({
        id: 'input-timeline-clip-3',
        kind: 'image-file',
        uri: '${PROJECT}/.neko/.cache/perception-test/input-timeline-clip-3-500.png',
        metadata: expect.objectContaining({
          resolvedFromInputId: 'input-timeline-clip-3',
          resolvedSourceUri: '${PROJECT}/shots/shot-3.mp4',
          resolvedSourceTimeMs: 500,
        }),
      }),
    );
    expect(packet.perceptionInputs[1]?.kind).toBe('audio-segment');
  });

  it('extracts timeline audio-segment inputs when the engine client supports it', async () => {
    const extractFrame = vi.fn(async () => null);
    const extractAudioSegment = vi.fn(async () => new Uint8Array([4, 5, 6]).buffer);
    const mkdir = vi.fn(async () => undefined);
    const writeFile = vi.fn(async () => undefined);

    const packet = await resolveTimelinePerceptionInputs(createPacket(), {
      engineClient: { extractFrame, extractAudioSegment },
      workspaceRoot: '/workspace/project',
      fsOps: { mkdir, writeFile },
      cacheDir: '.neko/.cache/perception-test',
      audioFormat: 'wav',
      audioSampleRate: 16_000,
      audioChannels: 1,
    });

    expect(extractAudioSegment).toHaveBeenCalledWith(
      '/workspace/project/audio/dialog.wav',
      0.7,
      1.25,
      { format: 'wav', sampleRate: 16_000, channels: 1 },
    );
    expect(writeFile).toHaveBeenCalledWith(
      '/workspace/project/.neko/.cache/perception-test/input-audio-1-700-1250.wav',
      new Uint8Array([4, 5, 6]),
    );
    expect(packet.perceptionInputs[1]).toEqual(
      expect.objectContaining({
        id: 'input-audio-1',
        kind: 'audio-segment',
        uri: '${PROJECT}/.neko/.cache/perception-test/input-audio-1-700-1250.wav',
        metadata: expect.objectContaining({
          resolvedFromInputId: 'input-audio-1',
          resolvedSourceUri: '${PROJECT}/audio/dialog.wav',
          resolvedSourceStartMs: 700,
          resolvedSourceDurationMs: 1250,
        }),
      }),
    );
  });

  it('keeps audio-segment input unchanged when extraction is unavailable', async () => {
    const original = createPacket();
    const packet = await resolveTimelinePerceptionInputs(original, {
      engineClient: { extractFrame: vi.fn(async () => null) },
      workspaceRoot: '/workspace/project',
      fsOps: {
        mkdir: vi.fn(async () => undefined),
        writeFile: vi.fn(async () => undefined),
      },
    });

    expect(packet.perceptionInputs[1]).toEqual(original.perceptionInputs[1]);
  });

  it('resolves canvas-crop inputs with optional image capture support', async () => {
    const captureImage = vi.fn(async () => new Uint8Array([7, 8, 9]).buffer);
    const mkdir = vi.fn(async () => undefined);
    const writeFile = vi.fn(async () => undefined);
    const packet: MultimodalContextPacket = {
      id: 'ctx-canvas-test',
      selection: [],
      artifactRefs: [],
      projectRefs: [],
      perceptionInputs: [
        {
          id: 'input-canvas-node-1',
          kind: 'canvas-crop',
          modality: 'image',
          uri: '${PROJECT}/refs/reference.png',
          metadata: {
            bounds: { x: 10, y: 20, width: 320, height: 180 },
          },
        },
      ],
      uiContext: { activePanel: 'canvas', selectionIds: [] },
      createdAt: 1,
    };

    const resolved = await resolveTimelinePerceptionInputs(packet, {
      engineClient: { extractFrame: vi.fn(async () => null), captureImage },
      workspaceRoot: '/workspace/project',
      fsOps: { mkdir, writeFile },
      cacheDir: '.neko/.cache/perception-test',
      imageFormat: 'png',
      quality: 90,
    });

    expect(captureImage).toHaveBeenCalledWith('/workspace/project/refs/reference.png', {
      quality: 90,
      format: 'png',
      width: 320,
      height: 180,
    });
    expect(writeFile).toHaveBeenCalledWith(
      '/workspace/project/.neko/.cache/perception-test/input-canvas-node-1-canvas-crop.png',
      new Uint8Array([7, 8, 9]),
    );
    expect(resolved.perceptionInputs[0]).toEqual(
      expect.objectContaining({
        kind: 'image-file',
        uri: '${PROJECT}/.neko/.cache/perception-test/input-canvas-node-1-canvas-crop.png',
        metadata: expect.objectContaining({
          resolvedFromInputId: 'input-canvas-node-1',
          resolvedInputKind: 'canvas-crop',
          resolvedCropBounds: { x: 10, y: 20, width: 320, height: 180 },
        }),
      }),
    );
  });

  it('keeps video-frame input unchanged when extraction fails', async () => {
    const original = createPacket();
    const packet = await resolveTimelineVideoFrameInputs(original, {
      engineClient: { extractFrame: vi.fn(async () => null) },
      workspaceRoot: '/workspace/project',
      fsOps: {
        mkdir: vi.fn(async () => undefined),
        writeFile: vi.fn(async () => undefined),
      },
    });

    expect(packet.perceptionInputs[0]).toEqual(original.perceptionInputs[0]);
  });
});
