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
      getLiveCompositorScene: vi.fn(async () => scene),
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

  it('marks semantic controls degraded while compositor stream may remain active but control is disconnected', async () => {
    const scene = createDefaultLiveCompositorScene({ now: 1000 });
    const client = liveClientMock(scene);
    const onError = vi.fn();
    const controller = new LiveController(
      {
        enginePort: 1234,
        scene,
        viewportId: LIVE_COMPOSITOR_VIEWPORT_ID,
        controlConnectionState: 'disconnected',
        onError,
      },
      client,
    );

    expect(controller.getToolbarExtensions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'live-preset',
          disabled: true,
          degraded: true,
          degradedReason: 'control-disconnected',
        }),
      ]),
    );

    await controller.setPreset('preset-clean');

    expect(client.dispatchViewportCommand).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('live scene-control websocket is disconnected');
  });

  it('requests authoritative scene resync before re-enabling controls after reconnect', async () => {
    const staleScene = createDefaultLiveCompositorScene({ now: 1000 });
    const freshScene = {
      ...staleScene,
      revision: 9,
      activePresetId: 'preset-clean',
      updatedAt: 2000,
    };
    const pendingResync = deferred<typeof freshScene>();
    const client = {
      dispatchViewportCommand: vi.fn(),
      getLiveCompositorScene: vi.fn(() => pendingResync.promise),
    };
    const onSceneChange = vi.fn();
    const controller = new LiveController(
      {
        enginePort: 1234,
        scene: staleScene,
        viewportId: LIVE_COMPOSITOR_VIEWPORT_ID,
        controlConnectionState: 'degraded',
        onSceneChange,
      },
      client,
    );

    controller.updateControlConnectionState('connected');

    expect(client.getLiveCompositorScene).toHaveBeenCalledWith(staleScene.sceneId);
    expect(controller.getToolbarExtensions()[0]?.disabled).toBe(true);

    pendingResync.resolve(freshScene);
    await pendingResync.promise;
    await Promise.resolve();
    await Promise.resolve();

    expect(onSceneChange).toHaveBeenCalledWith(freshScene);
    expect(controller.getToolbarExtensions()[0]?.value).toBe('preset-clean');
    expect(controller.getToolbarExtensions()[0]?.disabled).toBe(false);
  });

  it('updates active preset only after command acknowledgement', async () => {
    const pending = deferred<ViewportEvent>();
    const scene = createDefaultLiveCompositorScene({ now: 1000 });
    const client = {
      dispatchViewportCommand: vi.fn(() => pending.promise),
      getLiveCompositorScene: vi.fn(async () => scene),
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

    const change = controller.setPreset('preset-clean');

    expect(controller.getToolbarExtensions()[0]?.value).toBe('preset-main');
    expect(controller.getToolbarExtensions()[0]?.disabled).toBe(true);

    pending.resolve(
      event({
        event: `${LIVE_COMPOSITOR_COMMAND_ACTIONS.setPreset}:ack`,
        ackSeq: 1,
        appliedSeq: 1,
        revision: 1,
        payload: { activePresetId: 'preset-clean' },
      }),
    );
    await change;

    expect(onSceneChange).toHaveBeenCalledWith(
      expect.objectContaining({ revision: 1, activePresetId: 'preset-clean' }),
    );
    expect(controller.getToolbarExtensions()[0]?.value).toBe('preset-clean');
    expect(controller.getToolbarExtensions()[0]?.disabled).toBe(false);
  });

  it('does not commit tracking overlay changes when scene-control rejects the command', async () => {
    const scene = createDefaultLiveCompositorScene({ now: 1000 });
    const client = {
      dispatchViewportCommand: vi.fn(async (command) =>
        event({
          event: `${command.action}:error`,
          ackSeq: command.seq,
          revision: 0,
          status: 'error',
          error: { code: 'revisionConflict', message: 'stale live scene revision' },
        }),
      ),
      getLiveCompositorScene: vi.fn(async () => scene),
    };
    const onSceneChange = vi.fn();
    const onError = vi.fn();
    const controller = new LiveController(
      {
        enginePort: 1234,
        scene,
        viewportId: LIVE_COMPOSITOR_VIEWPORT_ID,
        onSceneChange,
        onError,
      },
      client,
    );

    await controller.toggleTrackingOverlay();

    expect(onSceneChange).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('stale live scene revision');
    expect(controller.getToolbarExtensions()[1]?.toggled).toBe(true);
    expect(controller.getToolbarExtensions()[1]?.degradedReason).toBe('command-rejected');
  });

  it('surfaces unsupported output route diagnostics without treating local preview recording as authoritative', async () => {
    const scene = createDefaultLiveCompositorScene({ now: 1000 });
    const client = liveClientMock(scene);
    const onError = vi.fn();
    const controller = new LiveController(
      {
        enginePort: 1234,
        scene,
        viewportId: LIVE_COMPOSITOR_VIEWPORT_ID,
        onError,
      },
      client,
    );

    await controller.handleToolbarAction({
      id: 'live-output-route',
      kind: 'select',
      action: LIVE_COMPOSITOR_COMMAND_ACTIONS.setOutputRoute,
      value: 'route-recording',
      payload: { routeId: 'route-recording' },
    });

    expect(client.dispatchViewportCommand).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      'Compositor recording output is not implemented in this build.',
    );
    expect(controller.getToolbarExtensions()[2]?.value).toBe('route-monitor');
    expect(scene.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'preview-non-authoritative' })]),
    );
  });

  it('keeps compositor and local preview paths isolated', () => {
    expect(
      selectLiveVisualPath({
        compositorStatus: 'active',
        hasController: true,
        hasAvatar: true,
        localPreviewEnabled: true,
      }),
    ).toBe('compositor');
    expect(
      selectLiveVisualPath({
        compositorStatus: 'unavailable',
        hasController: true,
        hasAvatar: true,
        localPreviewEnabled: true,
      }),
    ).toBe('local-preview');
    expect(
      selectLiveVisualPath({
        compositorStatus: 'unavailable',
        hasController: false,
        hasAvatar: false,
        localPreviewEnabled: true,
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function liveClientMock(scene: ReturnType<typeof createDefaultLiveCompositorScene>) {
  return {
    dispatchViewportCommand: vi.fn(),
    getLiveCompositorScene: vi.fn(async () => scene),
  };
}
