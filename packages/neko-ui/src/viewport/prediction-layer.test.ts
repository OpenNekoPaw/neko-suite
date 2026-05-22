import { describe, expect, it } from 'vitest';
import type { ViewportEvent, ViewportFrameMeta } from '@neko/shared';
import { ViewportPredictionLayer } from './prediction-layer';

describe('ViewportPredictionLayer', () => {
  it('manages create, update, commit, rollback, timeout, and topology invalidation', () => {
    const layer = new ViewportPredictionLayer();
    const transform = layer.create({
      kind: 'transform',
      seq: 10,
      correlationId: 'cmd-10',
      sceneId: 'scene-a',
      viewportId: 'main',
      baseRevision: 2,
      targetId: 'node-1',
      payload: { x: 1 },
      nowMs: 100,
      timeoutMs: 50,
    });

    expect(transform.status).toBe('active');
    expect(layer.update(transform.id, { payload: { y: 2 } }, 120)?.payload).toEqual({
      x: 1,
      y: 2,
    });

    expect(layer.commit(transform.id, 130)[0]?.prediction.status).toBe('committed');
    expect(layer.active()).toHaveLength(0);

    const morph = layer.create({
      kind: 'morph',
      seq: 11,
      sceneId: 'scene-a',
      viewportId: 'main',
      baseRevision: 3,
      topologyVersion: 7,
      payload: { morphId: 'Smile', weight: 0.5 },
      nowMs: 200,
    });
    expect(layer.rollback(morph.seq, 210)[0]?.reason).toBe('manual');
    expect(layer.active()).toHaveLength(0);

    layer.create({
      kind: 'brush',
      seq: 12,
      sceneId: 'scene-a',
      viewportId: 'main',
      baseRevision: 3,
      sessionId: 'sculpt-1',
      topologyVersion: 7,
      payload: { strokeId: 'stroke-1' },
      nowMs: 300,
      timeoutMs: 10,
    });
    expect(layer.timeout(320)[0]?.prediction.status).toBe('timed-out');
    expect(layer.active()).toHaveLength(0);

    layer.create({
      kind: 'topology',
      seq: 13,
      sceneId: 'scene-a',
      viewportId: 'main',
      baseRevision: 4,
      topologyVersion: 7,
    });
    expect(layer.invalidate({ topologyVersion: 8 }, 400, 'topology')[0]?.reason).toBe('topology');
    expect(layer.active()).toHaveLength(0);
  });

  it('reconciles predictions through ack, error, resync events, and frame metadata', () => {
    const layer = new ViewportPredictionLayer();
    layer.create({
      kind: 'selection',
      seq: 41,
      sceneId: 'scene-a',
      viewportId: 'main',
      baseRevision: 5,
    });
    layer.create({
      kind: 'transform',
      seq: 42,
      sceneId: 'scene-a',
      viewportId: 'main',
      baseRevision: 5,
    });
    layer.create({
      kind: 'camera',
      seq: 43,
      sceneId: 'scene-a',
      viewportId: 'side',
      baseRevision: 5,
    });

    const ack = event({ ackSeq: 42, appliedSeq: 42, status: 'ack' });
    expect(layer.reconcileEvent(ack, 500).map((item) => item.prediction.seq)).toEqual([41, 42]);
    expect(layer.active().map((item) => item.seq)).toEqual([43]);

    const sideFrame = frame({ viewportId: 'side', appliedSeq: 43, revision: 5 });
    expect(layer.reconcileFrameMeta(sideFrame, 520)[0]?.reason).toBe('frame');
    expect(layer.active()).toHaveLength(0);

    layer.create({
      kind: 'transform',
      seq: 44,
      sceneId: 'scene-a',
      viewportId: 'main',
      baseRevision: 6,
    });
    expect(
      layer.reconcileEvent(
        event({
          ackSeq: 44,
          status: 'error',
          error: { code: 'revisionConflict', message: 'stale revision' },
        }),
        600,
      )[0]?.prediction.status,
    ).toBe('rolled-back');

    layer.create({
      kind: 'ik',
      seq: 45,
      sceneId: 'scene-a',
      viewportId: 'main',
      baseRevision: 6,
    });
    expect(layer.reconcileEvent(event({ ackSeq: 0, status: 'resync' }), 700)[0]?.reason).toBe(
      'resync',
    );
  });

  it('invalidates active predictions when an authoritative frame supersedes their base revision', () => {
    const layer = new ViewportPredictionLayer();
    layer.create({
      kind: 'overlay',
      seq: 20,
      sceneId: 'scene-a',
      viewportId: 'main',
      baseRevision: 9,
    });

    expect(layer.reconcileFrameMeta(frame({ revision: 10, appliedSeq: 0 }), 900)[0]?.reason).toBe(
      'revision',
    );
  });
});

function event(patch: Partial<ViewportEvent>): ViewportEvent {
  return {
    protocolVersion: 1,
    domain: 'viewport',
    event: 'viewport:ack',
    sceneId: 'scene-a',
    viewportId: 'main',
    ackSeq: 0,
    revision: 5,
    timestamp: 100,
    status: 'ack',
    payload: {},
    ...patch,
  };
}

function frame(patch: Partial<ViewportFrameMeta>): ViewportFrameMeta {
  return {
    protocolVersion: 1,
    streamId: 'stream-main',
    sceneId: 'scene-a',
    viewportId: 'main',
    frameId: 1,
    ptsUs: 0,
    durationUs: 16666,
    frameTimestamp: 100,
    revision: 5,
    appliedSeq: 0,
    viewTransform: [1, 0, 0, 1, 0, 0],
    ...patch,
  };
}
