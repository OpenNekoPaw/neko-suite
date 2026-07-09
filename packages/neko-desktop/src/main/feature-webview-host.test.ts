import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleRawDesktopFeatureWebviewMessage } from './feature-webview-host';
import type { ActionResponse } from '@neko/neko-client';
import type { DesktopCutMediaEngineClient } from './cut-media-host';
import { createDesktopProjectFileIoAdapter } from './project-file-io';

let tempRoot: string | undefined;

describe('desktop feature Webview host', () => {
  afterEach(async () => {
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
      tempRoot = undefined;
    }
  });

  it('loads Canvas documents from the active workspace file on ready', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'neko-desktop-feature-host-'));
    await writeFile(
      join(tempRoot, 'board.nkc'),
      JSON.stringify({
        version: '1.0',
        name: 'Opening Board',
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        nodes: [],
        connections: [],
      }),
    );

    const result = await handleRawDesktopFeatureWebviewMessage(
      {
        runtimeId: '@neko-canvas/webview/root',
        panelKind: 'canvas-workbench',
        relativePath: 'board.nkc',
        message: { type: 'ready' },
      },
      createDeps(tempRoot),
    );

    expect(result.messages).toEqual([
      {
        type: 'canvas.hostAppliedDocument',
        data: expect.objectContaining({ name: 'Opening Board' }),
      },
    ]);
  });

  it('loads Audio projects through the package-owned project:init message', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'neko-desktop-feature-host-'));
    await writeFile(
      join(tempRoot, 'song.nka'),
      JSON.stringify({
        version: '2.0',
        name: 'Song',
        sampleRate: 48000,
        channels: 2,
        tracks: [],
        masterEffectsChain: [],
        markers: [],
      }),
    );

    const result = await handleRawDesktopFeatureWebviewMessage(
      {
        runtimeId: '@neko-audio/webview/root',
        panelKind: 'audio-timeline',
        relativePath: 'song.nka',
        message: { type: 'ready' },
      },
      createDeps(tempRoot),
    );

    expect(result.messages).toEqual([
      {
        type: 'project:init',
        payload: {
          projectData: expect.objectContaining({ name: 'Song' }),
          waveforms: {},
        },
      },
    ]);
  });

  it('returns enginePort only when the local engine probe is reachable', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'neko-desktop-feature-host-'));
    const probeEngineConnection = vi.fn(async () => ({
      port: 4567,
      reachable: true,
      diagnostic: 'ok',
    }));

    const result = await handleRawDesktopFeatureWebviewMessage(
      {
        runtimeId: '@neko-model/webview/root',
        panelKind: 'model-viewport',
        relativePath: 'hero.nkm',
        message: { type: 'requestEnginePort' },
      },
      createDeps(tempRoot, probeEngineConnection),
    );

    expect(probeEngineConnection).toHaveBeenCalledTimes(1);
    expect(result.messages).toEqual([{ type: 'enginePort', port: 4567 }]);
  });

  it('reports unsupported feature routes visibly', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'neko-desktop-feature-host-'));

    const result = await handleRawDesktopFeatureWebviewMessage(
      {
        runtimeId: '@neko-canvas/webview/root',
        panelKind: 'canvas-workbench',
        relativePath: 'board.nkc',
        message: { type: 'sendToAgent' },
      },
      createDeps(tempRoot),
    );

    expect(result.messages).toEqual([
      {
        type: 'desktopFeatureDiagnostic',
        diagnostic: expect.objectContaining({
          code: 'unsupported-feature-webview-route',
          route: 'sendToAgent',
        }),
      },
    ]);
  });

  it('routes Cut media probe requests through the Desktop engine client', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'neko-desktop-feature-host-'));
    await writeFile(join(tempRoot, 'media.mp4'), 'placeholder');
    await writeFile(join(tempRoot, 'edit.nkv'), JSON.stringify({ tracks: [] }));
    const engineClient = createMockCutMediaEngineClient();

    const result = await handleRawDesktopFeatureWebviewMessage(
      {
        runtimeId: '@neko/webview/root',
        panelKind: 'cut-timeline',
        relativePath: 'edit.nkv',
        message: {
          type: 'media:probeMediaInfo',
          requestId: 'probe-1',
          payload: { videoPath: 'media.mp4' },
        },
      },
      createDeps(
        tempRoot,
        vi.fn(async () => ({
          port: 4567,
          reachable: true,
          diagnostic: 'ok',
        })),
        () => engineClient,
      ),
    );

    expect(engineClient.probe).toHaveBeenCalledWith('videos', join(tempRoot, 'media.mp4'));
    expect(result.messages).toEqual([
      {
        type: 'media:response:probeMediaInfo',
        requestId: 'probe-1',
        payload: expect.objectContaining({
          duration: 12,
          width: 1920,
          height: 1080,
          hasAudio: true,
          hasSubtitles: false,
        }),
      },
    ]);
  });

  it('returns Cut media errors on the original media response channel when engine is unavailable', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'neko-desktop-feature-host-'));
    await writeFile(join(tempRoot, 'edit.nkv'), JSON.stringify({ tracks: [] }));

    const result = await handleRawDesktopFeatureWebviewMessage(
      {
        runtimeId: '@neko/webview/root',
        panelKind: 'cut-timeline',
        relativePath: 'edit.nkv',
        message: {
          type: 'media:getWaveform',
          requestId: 'waveform-1',
          payload: { filePath: 'media.mp4' },
        },
      },
      createDeps(
        tempRoot,
        vi.fn(async () => ({
          port: 8765,
          reachable: false,
          diagnostic: 'engine unavailable',
        })),
      ),
    );

    expect(result.messages).toEqual([
      {
        type: 'media:response:getWaveform',
        requestId: 'waveform-1',
        error: 'engine unavailable',
      },
    ]);
  });
});

function createDeps(
  workspaceRoot: string,
  probeEngineConnection = vi.fn(async () => ({
    port: 8765,
    reachable: false,
    diagnostic: 'engine unavailable',
  })),
  createEngineClient?: (port: number) => DesktopCutMediaEngineClient,
) {
  return {
    getProjectFileIo: () => createDesktopProjectFileIoAdapter({ workspaceRoot }),
    probeEngineConnection,
    ...(createEngineClient ? { createEngineClient } : {}),
  };
}

function createMockCutMediaEngineClient(): DesktopCutMediaEngineClient & {
  readonly probe: ReturnType<typeof vi.fn>;
} {
  const captureResponse: ActionResponse = {
    id: 'capture',
    status: 'ok',
    data: { data: 'jpeg-base64' },
    error: null,
  };
  return {
    port: 4567,
    dispatch: vi.fn(async () => captureResponse),
    probe: vi.fn(async () => ({
      duration: 12,
      width: 1920,
      height: 1080,
      fps: 24,
      codec: 'h264',
      format: 'mp4',
      bitrate: 1_000_000,
      hasAudio: true,
      audioCodec: 'aac',
      audioSampleRate: 48_000,
      audioChannels: 2,
      audioBitrate: 128_000,
    })),
    waveform: vi.fn(async () => ({
      peaks: [0.1, 0.2],
      channelPeaks: [[0.1, 0.2]],
      sampleRate: 48_000,
      channels: 1,
      duration: 12,
      peaksPerSecond: 100,
    })),
  };
}
