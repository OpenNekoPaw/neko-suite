import { describe, expect, it, vi } from 'vitest';
import type { ViewportEvent } from '@neko/shared';
import { LIVE_COMPOSITOR_COMMAND_ACTIONS } from '@neko/shared';
import { LiveController } from './LiveController';
import {
  LIVE_COMPOSITOR_VIEWPORT_ID,
  createDefaultLiveCompositorScene,
} from './liveCompositorScene';
import { selectLiveVisualPath } from './liveVisualPath';

describe('LiveController', () => {
  it('sends live preset changes as scene:live ViewportProtocol commands', async () => {
    const scene = createDefaultLiveCompositorScene({ now: 1000 });
    const client = {
      dispatchViewportCommand: vi.fn(async (command) =>
        event({
          event: `${command.action}:ack`,
          ackSeq: command.seq,
          appliedSeq: command.seq,
          revision: 1,
          payload: { activePresetId: 'preset-clean' },
        }),
      ),
    };
    const onSceneChange = vi.fn();
    const controller = new LiveController(
      {
        enginePort: 1234,
        scene,
        viewportId: LIVE_COMPOSITOR_VIEWPORT_ID,
        onSceneChange,
      },
      client,
    );

    await controller.setPreset('preset-clean');

    expect(client.dispatchViewportCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        protocolVersion: 1,
        domain: 'scene',
        action: LIVE_COMPOSITOR_COMMAND_ACTIONS.setPreset,
        sceneId: scene.sceneId,
        viewportId: LIVE_COMPOSITOR_VIEWPORT_ID,
        baseRevision: 0,
        payload: { presetId: 'preset-clean' },
      }),
    );
    expect(onSceneChange).toHaveBeenCalledWith(
      expect.objectContaining({ revision: 1, activePresetId: 'preset-clean' }),
    );
  });

  it('supplies toolbar descriptors for preset, tracking overlay, and output route controls', () => {
    const controller = new LiveController({
      enginePort: 1234,
      scene: createDefaultLiveCompositorScene({ now: 1000 }),
      viewportId: LIVE_COMPOSITOR_VIEWPORT_ID,
    });

    expect(controller.getToolbarExtensions().map((item) => item.action)).toEqual([
      LIVE_COMPOSITOR_COMMAND_ACTIONS.setPreset,
      LIVE_COMPOSITOR_COMMAND_ACTIONS.setTrackingOverlay,
      LIVE_COMPOSITOR_COMMAND_ACTIONS.setOutputRoute,
    ]);
  });

  it('keeps compositor and fallback visual paths isolated', () => {
    expect(
      selectLiveVisualPath({
        compositorStatus: 'active',
        hasController: true,
        hasAvatar: true,
        fallbackEnabled: true,
      }),
    ).toBe('compositor');
    expect(
      selectLiveVisualPath({
        compositorStatus: 'unavailable',
        hasController: true,
        hasAvatar: true,
        fallbackEnabled: true,
      }),
    ).toBe('local-fallback');
    expect(
      selectLiveVisualPath({
        compositorStatus: 'unavailable',
        hasController: false,
        hasAvatar: false,
        fallbackEnabled: true,
      }),
    ).toBe('empty');
  });

  it('builds camera source refs from authorized compositor session refs without stream URLs', () => {
    const scene = createDefaultLiveCompositorScene({
      now: 1000,
      cameraBinding: {
        role: 'camera',
        deviceId: 'cam-1',
        deviceType: 'camera',
        label: 'Camera',
        sessionId: 'camera-session',
        compositorSourceRef: {
          sourceId: 'source-camera-camera-session',
          kind: 'camera',
          label: 'Camera',
          deviceSessionRef: 'camera-session',
          metadata: { authorized: true, deviceId: 'cam-1' },
        },
      },
    });

    const source = scene.sources.find((candidate) => candidate.kind === 'camera');

    expect(source).toMatchObject({
      sourceId: 'source-camera-camera-session',
      kind: 'camera',
      deviceSessionRef: 'camera-session',
      metadata: expect.objectContaining({ authorized: true, role: 'camera' }),
    });
    expect(source).not.toHaveProperty('streamRef');
  });

  it('exposes output route capability diagnostics for unavailable routes', () => {
    const scene = createDefaultLiveCompositorScene({ now: 1000 });

    expect(scene.outputRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'monitor', status: 'active' }),
        expect.objectContaining({
          kind: 'recording',
          status: 'unsupported',
          diagnostics: [expect.objectContaining({ code: 'unsupported-output-route' })],
        }),
        expect.objectContaining({
          kind: 'obs-virtual-camera',
          status: 'unavailable',
          diagnostics: [expect.objectContaining({ code: 'unavailable-output-route' })],
        }),
        expect.objectContaining({
          kind: 'rtmp',
          status: 'permission-required',
          diagnostics: [expect.objectContaining({ code: 'permission-required' })],
        }),
      ]),
    );
  });
});

function event(patch: Partial<ViewportEvent>): ViewportEvent {
  return {
    protocolVersion: 1,
    domain: 'scene',
    event: 'scene:live:set-preset:ack',
    sceneId: 'live-scene-main',
    viewportId: LIVE_COMPOSITOR_VIEWPORT_ID,
    ackSeq: 0,
    revision: 0,
    timestamp: 1000,
    status: 'ack',
    payload: {},
    ...patch,
  };
}
