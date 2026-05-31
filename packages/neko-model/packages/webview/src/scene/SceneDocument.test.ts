import { describe, expect, it, vi } from 'vitest';
import type { SceneCommandAck, SceneCommandEnvelope } from '@neko/shared';
import { isOverlayFrameAligned } from '../components/OverlayCanvas';
import { MODEL_COMPONENT_SCHEMA_REGISTRY } from './ComponentSchemaRegistry';
import { commitInspectorNumberEdit, compileInspectorNumberCommand, SceneDocument } from './index';

function createDocument(
  getRevision: () => number = () => 2,
  ackStatus: SceneCommandAck['status'] = 'applied',
) {
  const sendCommand = vi.fn(
    async (envelope: SceneCommandEnvelope): Promise<SceneCommandAck> => ({
      seq: envelope.seq,
      appliedSeq: envelope.seq,
      baseRevision: envelope.baseRevision,
      revision: envelope.baseRevision + (ackStatus === 'applied' ? 1 : 0),
      status: ackStatus,
      error: ackStatus === 'rejected' ? 'rejected by engine' : undefined,
    }),
  );
  const query = vi.fn(async () => ({
    viewportId: 'main',
    revision: 2,
    nodeId: 'node_1',
    depth: 1,
    worldPosition: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: 1 },
  }));

  const document = new SceneDocument({
    sceneId: 'scene-a',
    getRevision,
    allocateSeq: () => 10,
    socket: { sendCommand, query } as never,
  });

  return { document, sendCommand, query };
}

describe('SceneDocument object model', () => {
  it('compiles node transform edits to scene command envelopes', async () => {
    const { document, sendCommand } = createDocument();

    await document.node('node_1').setTransform({
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    });

    expect(sendCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        seq: 10,
        baseRevision: 2,
        command: expect.objectContaining({ type: 'transform' }),
      }),
    );
  });

  it('compiles node visibility edits to scene command envelopes', async () => {
    const { document, sendCommand } = createDocument();

    await document.node('node_1').setVisible(false);

    expect(sendCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.objectContaining({
          type: 'visibility-set',
          payloadJson: JSON.stringify({ nodeId: 'node_1', visible: false }),
        }),
      }),
    );
  });

  it('routes handle queries through viewport-scoped control queries', async () => {
    const { document, query } = createDocument();

    await document.node('node_1').hitTest('side', 0.4, 0.5);

    expect(query).toHaveBeenCalledWith('hitTest', {
      viewportId: 'side',
      x: 0.4,
      y: 0.5,
      nodeIds: ['node_1'],
    });
  });

  it('rejects stale object handles before writing commands', async () => {
    let revision = 2;
    const { document, sendCommand } = createDocument(() => revision);
    const handle = document.node('node_1');
    revision = 3;

    expect(() =>
      handle.setTransform({
        position: { x: 1, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      }),
    ).toThrow(/stale/);
    expect(sendCommand).not.toHaveBeenCalled();
  });

  it('compiles material, light, and camera handles to command envelopes', async () => {
    const { document, sendCommand } = createDocument();

    await document.material('mat_1').updateParams({ roughness: 0.25 });
    await document.light('light_1').updateParams({ intensity: 5 });
    await document.camera('camera_1').setFov(60);

    expect(sendCommand).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ command: expect.objectContaining({ type: 'material-update' }) }),
    );
    expect(sendCommand).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ command: expect.objectContaining({ type: 'light-update' }) }),
    );
    expect(sendCommand).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ command: expect.objectContaining({ type: 'camera-set' }) }),
    );
  });

  it('compiles lookdev, environment, light patch, safe remove, and typed selection helpers', async () => {
    const { document, sendCommand, query } = createDocument();

    await document.updateViewportSettings('main', {
      renderMode: 'clay',
      materialOverride: { kind: 'clay', roughness: 0.9 },
    });
    await document.light('light_1').update({
      kind: 'point',
      color: { x: 1, y: 0.95, z: 0.9 },
      intensity: 3,
      shadow: { enabled: true, resolution: 2048 },
    });
    await document.environment('env-studio').set({
      mode: 'background-and-ibl',
      rotationDeg: 15,
      intensity: 1,
      exposure: 0,
      visibleAsBackground: true,
      backgroundColor: { x: 0, y: 0, z: 0, w: 1 },
    });
    await document.node('light_1').remove();
    await document.select({
      viewportId: 'main',
      x: 0.5,
      y: 0.4,
      mask: ['node', 'materialSlot', 'characterRegion'],
      mode: 'replace',
    });

    expect(sendCommand).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        command: expect.objectContaining({ type: 'viewport-settings-update' }),
      }),
    );
    expect(sendCommand).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        command: expect.objectContaining({
          type: 'light-update',
          payloadJson: expect.stringContaining('"shadow"'),
        }),
      }),
    );
    expect(sendCommand).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        command: expect.objectContaining({
          type: 'environment-set',
          payloadJson: expect.stringContaining('"background-and-ibl"'),
        }),
      }),
    );
    expect(sendCommand).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        command: expect.objectContaining({
          type: 'node-remove',
          payloadJson: JSON.stringify({ nodeId: 'light_1', cascade: false }),
        }),
      }),
    );
    expect(query).toHaveBeenCalledWith('selectionQuery', {
      viewportId: 'main',
      x: 0.5,
      y: 0.4,
      mask: ['node', 'materialSlot', 'characterRegion'],
      mode: 'replace',
    });
  });

  it('compiles inspector numeric edits from schema and rolls back rejected ack', async () => {
    const { document } = createDocument(() => 2, 'rejected');
    const onRollback = vi.fn();

    const ack = await commitInspectorNumberEdit(
      document,
      {
        component: 'transform',
        path: 'scale.x',
        targetId: 'node_1',
        value: -4,
        currentTransform: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 1, y: 1, z: 1 },
        },
      },
      { onRollback },
    );

    expect(ack.status).toBe('rejected');
    expect(onRollback).toHaveBeenCalledOnce();
    expect(
      compileInspectorNumberCommand({
        component: 'camera',
        path: 'fov',
        targetId: 'camera_1',
        value: 240,
      }),
    ).toEqual({
      type: 'camera-set',
      value: 179,
      payload: { cameraId: 'camera_1', fov: 179 },
    });
  });

  it('keeps overlay drawing scoped to matching render frame viewport metadata', () => {
    expect(
      isOverlayFrameAligned('main', {
        streamId: 'stream-main',
        viewportId: 'main',
        frameId: 1,
        ptsUs: 0,
        durationUs: 33_333,
        isKeyframe: true,
        sceneRevision: 4,
        appliedSeq: 10,
        frameTimestamp: 0,
        viewTransform: [1, 0, 0, 1, 0, 0],
      }),
    ).toBe(true);
    expect(
      isOverlayFrameAligned('side', {
        streamId: 'stream-main',
        viewportId: 'main',
        frameId: 1,
        ptsUs: 0,
        durationUs: 33_333,
        isKeyframe: true,
        sceneRevision: 4,
        appliedSeq: 10,
        frameTimestamp: 0,
        viewTransform: [1, 0, 0, 1, 0, 0],
      }),
    ).toBe(false);
  });

  it('contains stage 1A component schemas for inspector command fields', () => {
    expect(MODEL_COMPONENT_SCHEMA_REGISTRY.getField('transform', 'position.x')?.commandType).toBe(
      'transform',
    );
    expect(MODEL_COMPONENT_SCHEMA_REGISTRY.getField('material', 'roughness')?.commandType).toBe(
      'material-update',
    );
    expect(MODEL_COMPONENT_SCHEMA_REGISTRY.getField('light', 'intensity')?.commandType).toBe(
      'light-update',
    );
    expect(MODEL_COMPONENT_SCHEMA_REGISTRY.getField('camera', 'fov')?.commandType).toBe(
      'camera-set',
    );
  });
});
