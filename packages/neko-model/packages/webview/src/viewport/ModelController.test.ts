import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ViewportEvent } from '@neko/shared';
import {
  ModelController,
  handleModelMenuAction,
  handleModelToolbarAction,
} from './ModelController';
import { useModelStore } from '../stores/modelStore';
import { LocalPredictionLayer } from '../scene/LocalPredictionLayer';
import { AuthoringPerformanceMetrics } from '../scene/AuthoringPerformanceMetrics';

describe('ModelController', () => {
  beforeEach(() => {
    useModelStore.setState({
      sceneId: 'scene-a',
      sceneRevision: 3,
      selectedNodeId: null,
      nextSceneCommandSeq: 10,
      pendingTransformPredictions: [],
      localPredictionLayer: new LocalPredictionLayer(),
      localPredictions: [],
      transformMode: 'translate',
      qualityPreviewDataUrl: null,
      authoringMetrics: new AuthoringPerformanceMetrics(),
      authoringMetricsSnapshot: new AuthoringPerformanceMetrics().snapshot(),
    });
  });

  it('sends selection as a ViewportProtocol command and applies compatible ack payload', async () => {
    const onSelectNode = vi.fn();
    const client = {
      dispatchViewportCommand: vi.fn(async (command) =>
        event({
          ackSeq: command.seq,
          appliedSeq: command.seq,
          payload: {
            sceneId: 'scene-a',
            viewportId: 'main',
            revision: 3,
            nodeId: 'node-1',
          },
        }),
      ),
    };
    const controller = new ModelController(
      {
        enginePort: 1234,
        sceneId: 'scene-a',
        viewportId: 'main',
        sceneRevision: 3,
        onSelectNode,
        getViewportRect: () => ({ width: 200, height: 100 }),
      },
      client as never,
    );

    await controller.onPointerDown({
      kind: 'pointer',
      sceneId: 'scene-a',
      viewportId: 'main',
      timestamp: 100,
      modifiers: { alt: false, ctrl: false, meta: false, shift: false },
      phase: 'down',
      pointerId: 1,
      pointerType: 'mouse',
      position: [100, 50],
      buttons: 1,
      button: 0,
    });

    expect(client.dispatchViewportCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        protocolVersion: 1,
        domain: 'viewport',
        action: 'viewport:select',
        sceneId: 'scene-a',
        viewportId: 'main',
        baseRevision: 3,
        payload: expect.objectContaining({ x: 0.5, y: 0.5 }),
      }),
    );
    expect(onSelectNode).toHaveBeenCalledWith('node-1');
  });

  it('routes selection through scene-control websocket when a socket is provided', async () => {
    const onSelectNode = vi.fn();
    const socket = {
      query: vi.fn(async () => ({
        sceneId: 'scene-a',
        viewportId: 'main',
        revision: 3,
        nodeId: 'node-1',
      })),
    };
    const client = {
      dispatchViewportCommand: vi.fn(),
    };
    const controller = new ModelController(
      {
        enginePort: 1234,
        sceneId: 'scene-a',
        viewportId: 'main',
        sceneRevision: 3,
        sceneControlSocket: socket as never,
        onSelectNode,
        getViewportRect: () => ({ width: 200, height: 100 }),
      },
      client as never,
    );

    await controller.onPointerDown({
      kind: 'pointer',
      sceneId: 'scene-a',
      viewportId: 'main',
      timestamp: 100,
      modifiers: { alt: false, ctrl: false, meta: false, shift: false },
      phase: 'down',
      pointerId: 1,
      pointerType: 'mouse',
      position: [100, 50],
      buttons: 1,
      button: 0,
    });

    expect(socket.query).toHaveBeenCalledWith(
      'hitTest',
      expect.objectContaining({ sceneId: 'scene-a', viewportId: 'main', x: 0.5, y: 0.5 }),
    );
    expect(client.dispatchViewportCommand).not.toHaveBeenCalled();
    expect(onSelectNode).toHaveBeenCalledWith('node-1');
  });

  it('creates transform prediction overlays and reconciles transform command ack', async () => {
    const client = {
      dispatchViewportCommand: vi.fn(async (command) =>
        event({
          ackSeq: command.seq,
          appliedSeq: command.seq,
          revision: 4,
          payload: { sceneId: 'scene-a', viewportId: 'main', revision: 4, nodeId: 'node-1' },
        }),
      ),
    };
    const controller = new ModelController(
      {
        enginePort: 1234,
        sceneId: 'scene-a',
        viewportId: 'main',
        sceneRevision: 3,
      },
      client as never,
    );

    await controller.transformNode('node-1', {
      position: { x: 1, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    });

    expect(client.dispatchViewportCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'viewport:transform',
        payload: expect.objectContaining({
          nodeId: 'node-1',
          position: [1, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        }),
      }),
    );
    expect(useModelStore.getState().pendingTransformPredictions).toHaveLength(0);
    expect(useModelStore.getState().localPredictions).toHaveLength(0);
  });

  it('routes transform commands through scene-control websocket when a socket is provided', async () => {
    const socket = {
      sendCommand: vi.fn(async (envelope) => ({
        seq: envelope.seq,
        appliedSeq: envelope.seq,
        baseRevision: envelope.baseRevision,
        revision: 4,
        status: 'applied',
      })),
    };
    const client = {
      dispatchViewportCommand: vi.fn(),
    };
    const controller = new ModelController(
      {
        enginePort: 1234,
        sceneId: 'scene-a',
        viewportId: 'main',
        sceneRevision: 3,
        sceneControlSocket: socket as never,
      },
      client as never,
    );

    await controller.transformNode('node-1', {
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    });

    expect(socket.sendCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        baseRevision: 3,
        command: expect.objectContaining({
          type: 'transform',
          payloadJson: JSON.stringify({
            nodeId: 'node-1',
            position: [1, 2, 3],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
          }),
        }),
      }),
    );
    expect(client.dispatchViewportCommand).not.toHaveBeenCalled();
    expect(useModelStore.getState().pendingTransformPredictions).toHaveLength(0);
    expect(useModelStore.getState().localPredictions).toHaveLength(0);
  });

  it('routes camera commands through scene-control websocket when a socket is provided', async () => {
    const socket = {
      updateViewportCamera: vi.fn(async () => ({
        type: 'viewportCameraAck',
        sceneId: 'scene-a',
        viewportId: 'main',
        status: 'applied',
        revision: 4,
        acceptedRevision: 4,
      })),
    };
    const client = {
      dispatchViewportCommand: vi.fn(),
    };
    const controller = new ModelController(
      {
        enginePort: 1234,
        sceneId: 'scene-a',
        viewportId: 'main',
        sceneRevision: 3,
        sceneControlSocket: socket as never,
      },
      client as never,
    );

    await controller.updateCamera();

    expect(socket.updateViewportCamera).toHaveBeenCalledWith(
      expect.objectContaining({
        sceneId: 'scene-a',
        sceneRevision: 3,
        viewportId: 'main',
        position: expect.any(Array),
        target: expect.any(Array),
      }),
    );
    expect(client.dispatchViewportCommand).not.toHaveBeenCalled();
    expect(useModelStore.getState().localPredictions).toHaveLength(0);
  });

  it('routes character preview mode commands through scene-control websocket', async () => {
    const socket = {
      sendViewportCommand: vi.fn(async (command) =>
        event({
          domain: 'scene',
          event: command.action,
          ackSeq: command.seq,
          appliedSeq: command.seq,
          revision: 4,
          payload: {
            characterId: 'character-a',
            modeId: 'motion',
            viewportId: 'main',
            status: 'applied',
            sceneRevision: 4,
            appliedSeq: command.seq,
            cameraPreset: 'motion-review',
            renderPreset: 'motion-diagnostics',
            playback: { state: 'unavailable' },
            diagnostics: [{ code: 'missing-demo-clip', severity: 'warning' }],
            hasCameraOverride: false,
          },
        }),
      ),
    };
    const client = {
      dispatchViewportCommand: vi.fn(),
    };
    const controller = new ModelController(
      {
        enginePort: 1234,
        sceneId: 'scene-a',
        viewportId: 'main',
        sceneRevision: 3,
        sceneControlSocket: socket as never,
      },
      client as never,
    );

    await controller.setCharacterPreviewMode('character-a', 'motion');

    expect(socket.sendViewportCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        protocolVersion: 1,
        domain: 'scene',
        action: 'scene:model:characterPreview:setMode',
        sceneId: 'scene-a',
        viewportId: 'main',
        baseRevision: 3,
        payload: {
          characterId: 'character-a',
          modeId: 'motion',
          viewportId: 'main',
        },
      }),
    );
    expect(client.dispatchViewportCommand).not.toHaveBeenCalled();
    expect(useModelStore.getState().characterPreview.appliedMode).toBe('motion');
    expect(useModelStore.getState().characterPreview.diagnostics[0]?.code).toBe(
      'missing-demo-clip',
    );
  });

  it('returns a disconnected error instead of falling back to HTTP for explicit null socket', async () => {
    const onError = vi.fn();
    const client = {
      dispatchViewportCommand: vi.fn(),
    };
    const controller = new ModelController(
      {
        enginePort: 1234,
        sceneId: 'scene-a',
        viewportId: 'main',
        sceneRevision: 3,
        sceneControlSocket: null,
        onError,
        getViewportRect: () => ({ width: 200, height: 100 }),
      },
      client as never,
    );

    await controller.onPointerDown({
      kind: 'pointer',
      sceneId: 'scene-a',
      viewportId: 'main',
      timestamp: 100,
      modifiers: { alt: false, ctrl: false, meta: false, shift: false },
      phase: 'down',
      pointerId: 1,
      pointerType: 'mouse',
      position: [100, 50],
      buttons: 1,
      button: 0,
    });

    expect(client.dispatchViewportCommand).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('scene control websocket is disconnected');
  });

  it('marks character preview unavailable when scene-control is disconnected', async () => {
    const client = {
      dispatchViewportCommand: vi.fn(),
    };
    const controller = new ModelController(
      {
        enginePort: 1234,
        sceneId: 'scene-a',
        viewportId: 'main',
        sceneRevision: 3,
        sceneControlSocket: null,
      },
      client as never,
    );

    const result = await controller.setCharacterPreviewMode('character-a', 'voice-pack');

    expect(result.status).toBe('error');
    expect(client.dispatchViewportCommand).not.toHaveBeenCalled();
    expect(useModelStore.getState().characterPreview.status).toBe('unavailable');
    expect(useModelStore.getState().characterPreview.diagnostics[0]?.code).toBe(
      'scene-control-unavailable',
    );
  });

  it('supplies toolbar descriptors and handles transform-mode toolbar actions', () => {
    const controller = new ModelController({
      enginePort: 1234,
      sceneId: 'scene-a',
      viewportId: 'main',
      sceneRevision: 3,
    });

    expect(controller.getToolbarExtensions().map((item) => item.action)).toContain(
      'scene:model:transform-mode',
    );
    handleModelToolbarAction({
      id: 'rotate',
      kind: 'toggle',
      action: 'scene:model:transform-mode',
      payload: { mode: 'rotate' },
    });
    expect(useModelStore.getState().transformMode).toBe('rotate');
  });

  it('routes camera, material preview, and context menu actions through controller helpers', async () => {
    const onMaterialPreview = vi.fn();
    const client = {
      dispatchViewportCommand: vi.fn(async (command) =>
        event({
          event: `${command.action}:ack`,
          ackSeq: command.seq,
          appliedSeq: command.seq,
          revision: 4,
          payload: { sceneId: 'scene-a', viewportId: 'main', revision: 4 },
        }),
      ),
    };
    const controller = new ModelController(
      {
        enginePort: 1234,
        sceneId: 'scene-a',
        viewportId: 'main',
        sceneRevision: 3,
        onMaterialPreview,
      },
      client as never,
    );

    await controller.updateCamera();
    expect(client.dispatchViewportCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'viewport:camera',
        payload: expect.objectContaining({
          position: expect.any(Array),
          target: expect.any(Array),
        }),
      }),
    );
    expect(useModelStore.getState().localPredictions).toHaveLength(0);

    await handleModelToolbarAction(
      {
        id: 'material',
        kind: 'toggle',
        action: 'scene:model:material-preview',
      },
      controller,
    );
    expect(onMaterialPreview).toHaveBeenCalledTimes(1);

    useModelStore.getState().selectNode('node-1');
    await handleModelMenuAction({
      id: 'clear',
      label: 'Clear selection',
      action: 'scene:model:select-none',
    });
    expect(useModelStore.getState().selectedNodeId).toBeNull();
  });
});

function event(patch: Partial<ViewportEvent>): ViewportEvent {
  return {
    protocolVersion: 1,
    domain: 'viewport',
    event: 'viewport:select:ack',
    sceneId: 'scene-a',
    viewportId: 'main',
    ackSeq: 0,
    revision: 3,
    timestamp: 100,
    status: 'ack',
    payload: {},
    ...patch,
  };
}
