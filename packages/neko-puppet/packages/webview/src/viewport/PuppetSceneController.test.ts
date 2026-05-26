import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PuppetCommandAck } from '@neko/shared';
import {
  PuppetSceneController,
  createIdlePuppetSceneController,
  handlePuppetToolbarAction,
  handlePuppetMenuAction,
  puppetCommandFromViewportCommand,
} from './PuppetSceneController';
import { drawOverlayDescriptors } from '@neko/ui';
import { usePuppetStore } from '../stores/puppet-store';
import type { IPuppetController } from '../animation/puppet-controller';

describe('PuppetSceneController', () => {
  beforeEach(() => {
    usePuppetStore.setState({
      puppetLoaded: true,
      puppetSnapshot: {
        format: 'native',
        nodes: [
          {
            id: 'bone-root',
            name: 'Root',
            node_type: 'group',
            position: [0, 0],
            rotation: 0,
            scale: [1, 1],
            z_order: 0,
            opacity: 1,
            parent_id: null,
            has_mesh: false,
          },
          {
            id: 'bone-head',
            name: 'Head',
            node_type: 'group',
            position: [10, 0],
            rotation: 0,
            scale: [1, 1],
            z_order: 1,
            opacity: 1,
            parent_id: 'bone-root',
            has_mesh: false,
          },
        ],
        parameters: [],
        meshes: [],
      },
      nativeRevision: 5,
      nativeSeq: 10,
      pendingNativeCommandIds: new Set<string>(),
      selectedNativeBoneId: null,
      nativeBlendShapes: [{ name: 'Smile', meshId: 'mesh-face', current: 0 }],
      puppetParameters: [],
    });
  });

  it('provides an idle viewport controller for empty puppet documents', () => {
    const controller = createIdlePuppetSceneController();

    expect(controller.sceneId).toBe('puppet-main');
    expect(controller.sceneType).toBe('2d');
    expect(controller.getToolbarExtensions()).toEqual([]);
    expect(controller.getOverlays()).toEqual([]);
  });

  it('maps drag bone and BlendShape actions to native puppet commands', async () => {
    const engine = createControllerHarness();
    const controller = new PuppetSceneController({
      sceneId: 'puppet-a',
      viewportId: 'main',
      controller: engine,
    });

    await controller.dragBone('bone-head', { position: [12, 4], rotation: 8 }, 'offset');
    await controller.setBlendShape('Smile', 0.8);

    expect(engine.applyNativeCommand).toHaveBeenNthCalledWith(
      1,
      10,
      5,
      {
        type: 'setNativeBoneTransform',
        bone: 'bone-head',
        transform: { position: [12, 4], rotation: 8, scale: undefined },
        mode: 'offset',
      },
      'main:10',
    );
    expect(engine.applyNativeCommand).toHaveBeenNthCalledWith(
      2,
      11,
      6,
      { type: 'setNativeBlendShape', name: 'Smile', weight: 0.8 },
      'main:11',
    );
    expect(usePuppetStore.getState().nativeRevision).toBe(7);
    expect(usePuppetStore.getState().pendingNativeCommandIds.size).toBe(0);
  });

  it('provides skeleton overlays and context menu selection actions', () => {
    const controller = new PuppetSceneController({
      sceneId: 'puppet-a',
      viewportId: 'main',
      controller: createControllerHarness(),
    });

    const overlays = controller.getOverlays({
      protocolVersion: 1,
      streamId: 'stream-puppet',
      sceneId: 'puppet-a',
      viewportId: 'main',
      frameId: 1,
      ptsUs: 0,
      durationUs: 16666,
      frameTimestamp: 100,
      revision: 5,
      appliedSeq: 0,
      viewTransform: [1, 0, 0, 1, 0, 0],
    });

    expect(overlays.map((overlay) => overlay.id)).toContain('puppet-bone-handle-bone-head');
    expect(overlays.map((overlay) => overlay.id)).toContain('puppet-bone-link-bone-head');

    usePuppetStore.getState().setSelectedNativeBoneId('bone-head');
    handlePuppetMenuAction({
      id: 'clear',
      label: 'Clear bone selection',
      action: 'scene:puppet:select-none',
    });
    expect(usePuppetStore.getState().selectedNativeBoneId).toBeNull();
  });

  it('keeps native bone drag prediction visible until ack and clears it after commit', async () => {
    const pendingAck = deferred<PuppetCommandAck>();
    const engine = createControllerHarness({
      applyNativeCommand: vi.fn(() => pendingAck.promise),
    });
    const controller = new PuppetSceneController({
      sceneId: 'puppet-a',
      viewportId: 'main',
      controller: engine,
    });

    const drag = controller.dragBone('bone-head', { position: [12, 4] });
    expect(usePuppetStore.getState().pendingNativeCommandIds.has('main:10')).toBe(true);

    const pendingOverlays = controller.getOverlays();
    expect(pendingOverlays.map((overlay) => overlay.id)).toContain(
      'puppet-prediction-bone-path-main:10',
    );
    expect(pendingOverlays.map((overlay) => overlay.id)).toContain(
      'puppet-prediction-bone-handle-main:10',
    );

    pendingAck.resolve({
      seq: 10,
      appliedSeq: 10,
      baseRevision: 5,
      revision: 6,
      status: 'applied',
    });
    await drag;

    expect(usePuppetStore.getState().pendingNativeCommandIds.size).toBe(0);
    expect(controller.getOverlays().map((overlay) => overlay.id)).not.toContain(
      'puppet-prediction-bone-path-main:10',
    );
  });

  it('rolls back native BlendShape prediction when the engine rejects the command', async () => {
    const engine = createControllerHarness({
      applyNativeCommand: vi.fn(
        async (seq: number, baseRevision: number): Promise<PuppetCommandAck> => ({
          seq,
          appliedSeq: 0,
          baseRevision,
          revision: baseRevision,
          status: 'rejected',
          error: { code: 'revisionConflict', message: 'stale native revision' },
        }),
      ),
    });
    const onError = vi.fn();
    const controller = new PuppetSceneController({
      sceneId: 'puppet-a',
      viewportId: 'main',
      controller: engine,
      onError,
    });

    await controller.setBlendShape('Smile', 0.8);

    expect(onError).toHaveBeenCalledWith('stale native revision');
    expect(usePuppetStore.getState().nativeRevision).toBe(5);
    expect(usePuppetStore.getState().pendingNativeCommandIds.size).toBe(0);
    expect(
      controller.getOverlays().some((overlay) => overlay.id.startsWith('puppet-prediction')),
    ).toBe(false);
  });

  it('invalidates stale native edit predictions when frame metadata supersedes their base revision', () => {
    const pendingAck = deferred<PuppetCommandAck>();
    const controller = new PuppetSceneController({
      sceneId: 'puppet-a',
      viewportId: 'main',
      controller: createControllerHarness({
        applyNativeCommand: vi.fn(() => pendingAck.promise),
      }),
    });

    void controller.setBlendShape('Smile', 0.8);
    expect(usePuppetStore.getState().pendingNativeCommandIds.has('main:10')).toBe(true);

    controller.getOverlays({
      protocolVersion: 1,
      streamId: 'stream-puppet',
      sceneId: 'puppet-a',
      viewportId: 'main',
      frameId: 2,
      ptsUs: 16666,
      durationUs: 16666,
      frameTimestamp: 120,
      revision: 6,
      appliedSeq: 0,
      viewTransform: [1, 0, 0, 1, 0, 0],
    });

    expect(usePuppetStore.getState().pendingNativeCommandIds.size).toBe(0);
  });

  it('aligns puppet bone overlays with viewport frame metadata transforms', () => {
    const controller = new PuppetSceneController({
      sceneId: 'puppet-a',
      viewportId: 'main',
      controller: createControllerHarness(),
    });
    const context = fakeCanvasContext();

    drawOverlayDescriptors(context, controller.getOverlays(), {
      protocolVersion: 1,
      streamId: 'stream-puppet',
      sceneId: 'puppet-a',
      viewportId: 'main',
      frameId: 1,
      ptsUs: 0,
      durationUs: 16666,
      frameTimestamp: 100,
      revision: 5,
      appliedSeq: 0,
      viewTransform: [2, 0, 0, 2, 10, 20],
    });

    expect(context.moveTo).toHaveBeenCalledWith(10, 20);
    expect(context.lineTo).toHaveBeenCalledWith(30, 20);
    expect(context.arc).toHaveBeenCalledWith(30, 20, 3, 0, Math.PI * 2);
  });

  it('uses active frame metadata view transform for bone hit testing', () => {
    const controller = new PuppetSceneController({
      sceneId: 'puppet-a',
      viewportId: 'main',
      controller: createControllerHarness(),
    });

    controller.getOverlays({
      protocolVersion: 1,
      streamId: 'stream-puppet',
      sceneId: 'puppet-a',
      viewportId: 'main',
      frameId: 1,
      ptsUs: 0,
      durationUs: 16666,
      frameTimestamp: 100,
      revision: 5,
      appliedSeq: 0,
      viewTransform: [2, 0, 0, 2, 10, 20],
    });

    const result = controller.onPointerDown(pointerInput('down', [30, 20]));

    expect(result?.diagnostics).toContain('selected puppet bone bone-head');
    expect(usePuppetStore.getState().selectedNativeBoneId).toBe('bone-head');
  });

  it('dispatches pointer drag commit through native puppet command envelopes', async () => {
    const engine = createControllerHarness();
    const controller = new PuppetSceneController({
      sceneId: 'puppet-a',
      viewportId: 'main',
      controller: engine,
    });

    controller.onPointerDown(pointerInput('down', [10, 0]));
    controller.onPointerMove(pointerInput('move', [14, 6]));
    expect(usePuppetStore.getState().pendingNativeCommandIds.has('main:10')).toBe(true);
    expect(controller.getOverlays().map((overlay) => overlay.id)).toContain(
      'puppet-prediction-bone-handle-main:10',
    );

    await controller.onPointerUp(pointerInput('up', [14, 6]));

    expect(engine.applyNativeCommand).toHaveBeenCalledWith(
      10,
      5,
      {
        type: 'setNativeBoneTransform',
        bone: 'bone-head',
        transform: { position: [14, 6], rotation: undefined, scale: undefined },
        mode: 'set',
      },
      'main:10',
    );
    expect(usePuppetStore.getState().nativeRevision).toBe(6);
    expect(usePuppetStore.getState().pendingNativeCommandIds.size).toBe(0);
  });

  it('rejects stale puppet hit testing when frame metadata is ahead of the native snapshot', () => {
    const controller = new PuppetSceneController({
      sceneId: 'puppet-a',
      viewportId: 'main',
      controller: createControllerHarness(),
    });

    controller.getOverlays({
      protocolVersion: 1,
      streamId: 'stream-puppet',
      sceneId: 'puppet-a',
      viewportId: 'main',
      frameId: 9,
      ptsUs: 0,
      durationUs: 16666,
      frameTimestamp: 100,
      revision: 9,
      appliedSeq: 0,
      viewTransform: [1, 0, 0, 1, 0, 0],
    });

    const result = controller.onPointerDown(pointerInput('down', [10, 0]));

    expect(result?.diagnostics?.[0]).toContain('puppet snapshot stale');
    expect(usePuppetStore.getState().selectedNativeBoneId).toBeNull();
    expect(usePuppetStore.getState().pendingNativeCommandIds.size).toBe(0);
  });

  it('rolls back pointer drag predictions while preview stream can remain connected', async () => {
    usePuppetStore.getState().setStreamConnected(true);
    const engine = createControllerHarness({
      applyNativeCommand: vi.fn(
        async (seq: number, baseRevision: number): Promise<PuppetCommandAck> => ({
          seq,
          appliedSeq: 0,
          baseRevision,
          revision: baseRevision,
          status: 'rejected',
          error: { code: 'revisionConflict', message: 'stale native revision' },
        }),
      ),
    });
    const onError = vi.fn();
    const controller = new PuppetSceneController({
      sceneId: 'puppet-a',
      viewportId: 'main',
      controller: engine,
      onError,
    });

    controller.onPointerDown(pointerInput('down', [10, 0]));
    controller.onPointerMove(pointerInput('move', [18, 3]));
    await controller.onPointerUp(pointerInput('up', [18, 3]));

    expect(onError).toHaveBeenCalledWith('stale native revision');
    expect(usePuppetStore.getState().streamConnected).toBe(true);
    expect(usePuppetStore.getState().pendingNativeCommandIds.size).toBe(0);
    expect(
      controller.getOverlays().some((overlay) => overlay.id.startsWith('puppet-prediction')),
    ).toBe(false);
  });

  it('keeps BlendShape UI state pending until native command ack applies', async () => {
    const pendingAck = deferred<PuppetCommandAck>();
    const engine = createControllerHarness({
      applyNativeCommand: vi.fn(() => pendingAck.promise),
    });
    const controller = new PuppetSceneController({
      sceneId: 'puppet-a',
      viewportId: 'main',
      controller: engine,
    });

    const change = controller.setBlendShape('Smile', 0.8);
    expect(usePuppetStore.getState().nativeBlendShapes[0]?.current).toBe(0);
    expect(controller.getToolbarExtensions()[0]?.disabled).toBe(true);

    pendingAck.resolve({
      seq: 10,
      appliedSeq: 10,
      baseRevision: 5,
      revision: 6,
      status: 'applied',
    });
    await change;

    expect(usePuppetStore.getState().nativeBlendShapes[0]?.current).toBe(0.8);
    expect(controller.getToolbarExtensions()[0]?.disabled).toBe(false);
  });

  it('applies driver and vertex edit UI state only after native command ack', async () => {
    const engine = createControllerHarness();
    const controller = new PuppetSceneController({
      sceneId: 'puppet-a',
      viewportId: 'main',
      controller: engine,
    });

    await controller.dispatchPuppetAction('scene:puppet:set-driver-weight', {
      name: 'ParamAngleX',
      value: 0.25,
    });
    await controller.dispatchPuppetAction('scene:puppet:edit-vertex', {
      name: 'Smile',
      meshId: 'mesh-face',
      vertexIndex: 2,
      delta: [0.25, -0.5],
      weight: 0.6,
    });

    expect(usePuppetStore.getState().puppetParameters).toEqual([
      expect.objectContaining({ name: 'ParamAngleX', current: 0.25 }),
    ]);
    expect(usePuppetStore.getState().nativeBlendShapes[0]?.current).toBe(0.6);
  });

  it('marks puppet toolbar controls as degraded while native commands are pending or rejected', async () => {
    const pendingAck = deferred<PuppetCommandAck>();
    const engine = createControllerHarness({
      applyNativeCommand: vi.fn(() => pendingAck.promise),
    });
    const controller = new PuppetSceneController({
      sceneId: 'puppet-a',
      viewportId: 'main',
      controller: engine,
      onError: vi.fn(),
    });

    void controller.setBlendShape('Smile', 0.8);

    expect(controller.getToolbarExtensions()[0]).toEqual(
      expect.objectContaining({
        disabled: true,
        degraded: true,
        degradedReason: 'control-reconnecting',
      }),
    );

    pendingAck.resolve({
      seq: 10,
      appliedSeq: 0,
      baseRevision: 5,
      revision: 5,
      status: 'rejected',
      error: { code: 'revisionConflict', message: 'stale native revision' },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(controller.getToolbarExtensions()[0]).toEqual(
      expect.objectContaining({
        disabled: false,
        degraded: true,
        degradedReason: 'command-rejected',
      }),
    );
  });

  it('routes onion-skin toolbar state through native command ack', async () => {
    const engine = createControllerHarness();
    const controller = new PuppetSceneController({
      sceneId: 'puppet-a',
      viewportId: 'main',
      controller: engine,
    });

    await handlePuppetToolbarAction(
      {
        id: 'puppet-onion-skin',
        kind: 'toggle',
        action: 'scene:puppet:toggle-onion-skin',
        payload: { enabled: true },
      },
      controller,
    );

    expect(engine.applyNativeCommand).toHaveBeenCalledWith(
      10,
      5,
      { type: 'setNativeTrackingInput', name: 'onionSkin', value: 1 },
      'main:10',
    );
    expect(controller.getToolbarExtensions()[0]?.toggled).toBe(true);
  });

  it('keeps puppet overlay coordinate projection within half a pixel tolerance', () => {
    const controller = new PuppetSceneController({
      sceneId: 'puppet-a',
      viewportId: 'main',
      controller: createControllerHarness(),
    });
    const context = fakeCanvasContext();

    drawOverlayDescriptors(context, controller.getOverlays(), {
      protocolVersion: 1,
      streamId: 'stream-puppet',
      sceneId: 'puppet-a',
      viewportId: 'main',
      frameId: 1,
      ptsUs: 0,
      durationUs: 16666,
      frameTimestamp: 100,
      revision: 5,
      appliedSeq: 0,
      viewTransform: [1.5, 0, 0, 1.5, 0.25, -0.25],
    });

    expectPointWithinTolerance(context.moveTo.mock.calls[0], [0.25, -0.25], 0.5);
    expectPointWithinTolerance(context.lineTo.mock.calls[0], [15.25, -0.25], 0.5);
    const headArc = context.arc.mock.calls.find((call) => call[0] === 15.25);
    expectPointWithinTolerance(headArc, [15.25, -0.25], 0.5);
  });

  it('keeps viewport payload conversion explicit for vertex, driver, and onion skin edits', () => {
    expect(
      puppetCommandFromViewportCommand({
        protocolVersion: 1,
        domain: 'scene',
        action: 'scene:puppet:edit-vertex',
        sceneId: 'puppet-a',
        viewportId: 'main',
        seq: 1,
        correlationId: 'main:1',
        timestamp: 100,
        source: 'user',
        baseRevision: 1,
        payload: {
          name: 'Smile',
          meshId: 'mesh-face',
          vertexIndex: 2,
          delta: [0.25, -0.5],
        },
      }),
    ).toEqual({
      type: 'setNativeBlendShapeDelta',
      name: 'Smile',
      meshId: 'mesh-face',
      vertexIndex: 2,
      delta: [0.25, -0.5],
    });

    expect(
      puppetCommandFromViewportCommand({
        protocolVersion: 1,
        domain: 'scene',
        action: 'scene:puppet:set-driver-weight',
        sceneId: 'puppet-a',
        viewportId: 'main',
        seq: 2,
        correlationId: 'main:2',
        timestamp: 100,
        source: 'user',
        baseRevision: 1,
        payload: { name: 'ParamAngleX', value: 0.25 },
      }),
    ).toEqual({ type: 'setNativeTrackingInput', name: 'ParamAngleX', value: 0.25 });

    expect(
      puppetCommandFromViewportCommand({
        protocolVersion: 1,
        domain: 'scene',
        action: 'scene:puppet:toggle-onion-skin',
        sceneId: 'puppet-a',
        viewportId: 'main',
        seq: 3,
        correlationId: 'main:3',
        timestamp: 100,
        source: 'user',
        baseRevision: 1,
        payload: { enabled: false },
      }),
    ).toEqual({ type: 'setNativeTrackingInput', name: 'onionSkin', value: 0 });
  });
});

function pointerInput(
  phase: 'down' | 'move' | 'up' = 'down',
  position: readonly [number, number] = [0, 0],
): Parameters<PuppetSceneController['onPointerDown']>[0] {
  return {
    kind: 'pointer',
    sceneId: 'puppet-a',
    viewportId: 'main',
    timestamp: 100,
    modifiers: { alt: false, ctrl: false, meta: false, shift: false },
    phase,
    pointerId: 1,
    pointerType: 'mouse',
    position,
    buttons: phase === 'up' ? 0 : 1,
    button: 0,
    pressure: 0.5,
  };
}

function createControllerHarness(overrides: Partial<IPuppetController> = {}): IPuppetController {
  const applyNativeCommand =
    overrides.applyNativeCommand ??
    vi.fn(
      async (seq: number, baseRevision: number): Promise<PuppetCommandAck> => ({
        seq,
        appliedSeq: seq,
        baseRevision,
        revision: baseRevision + 1,
        status: 'applied',
      }),
    );
  const controller: IPuppetController = {
    load: vi.fn(),
    loadSource: vi.fn(),
    loadNativeProject: vi.fn(),
    loadAuxiliary: vi.fn(),
    setParameter: vi.fn(),
    getParameters: vi.fn(),
    tick: vi.fn(),
    getMeshes: vi.fn(),
    getSnapshot: vi.fn(),
    isLoaded: vi.fn(),
    getAnimations: vi.fn(),
    playAnimation: vi.fn(),
    stopAnimation: vi.fn(),
    seekAnimation: vi.fn(),
    connectStream: vi.fn(),
    disconnectStream: vi.fn(),
    startPreviewStream: vi.fn(),
    stopPreviewStream: vi.fn(),
    isStreaming: vi.fn(),
    getKeyframeTracks: vi.fn(),
    addKeyframe: vi.fn(),
    removeKeyframe: vi.fn(),
    updateKeyframe: vi.fn(),
    createClip: vi.fn(),
    crossfadeTo: vi.fn(),
    applyNativeCommand,
  };
  return { ...controller, ...overrides };
}

function fakeCanvasContext() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    setLineDash: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
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

function expectPointWithinTolerance(
  call: unknown[] | undefined,
  expected: readonly [number, number],
  tolerance: number,
): void {
  expect(call).toBeDefined();
  expect(call![0]).toBeCloseTo(expected[0], toleranceToDigits(tolerance));
  expect(call![1]).toBeCloseTo(expected[1], toleranceToDigits(tolerance));
}

function toleranceToDigits(tolerance: number): number {
  return Math.max(0, Math.ceil(-Math.log10(tolerance)));
}
