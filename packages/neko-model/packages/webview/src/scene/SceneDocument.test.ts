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
