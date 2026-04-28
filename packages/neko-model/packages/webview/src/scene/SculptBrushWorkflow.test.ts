import { describe, expect, it, vi } from 'vitest';
import {
  SculptBrushStrokeController,
  encodeBrushSamples,
  modelingWebSocketUrl,
} from './SculptBrushWorkflow';
import type { VertexBrushPatch } from '@neko/shared';

describe('SculptBrushWorkflow', () => {
  it('encodes brush samples as f32 payload values', () => {
    const payload = encodeBrushSamples([{ x: 0.25, y: 0.75, pressure: 0.5 }], {
      radius: 12,
      strength: 0.4,
      falloff: 0.8,
    });
    const values = new Float32Array(payload.buffer);

    expect(Array.from(values).map((value) => Number(value.toFixed(3)))).toEqual([
      0.25, 0.75, 0.5, 12, 0.4, 0.8,
    ]);
  });

  it('accumulates stroke samples, sends binary patch metadata, and creates prediction', () => {
    const sent: VertexBrushPatch[] = [];
    const createPrediction = vi.fn();
    const recordPatchBytes = vi.fn();
    const controller = new SculptBrushStrokeController({
      viewportId: 'main',
      sceneRevision: 4,
      sessionId: 'session-a',
      meshId: 'mesh-a',
      characterId: 'character-a',
      topologyVersion: 8,
      nextSeq: () => 20,
      settings: { radius: 10, strength: 0.5, falloff: 0.75 },
      client: { sendPatch: (patch) => sent.push(patch) },
      createPrediction,
      recordPatchBytes,
    });

    controller.beginStroke('stroke-a');
    controller.addSample({ x: 0.1, y: 0.2, pressure: 0.3 });
    controller.addSample({ x: 0.3, y: 0.4, pressure: 0.5 });
    const flush = controller.flush();

    expect(flush).toMatchObject({ seq: 20, strokeId: 'stroke-a', sampleCount: 2 });
    expect(sent[0]).toMatchObject({
      sessionId: 'session-a',
      meshId: 'mesh-a',
      topologyVersion: 8,
      strokeId: 'stroke-a',
      seq: 20,
      encoding: 'f32-delta',
      affectedStart: 0,
      affectedCount: 2,
    });
    expect(createPrediction).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'brush',
        seq: 20,
        sessionId: 'session-a',
        topologyVersion: 8,
      }),
    );
    expect(recordPatchBytes).toHaveBeenCalledWith(48);
  });

  it('builds session-scoped modeling websocket urls', () => {
    expect(modelingWebSocketUrl(3912, 'session a')).toBe(
      'ws://127.0.0.1:3912/v1/scenes/modeling/session%20a',
    );
  });
});
