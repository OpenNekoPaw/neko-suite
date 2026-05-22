import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PuppetCommandAck } from '@neko/shared';
import {
  PuppetSceneController,
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
    });
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
      applyNativeCommand: vi.fn(async (seq: number, baseRevision: number): Promise<PuppetCommandAck> => ({
        seq,
        appliedSeq: 0,
        baseRevision,
        revision: baseRevision,
        status: 'rejected',
        error: { code: 'revisionConflict', message: 'stale native revision' },
      })),
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
    expect(controller.getOverlays().some((overlay) => overlay.id.startsWith('puppet-prediction'))).toBe(
      false,
    );
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

function createControllerHarness(overrides: Partial<IPuppetController> = {}): IPuppetController {
  const applyNativeCommand = overrides.applyNativeCommand ?? vi.fn(
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
